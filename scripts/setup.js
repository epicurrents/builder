/**
 * This script initialiazes the chosen set of dependencies for development, cloning the latest
 * versions directly from repository.
 * Original method from https://stackoverflow.com/a/20643568.
 */

import fs from 'fs'
import { execSync } from 'child_process'
import { deleteFolderRecursive, dependencies, rootDir, sep } from './util.js'

// Do not run setup if the epicurrents module namespace exists.
//if (fs.existsSync(epicRoot) && fs.lstatSync(epicRoot).isDirectory()) {
//    console.error(`Module root ${epicRoot} already exists. You must delete module root to run setup.`)
//    process.exit(1)
//}

export function initializeDependency (pkg, repository, parent) {
    if (!fs.existsSync(parent)) {
        console.info(`Creating missing parent directory ${parent}.`)
        execSync(`mkdir ${parent}`, { stdio: 'inherit' })
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
    // Checkout custom branch or main branch (in case we were on custom branch before).
    const branch = pkg.branch || 'main'
    console.info(`Checking out branch ${branch} for package ${pkg.name}.`)
    execSync(`cd ${pkgDir} && git checkout ${branch}`, { stdio: 'inherit' }, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error changing branch: ${err}`)
            return
        }
        console.error(`Error changing branch: ${stderr}`)
    })
    console.info(`Pulling updates from remote.`)
    execSync(`cd ${pkgDir} && git pull --all`, { stdio: 'inherit' }, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error pulling from remote: ${err}`)
            return
        }
        console.error(`Error pulling from remote: ${stderr}`)
    })
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
    // Remove local epicurrents packages, event bus and log before building to use the same version in all dependencies.
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

console.info("Cloning and initializing missing dependencies...")
const scope = process.argv.slice(2).filter(s => s.length && !s.startsWith('--'))
for (const [key, value] of dependencies) {
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
                initializeDependency(pkg, repository, `${[rootDir, key].join(sep)}`)
            })
        } else if (Object.hasOwn(value, 'name')) {
            if (scopeLimit && scopeLimit[1] && scopeLimit[1] !== value.name) {
                continue
            }
            initializeDependency(value, value.repository, rootDir)
        }
        execSync('npm install --if-present', { stdio: 'inherit' })
    }
}
console.info("Done initializing dependencies.")
