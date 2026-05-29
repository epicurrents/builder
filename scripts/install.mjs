/**
 * Install NPM packages for all packages. Installed packages should be cleaned of
 * conflicting @epicurrents namespace packages afterwards.
 */

import fs from 'fs'
import { execSync } from 'child_process'
import { sep } from './util.mjs'
import { packages, rootDir } from './env.mjs'

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
    execSync(`cd ${pkgDir} && npm i`, { stdio: 'inherit' })
    console.debug(`Package ${pkg.name} installed.`)
}

console.info("Installing packages...")
const scope = process.argv.slice(2).filter(s => s.length && !s.startsWith('--'))
for (const [key, value] of packages) {
    if ((scope.includes(key) || scope.includes('all') || !scope.length)) {
        if (Object.hasOwn(value, 'packages')) {
            const { packages } = value
            packages.forEach(pkg => {
                installDependency(pkg, `${[rootDir, key].join(sep)}`)
            })
        } else if (Object.hasOwn(value, 'name')) {
            installDependency(value, rootDir)
        }
    }
}
console.info("Installing packages complete.")
