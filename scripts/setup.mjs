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
 * `--profile` and `--include-private` are read by `resolveSelection` in `scripts/profile.mjs`, which returns the
 * package filter applied below. Through npm, options must follow `--` (`npm run setup -- --include-private`);
 * placed before it, npm takes them as its own config and they never reach this script.
 *
 * The run has three phases and their order is the point: every selected package is cloned, then the
 * workspace is installed once, then each package is built. Installing inside a package as it arrives
 * instead reconciles the root lock file against whichever members exist at that moment, so entries for
 * packages not yet cloned are pruned and re-resolved against their ranges once they do arrive. The lock
 * file then pins only what the last install happened to need, and two setups of the same commits
 * resolve different dependency versions.
 *
 * `--frozen-lockfile` installs with `npm ci`, which resolves nothing the lock file does not already
 * pin and so cannot drift. It requires the lock file to describe exactly the workspace on disk, which
 * holds for a selection of every public package and not for a tree carrying private ones as well, so a
 * release build passes it and a maintainer's working tree does not.
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

/**
 * Clone a package and check out the requested ref, leaving it uninstalled and unbuilt.
 * @param {object} pkg - Package entry from the registry in `scripts/env.mjs`.
 * @param {string} repository - Repository or owner URL the package is cloned from.
 * @param {string} parent - Directory the package is cloned into.
 * @param {string} [ref] - Exact commit to check out detached; a branch is checked out and pulled instead.
 * @param {boolean} [includeExternal] - Whether to clone packages marked `external`.
 * @returns {boolean} - Whether this package is installed and built by our toolchain.
 */
export function cloneDependency (pkg, repository, parent, ref, includeExternal = false) {
    // External packages (heavy out-of-monorepo repos, e.g. the OHIF viewer) are skipped by default —
    // they are large and only some editions need them. Pass `--include-external` to clone them. Checked
    // before cloning, not after, so the default setup never pulls them.
    if (pkg.external && !includeExternal) {
        console.info(`Package ${pkg.name} is marked external, skipping (pass --include-external to clone it).`)
        return false
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
        return false
    }
    return true
}

/**
 * Build an already cloned and installed package, after its prebuild steps.
 *
 * The shared singletons are deleted from the package first. A workspace install links them from the
 * sibling checkout rather than fetching them, so nothing is normally there to delete; a copy that does
 * appear means a package declares a range the checked-out sibling does not satisfy, and building
 * against it would embed a second core.
 * @param {object} pkg - Package entry from the registry in `scripts/env.mjs`.
 * @param {string} parent - Directory the package was cloned into.
 */
export function buildDependency (pkg, parent) {
    const pkgDir = [parent, pkg.name].join(sep)
    for (const shared of ['@epicurrents', 'asymmetric-io-mutex', 'scoped-event-bus', 'scoped-event-log']) {
        const installed = [pkgDir, 'node_modules', shared].join(sep)
        if (fs.existsSync(installed) && fs.lstatSync(installed).isDirectory()) {
            console.debug(`Deleting ${shared} installed inside ${pkg.name}.`)
            deleteFolderRecursive(installed)
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
// The selection, in registry order, which is dependency order: the shared utilities, then core and
// the packages that embed it, then the interface. The build phase below walks it unchanged.
const selected = []
// Packages a scope named explicitly but the selection filter excluded — reported if nothing ran.
const excluded = []
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
                    if (scopeLimit?.[1] === pkg.name) {
                        excluded.push(pkg)
                    }
                    return
                }
                selected.push({ pkg, repository, parent: [rootDir, key].join(sep), ref: pins?.get(pkg.name) })
            })
        } else if (Object.hasOwn(value, 'name')) {
            if (scopeLimit && scopeLimit[1] && scopeLimit[1] !== value.name) {
                continue
            }
            if (!includes(key, value.name)) {
                if (scopeLimit?.[1] === value.name) {
                    excluded.push(value)
                }
                continue
            }
            selected.push({ pkg: value, repository: value.repository, parent: rootDir, ref: pins?.get(value.name) })
        }
    }
}
if (!selected.length && excluded.length) {
    // The package exists in the registry but the selection left it out; say why rather than reporting
    // an unknown scope. npm treats an option placed before `--` as its own config and exposes it only as
    // an `npm_config_*` variable, so the flag can be typed and still never reach this script.
    const names = excluded.map(pkg => pkg.name).join(', ')
    const hint = excluded.some(pkg => pkg.public === false)
        ? process.env.npm_config_include_private
            ? ' The --include-private flag was consumed by npm; pass it after `--`: ' +
              `npm run setup -- ${scopes.join(' ')} --include-private`
            : ' It is marked `public: false` in scripts/env.mjs; pass --include-private or select it from a ' +
              'profile in profiles/local/.'
        : ' It is not part of the selected profile.'
    throw new Error(`Package ${names} matched the scope but was excluded from the selection.${hint}`)
}
if (!selected.length) {
    // A scope that matches no package is a mistake, not an empty success: it used to exit 0 having
    // done nothing, which made a mis-parsed `--profile` value look like a completed setup.
    throw new Error(
        scopes.length
            ? `No packages matched the given scope (${scopes.join(', ')}). Scopes are a group ` +
              `(${[...packages.keys()].join(', ')}) or <group>/<package>.`
            : 'No packages matched. Check the profile and the package registry in scripts/env.mjs.'
    )
}
const buildable = []
for (const { pkg, repository, parent, ref } of selected) {
    if (cloneDependency(pkg, repository, parent, ref, includeExternal)) {
        buildable.push({ pkg, parent })
    }
}
// Once, after every selected package exists. Both halves of that matter: a workspace install resolves
// each member's dependencies, so no package needs one of its own, and a lock file can only hold the
// tree it was written for if the whole tree is present when it is read.
const frozen = options.get('frozen-lockfile') === true
console.info(`Installing workspace dependencies${frozen ? ' from the lock file' : ''}.`)
run(frozen ? 'npm ci' : 'npm install', rootDir)
for (const { pkg, parent } of buildable) {
    buildDependency(pkg, parent)
}
console.info("Done initializing packages.")
