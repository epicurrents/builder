/**
 * Build existing packages from source.
 *
 * Scope the run positionally (`epicurrents`, `epicurrents/core`) or to an edition with
 * `--profile <name>`.
 * @package    epicurrents/builder
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

import fs from 'fs'
import { getScopeComponents, run, sep } from './util.mjs'
import { packages, rootDir } from './env.mjs'
import { resolveSelection } from './profile.mjs'

export function buildDependency (pkg, dir) {
    const pkgDir = [dir, pkg.name].join(sep)
    if (!fs.existsSync(pkgDir) || !fs.lstatSync(pkgDir).isDirectory()) {
        console.warn(`Package ${pkg.name} directory does not exist, skipping.`)
        return
    }
    if (pkg.external) {
        console.info(`Package ${pkg.name} is external, manual build required.`)
        return
    }
    const epicModDir = [pkgDir, 'node_modules', '@epicurrents'].join(sep)
    if (fs.existsSync(epicModDir) && fs.lstatSync(epicModDir).isDirectory()) {
        console.error(`Package ${pkg.name} has a separate @epicurrents module, please clean it first.`)
        return
    }
    console.debug(`Building package ${pkg.name}.`)
    run('npm run build', pkgDir)
    console.debug(`Package ${pkg.name} built.`)
}
console.info("Building packages...")
const { scopes, includes } = await resolveSelection()
for (const [key, value] of packages) {
    for (const [namespace, pkgName] of getScopeComponents(...scopes)) {
        if ((namespace === key || namespace === 'all') || !namespace.length) {
            if (Object.hasOwn(value, 'packages')) {
                const { packages } = value
                packages.forEach(pkg => {
                    if ((pkg.name === pkgName || !pkgName?.length) && includes(key, pkg.name)) {
                        buildDependency(pkg, `${[rootDir, key].join(sep)}`)
                    }
                })
            } else if (Object.hasOwn(value, 'name')) {
                if (includes(key, value.name)) {
                    buildDependency(value, rootDir)
                }
            }
        }
    }
}
console.info("Done building packages.")
