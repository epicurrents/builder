/**
 * This script initialiazes the chosen set of packages for development, cloning the latest
 * versions directly from repository.
 * Original method from https://stackoverflow.com/a/20643568.
 */

import fs from 'fs'
import { execSync } from 'child_process'
import { deleteFolderRecursive, sep } from './util.mjs'
import { packages, rootDir } from './env.mjs'
import { resolveProfile, makePackageFilter } from './profile.mjs'

// Do not run setup if the epicurrents module namespace exists.
//if (fs.existsSync(epicRoot) && fs.lstatSync(epicRoot).isDirectory()) {
//    console.error(`Module root ${epicRoot} already exists. You must delete module root to run setup.`)
//    process.exit(1)
//}

export function initializeDependency (pkg, repository, parent, ref) {
    if (!fs.existsSync(parent)) {
        console.info(`Creating missing parent directory ${parent}.`)
        fs.mkdirSync(parent, { recursive: true })
    }
    const pkgDir = [parent, pkg.name].join(sep)
    const pkgRepo = pkg.rename ? `${repository} ${pkg.name}` : `${repository}/${pkg.name}`
    if (fs.existsSync(pkgDir) && fs.lstatSync(pkgDir).isDirectory()) {
        console.info(`Package ${pkg.name} already exists, fetching from remote.`)
        execSync(`cd ${pkgDir} && git fetch --all`, { stdio: 'inherit' }, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error fetching from remote: ${err}`)
                return
            }
            console.error(`Error fetching from remote: ${stderr}`)
        })
    } else {
        console.info(`Cloning package ${pkg.name}.`)
        execSync(`cd ${parent} && git clone ${pkgRepo}`, { stdio: 'inherit' }, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error cloning repository: ${err}`)
                return
            }
            console.error(`Error cloning repository: ${stderr}`)
        })
    }
    // Check out the pinned commit (manifest reproduction) or the package's branch.
    // A pinned commit is checked out detached and NOT pulled; a branch is pulled.
    const target = ref || pkg.branch || 'main'
    console.info(`Checking out ${ref ? `commit ${ref}` : `branch ${target}`} for package ${pkg.name}.`)
    execSync(`cd ${pkgDir} && git checkout ${target}`, { stdio: 'inherit' }, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error checking out: ${err}`)
            return
        }
        console.error(`Error checking out: ${stderr}`)
    })
    if (!ref) {
        console.info(`Pulling updates from remote.`)
        execSync(`cd ${pkgDir} && git pull --all`, { stdio: 'inherit' }, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error pulling from remote: ${err}`)
                return
            }
            console.error(`Error pulling from remote: ${stderr}`)
        })
    }
    // Stop here if it is an external package.
    if (pkg.external) {
        console.info(`Package ${pkg.name} is external, manual installation required.`)
        return
    }
    console.info(`Installing package ${pkg.name}.`)
    execSync(`cd ${pkgDir} && npm i`, { stdio: 'inherit' }, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error installing package: ${err}`)
            return
        }
        console.error(`Error installing package: ${stderr}`)
    })
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
            execSync(step, { stdio: 'inherit' }, (err, stdout, stderr) => {
                if (err) {
                    console.error(`Error in prebuild: ${err}`)
                    return
                }
                console.error(`Error in prebuild: ${stderr}`)
            })
        }
        console.info('Prebuild steps complete.')
    }
    console.info(`Building package ${pkg.name}.`)
    execSync(`cd ${pkgDir} && npm run build`, { stdio: 'inherit' }, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error building package: ${err}`)
            return
        }
        console.error(`Error building package: ${stderr}`)
    })
    console.info(`Package ${pkg.name} initialized.`)
}

console.info("Cloning and initializing missing packages...")
const scope = process.argv.slice(2).filter(s => s.length && !s.startsWith('--'))
const profile = await resolveProfile()
const includes = makePackageFilter(profile)
if (profile) {
    console.info(`Restricting to profile '${profile.label || profile.name}'.`)
}
// Optional reproducibility manifest: pin every listed package to its exact commit.
const manifestIndex = process.argv.indexOf('--manifest')
const manifestPath = manifestIndex !== -1 ? process.argv[manifestIndex + 1] : null
let pins = null
if (manifestPath) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    pins = new Map(manifest.packages.map(p => [p.name, p.commit]))
    console.info(`Reproducing from manifest '${manifestPath}' (edition ${manifest.edition}, ${pins.size} pinned packages).`)
}
for (const [key, value] of packages) {
    if (!Object.hasOwn(value, 'repository')) {
        console.error(`No repository found for ${key}.`)
        continue
    }
    if ((scope.map(s => s.split('/')[0]).includes(key) || scope.includes('all') || !scope.length)) {
        const scopeLimit = scope.map(s => s.split('/')).find(s => s[0] === key)
        if (Object.hasOwn(value, 'packages')) {
            const { packages, repository } = value
            packages.forEach(pkg => {
                if (scopeLimit && scopeLimit[1] && scopeLimit[1] !== pkg.name) {
                    return
                }
                if (!includes(key, pkg.name)) {
                    return
                }
                initializeDependency(pkg, repository, `${[rootDir, key].join(sep)}`, pins?.get(pkg.name))
            })
        } else if (Object.hasOwn(value, 'name')) {
            if (scopeLimit && scopeLimit[1] && scopeLimit[1] !== value.name) {
                continue
            }
            if (!includes(key, value.name)) {
                continue
            }
            initializeDependency(value, value.repository, rootDir, pins?.get(value.name))
        }
        execSync('npm install --if-present', { stdio: 'inherit' })
    }
}
console.info("Done initializing packages.")
