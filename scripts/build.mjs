/**
 * Build existing packages from source.
 */

import fs from 'fs'
import { execSync } from 'child_process'
import { getScopeComponents, sep } from './util.mjs'
import { packages, rootDir } from './env.mjs'

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
console.info("Building packages...")
const scopes = process.argv.slice(2).filter(s => s.length && !s.startsWith('--'))
for (const [key, value] of packages) {
    for (const [namespace, pkgName] of getScopeComponents(...scopes)) {
        if ((namespace === key || namespace === 'all') || !namespace.length) {
            if (Object.hasOwn(value, 'packages')) {
                const { packages } = value
                packages.forEach(pkg => {
                    if (pkg.name === pkgName || !pkgName?.length) {
                        buildDependency(pkg, `${[rootDir, key].join(sep)}`)
                    }
                })
            } else if (Object.hasOwn(value, 'name')) {
                buildDependency(value, rootDir)
            }
        }
    }
}
console.info("Done building packages.")
