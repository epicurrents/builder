/**
 * Install NPM packages for all packages. Installed packages should be cleaned of
 * conflicting @epicurrents namespace packages afterwards.
 *
 * Scope the run positionally (`epicurrents`) or to an edition with `--profile <name>`.
 * @package    epicurrents/builder
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import fs from 'fs'
import { run, sep } from './util.mjs'
import { packages, rootDir } from './env.mjs'
import { resolveSelection } from './profile.mjs'

export function installDependency (pkg, dir = rootDir) {
    const pkgDir = [dir, pkg.name].join(sep)
    if (!fs.existsSync(pkgDir) || !fs.lstatSync(pkgDir).isDirectory()) {
        console.warn(`Package ${pkg.name} directory does not exist, skipping.`)
        return
    }
    if (pkg.external) {
        console.info(`Package ${pkg.name} is external, manual installation required.`)
        return
    }
    console.debug(`Installing package ${pkgDir}.`)
    run('npm i', pkgDir)
    console.debug(`Package ${pkg.name} installed.`)
}

console.info("Installing packages...")
const { scopes, includes } = await resolveSelection()
for (const [key, value] of packages) {
    if ((scopes.includes(key) || scopes.includes('all') || !scopes.length)) {
        if (Object.hasOwn(value, 'packages')) {
            const { packages } = value
            packages.forEach(pkg => {
                if (!includes(key, pkg.name)) {
                    return
                }
                installDependency(pkg, `${[rootDir, key].join(sep)}`)
            })
        } else if (Object.hasOwn(value, 'name')) {
            if (!includes(key, value.name)) {
                continue
            }
            installDependency(value, rootDir)
        }
    }
}
console.info("Installing packages complete.")
