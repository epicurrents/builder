/**
 * Update existing packages from repository.
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

export function updateDependency (pkg, dir = rootDir) {
    const pkgDir = [dir, pkg.name].join(sep)
    if (!fs.existsSync(pkgDir) || !fs.lstatSync(pkgDir).isDirectory()) {
        console.warn(`Package ${pkg.name} directory does not exist, skipping.`)
        return
    }
    console.debug(`Updating package ${pkg.name}.`)
    run('git pull --all', pkgDir)
    // Checkout custom branch, if needed.
    if (pkg.branch) {
        console.info(`Checking out branch ${pkg.branch} for package ${pkg.name}.`)
        run(`git checkout ${pkg.branch}`, pkgDir)
    }
    console.debug(`Package ${pkg.name} updated.`)
}

console.info("Updating packages...")
const { scopes, includes } = await resolveSelection()
for (const [key, value] of packages) {
    if ((scopes.includes(key) || scopes.includes('all') || !scopes.length)) {
        if (Object.hasOwn(value, 'packages')) {
            const { packages } = value
            packages.forEach(pkg => {
                if (!includes(key, pkg.name)) {
                    return
                }
                updateDependency(pkg, `${[rootDir, key].join(sep)}`)
            })
        } else if (Object.hasOwn(value, 'name')) {
            if (!includes(key, value.name)) {
                continue
            }
            updateDependency(value, rootDir)
        }
    }
}
console.info("Done updating packages.")
