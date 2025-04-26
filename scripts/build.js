/**
 * Build existing dependencies from source.
 */

import fs from 'fs'
import { execSync } from 'child_process'
import { dependencies, rootDir, sep } from './util.js'

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
    execSync(`cd ${pkgDir} && npm run build`, { stdio: 'inherit' }, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error: ${err}`)
            return
        }
        //console.debug(`Out: ${stdout}`)
        console.error(`Error: ${stderr}`)
    })
    console.debug(`Package ${pkg.name} built.`)
}
console.info("Building dependencies...")
const scope = process.argv.slice(2).filter(s => s.length && !s.startsWith('--'))
for (const [key, value] of dependencies) {
    if ((scope.includes(key) || scope.includes('all') || !scope.length)) {
        if (Object.hasOwn(value, 'packages')) {
            const { packages } = value
            packages.forEach(pkg => {
                buildDependency(pkg, `${[rootDir, key].join(sep)}`)
            })
        } else if (Object.hasOwn(value, 'name')) {
            buildDependency(value, rootDir)
        }
    }
}
console.info("Done building dependencies.")
