/**
 * When compiling the entire application, especially in development, it is benefitial to use
 * the same package versions for all the modules. Removing the separate packages will force
 * Node to use the packages present in this module.
 *
 * Packages must be cleaned every time new NPM packages are installed or removed in any of
 * the submodules.
 */

import fs from 'fs'
import { deleteFolderRecursive, sep } from './util.mjs'
import { packages, rootDir } from './env.mjs'

export function cleanDependency (pkg, dir = rootDir) {
    // Delete separate @epicurrents packages to guarantee version match across packages.
    deleteFolderRecursive([dir, pkg.name, 'node_modules', '@epicurrents'].join(sep))
    // Delete separate EventBus and Log packages so the global Log points to the same object.
    deleteFolderRecursive([dir, pkg.name, 'node_modules', 'scoped-event-bus'].join(sep))
    deleteFolderRecursive([dir, pkg.name, 'node_modules', 'scoped-event-log'].join(sep))
    // Delete separate asymmetric-io-mutex copies so submodules pick up the workspace's freshly
    // built dist instead of the one frozen at last `npm i`. Otherwise changes inside
    // `util/asymmetric-io-mutex/` propagate to the root `node_modules` symlink but not to the
    // per-package copies, leading to silent stale-dist bugs that look like the workspace build
    // didn't run.
    deleteFolderRecursive([dir, pkg.name, 'node_modules', 'asymmetric-io-mutex'].join(sep))
}

console.info("Cleaning dependency modules...")
for (const [key, value] of packages) {
    const limit = process.argv[2]
    const validScopes = ['epicurrents', 'interface']
    if (!validScopes.includes(key) || (limit && limit !== key)) {
        // Only epicurrents modules have packages to clean.
        continue
    }
    const destDir = [rootDir, key].join(sep)
    if (!fs.existsSync(destDir) || !fs.lstatSync(destDir).isDirectory()) {
        console.info(`Directory ${key} does not exist, skipping.`)
        continue
    }
    if (value.packages) {
        value.packages.forEach(pkg => {
            cleanDependency(pkg, destDir)
        })
    } else {
        cleanDependency(value, destDir)
    }
}
console.info("Cleaning dependency modules complete.")
