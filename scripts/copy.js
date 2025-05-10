/**
 * Copy workers from either local or workspace to the build directory.
 */

import fs from 'fs'
import path from 'path'
import { copyFolderRecursive, interfaceDir, rootDir, sep, workerPaths } from './util.js'

console.info('Copying compiled assets...')
const dest = path.join(rootDir, interfaceDir, 'dist')
if (!fs.existsSync(dest)) {
    console.info(`Creating missing dist directory.`)
    fs.mkdirSync(dest)
}
const onlyOhif = process.argv[2] === 'ohif'
const onlyWorkers = process.argv[2] === 'workers'
if (!onlyWorkers) {
    const folder = process.argv.length > 3 && process.argv.slice(3).includes('--prod') ? 'build' : 'public'
    // Copy all compiled OHIF viewer files into the ohif directory under public assets.
    const ohifDest = path.join(rootDir, interfaceDir, folder, 'ohif')
    if (!fs.existsSync(ohifDest)) {
        console.info(`Creating missing ohif directory.`)
        fs.mkdirSync(ohifDest)
    }
    console.info(`Copying OHIF viewer files to ${ohifDest}...`)
    copyFolderRecursive(
        [rootDir, 'ohif', 'platform', 'app', 'dist'].join(sep),
        ohifDest,
    )
    console.info(`All OHIF viewer files copied to ${ohifDest}.`)
}
if (!onlyOhif) {
    // Copy compiled workers into the dedicated workers directory.
    const workersPath = path.join(dest, 'workers')
    if (!fs.existsSync(workersPath)) {
        console.info(`Creating missing workers directory.`)
        fs.mkdirSync(workersPath)
    }
    workerPaths.forEach(sourcePath => {
        copyFolderRecursive(
            path.join(rootDir, ...sourcePath),
            workersPath,
            '',
            ['.worker.js'],
        )
    })
}
if (!onlyOhif && !onlyWorkers) {
    // Copy all compiled assets and their license files into the epicurrents directory.
    const epicPath = path.join(dest, 'epicurrents')
    if (!fs.existsSync(epicPath)) {
        console.info(`Creating missing epicurrents directory.`)
        fs.mkdirSync(epicPath)
    }
    workerPaths.forEach(sourcePath => {
        copyFolderRecursive(
            path.join(rootDir, ...sourcePath),
            epicPath,
            '',
            ['.js', '.LICENSE.txt'],
        )
    })
}
console.info('Done copying compiled assets.')
