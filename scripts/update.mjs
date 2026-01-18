/**
 * Update existing dependencies from repository.
 */

import { execSync } from 'child_process'
import { dependencies, rootDir, sep } from './util.mjs'

export function updateDependency (pkg, dir = rootDir) {
    const pkgDir = [dir, pkg.name].join(sep)
    console.debug(`Updating package ${pkg.name}.`)
    execSync(`cd ${pkgDir} && git pull --all`, { stdio: 'inherit' }, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error: ${err}`)
            return
        }
        //console.debug(`Out: ${stdout}`)
        console.error(`Error: ${stderr}`)
    })
    // Checkout custom branch, if needed.
    if (pkg.branch) {
        console.info(`Checking out branch ${pkg.branch} for package ${pkg.name}.`)
        execSync(`cd ${pkgDir} && git checkout ${pkg.branch}`, { stdio: 'inherit' }, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error: ${err}`)
                return
            }
            console.error(`Error: ${stderr}`)
        })
    }
    console.debug(`Package ${pkg.name} updated.`)
}

console.info("Updating dependencies...")
const scope = process.argv.slice(2).filter(s => s.length && !s.startsWith('--'))
for (const [key, value] of dependencies) {
    if ((scope.includes(key) || scope.includes('all') || !scope.length)) {
        if (Object.hasOwn(value, 'packages')) {
            const { packages } = value
            packages.forEach(pkg => {
                updateDependency(pkg, `${[rootDir, key].join(sep)}`)
            })
        } else if (Object.hasOwn(value, 'name')) {
            updateDependency(value, rootDir)
        }
    }
}
console.info("Done updating dependencies.")
