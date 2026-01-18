/**
 * When compiling the entire application, especially in development, it is benefitial to use
 * the same package versions for all the modules. Removing the separate packages will force
 * Node to use the packages present in this module.
 *
 * Packages must be cleaned every time new NPM packages are installed or removed in any of
 * the submodules.
 */

import fs from 'fs'
import { deleteFolderRecursive, dependencies, rootDir, sep } from './util.mjs'

export function cleanDependency (pkg, dir = rootDir) {
    // Delete separate @epicurrents packages to guarantee version match across dependencies.
    deleteFolderRecursive([dir, pkg.name, 'node_modules', '@epicurrents'].join(sep))
    // Delete separate EventBus and Log packages so the global Log points to the same object.
    deleteFolderRecursive([dir, pkg.name, 'node_modules', 'scoped-event-bus'].join(sep))
    deleteFolderRecursive([dir, pkg.name, 'node_modules', 'scoped-event-log'].join(sep))
}

console.info("Cleaning dependency modules...")
for (const [key, value] of dependencies) {
    const limit = process.argv[2]
    const validScopes = ['epicurrents', 'interface']
    if (!validScopes.includes(key) || (limit && limit !== key)) {
        // Only epicurrents modules have dependencies to clean.
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
