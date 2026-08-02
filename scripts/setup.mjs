/**
 * Clone, install and build the chosen set of packages, fetching the latest versions directly from
 * their repositories.
 *
 * Scope the run positionally (`epicurrents`, `epicurrents/core`) or to an edition with
 * `--profile <name>`; `--manifest <file>` checks out the exact commits a release manifest pins.
 * Without a profile every package published from a public source is set up; add `--include-private`
 * for a maintainer's full working tree. `external` packages (e.g. the OHIF viewer) are skipped unless
 * `--include-external` is passed, which clones them only — their install and build stay manual.
 *
 * Original method from https://stackoverflow.com/a/20643568.
 * @package    epicurrents/builder
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import fs from 'fs'
import { deleteFolderRecursive, run, sep } from './util.mjs'
import { packages, rootDir } from './env.mjs'
import { resolveSelection } from './profile.mjs'

export function initializeDependency (pkg, repository, parent, ref, includeExternal = false) {
    // External packages (heavy out-of-monorepo repos, e.g. the OHIF viewer) are skipped by default —
    // they are large and only some editions need them. Pass `--include-external` to clone them. Checked
    // before cloning, not after, so the default setup never pulls them.
    if (pkg.external && !includeExternal) {
        console.info(`Package ${pkg.name} is marked external, skipping (pass --include-external to clone it).`)
        return
    }
    if (!fs.existsSync(parent)) {
        console.info(`Creating missing parent directory ${parent}.`)
        fs.mkdirSync(parent, { recursive: true })
    }
    const pkgDir = [parent, pkg.name].join(sep)
    const pkgRepo = pkg.rename ? `${repository} ${pkg.name}` : `${repository}/${pkg.name}`
    if (fs.existsSync(pkgDir) && fs.lstatSync(pkgDir).isDirectory()) {
        console.info(`Package ${pkg.name} already exists, fetching from remote.`)
        run('git fetch --all', pkgDir)
    } else {
        console.info(`Cloning package ${pkg.name}.`)
        try {
            run(`git clone ${pkgRepo}`, parent)
        } catch (error) {
            throw new Error(
                `Could not clone ${pkg.name} from ${repository}. If this repository is not public, ` +
                `mark the package \`public: false\` in scripts/env.mjs and select it from a profile in ` +
                `profiles/local/ instead of setting up every package.\n${error.message}`
            )
        }
    }
    // Check out the pinned commit (manifest reproduction) or the package's branch.
    // A pinned commit is checked out detached and NOT pulled; a branch is pulled.
    const target = ref || pkg.branch || 'main'
    console.info(`Checking out ${ref ? `commit ${ref}` : `branch ${target}`} for package ${pkg.name}.`)
    run(`git checkout ${target}`, pkgDir)
    if (!ref) {
        console.info(`Pulling updates from remote.`)
        run('git pull --all', pkgDir)
    }
    // External packages are cloned (when opted in above) but never installed or built by our toolchain —
    // they have their own (e.g. OHIF uses yarn with a bespoke procedure). Install and build them manually.
    if (pkg.external) {
        console.info(`Package ${pkg.name} is external — cloned only; install and build it manually.`)
        return
    }
    console.info(`Installing package ${pkg.name}.`)
    run('npm i', pkgDir)
    // Remove local epicurrents packages, event bus and log before building to use the same version in all packages.
    if (!pkg.external) {
        const localCore = [pkgDir, 'node_modules', '@epicurrents'].join(sep)
        if (fs.existsSync(localCore) && fs.lstatSync(localCore).isDirectory()) {
            console.debug(`Deleting local core from package.`)
            deleteFolderRecursive(localCore)
        }
        const localMtx = [pkgDir, 'node_modules', 'asymmetric-io-mutex'].join(sep)
        if (fs.existsSync(localMtx) && fs.lstatSync(localMtx).isDirectory()) {
            console.debug(`Deleting local mutex from package.`)
            deleteFolderRecursive(localMtx)
        }
        const localBus = [pkgDir, 'node_modules', 'scoped-event-bus'].join(sep)
        if (fs.existsSync(localBus) && fs.lstatSync(localBus).isDirectory()) {
            console.debug(`Deleting local event bus from package.`)
            deleteFolderRecursive(localBus)
        }
        const localLog = [pkgDir, 'node_modules', 'scoped-event-log'].join(sep)
        if (fs.existsSync(localLog) && fs.lstatSync(localLog).isDirectory()) {
            console.debug(`Deleting local log from package.`)
            deleteFolderRecursive(localLog)
        }
    }
    // Run possible prebuild steps.
    if (pkg.prebuild?.length) {
        console.info('Running prebuild steps.')
        for (const step of pkg.prebuild) {
            run(step)
        }
        console.info('Prebuild steps complete.')
    }
    console.info(`Building package ${pkg.name}.`)
    run(pkg.build || 'npm run build', pkgDir)
    console.info(`Package ${pkg.name} initialized.`)
}

console.info("Cloning and initializing missing packages...")
const { scopes, options, includes } = await resolveSelection()
// External packages (marked `external` in env.mjs) are cloned only when this flag is passed.
const includeExternal = options.get('include-external') === true
// Optional reproducibility manifest: pin every listed package to its exact commit.
const manifestPath = options.get('manifest')
let pins = null
if (manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    pins = new Map(manifest.packages.map(p => [p.name, p.commit]))
    console.info(`Reproducing from manifest '${manifestPath}' (edition ${manifest.edition}, ${pins.size} pinned packages).`)
}
let initialized = 0
for (const [key, value] of packages) {
    if (!Object.hasOwn(value, 'repository')) {
        console.error(`No repository found for ${key}.`)
        continue
    }
    if ((scopes.map(s => s.split('/')[0]).includes(key) || scopes.includes('all') || !scopes.length)) {
        const scopeLimit = scopes.map(s => s.split('/')).find(s => s[0] === key)
        if (Object.hasOwn(value, 'packages')) {
            const { packages, repository } = value
            packages.forEach(pkg => {
                if (scopeLimit && scopeLimit[1] && scopeLimit[1] !== pkg.name) {
                    return
                }
                if (!includes(key, pkg.name)) {
                    return
                }
                initializeDependency(pkg, repository, `${[rootDir, key].join(sep)}`, pins?.get(pkg.name), includeExternal)
                initialized++
            })
        } else if (Object.hasOwn(value, 'name')) {
            if (scopeLimit && scopeLimit[1] && scopeLimit[1] !== value.name) {
                continue
            }
            if (!includes(key, value.name)) {
                continue
            }
            initializeDependency(value, value.repository, rootDir, pins?.get(value.name), includeExternal)
            initialized++
        }
    }
}
if (!initialized) {
    // A scope that matches no package is a mistake, not an empty success: it used to exit 0 having
    // done nothing, which made a mis-parsed `--profile` value look like a completed setup.
    throw new Error(
        scopes.length
            ? `No packages matched the given scope (${scopes.join(', ')}). Scopes are a group ` +
              `(${[...packages.keys()].join(', ')}) or <group>/<package>.`
            : 'No packages matched. Check the profile and the package registry in scripts/env.mjs.'
    )
}
// Link the freshly cloned packages into the workspace once, after they all exist.
console.info('Installing workspace dependencies.')
run('npm install', rootDir)
console.info("Done initializing packages.")
