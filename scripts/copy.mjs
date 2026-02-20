/**
 * Copy workers from either local or workspace to the build directory.
 */

import fs from 'fs'
import path from 'path'
import { copyFolderRecursive, sep } from './util.mjs'
import { interfaceDir, rootDir, workerPaths } from './env.mjs'

if (process.argv.length > 5 && process.argv.slice(2).includes('--from') && process.argv.slice(2).includes('--to')) {
    const fromIndex = process.argv.indexOf('--from') + 1
    const toIndex = process.argv.indexOf('--to') + 1
    const fromPath = process.argv[fromIndex]
    const toPath = process.argv[toIndex]
    if (!fs.existsSync(fromPath)) {
        console.error(`Source path ${fromPath} does not exist.`)
    } else {
        // If target path does not exist, create it.
        if (!fs.existsSync(toPath)) {
            console.info(`Creating missing target path ${toPath}.`)
            fs.mkdirSync(toPath, { recursive: true })
        }
        // If the source path is a directory, copy it recursively. If it's a file, copy it directly.
        if (fs.lstatSync(fromPath).isDirectory()) {
            copyFolderRecursive(fromPath, toPath)
        } else {
            console.info(`Copying file ${fromPath} to ${toPath}.`)
            fs.copyFileSync(fromPath, toPath)
        }
    }
} else {
    // Default to copying compiled assets.
    console.info('Copying compiled assets...')
    const dest = path.join(rootDir, interfaceDir, 'dist')
    if (!fs.existsSync(dest)) {
        console.info(`Creating missing dist directory.`)
        fs.mkdirSync(dest, { recursive: true })
    }
    const onlyOhif = process.argv[2] === 'ohif'
    const onlyWorkers = process.argv[2] === 'workers'
    if (!onlyWorkers) {
        const folder = process.argv.length > 3 && process.argv.slice(3).includes('--prod') ? 'build' : 'public'
        // Copy all compiled OHIF viewer files into the ohif directory under public assets.
        const ohifDest = path.join(rootDir, interfaceDir, folder, 'ohif')
        if (!fs.existsSync(ohifDest)) {
            console.info(`Creating missing ohif directory.`)
            fs.mkdirSync(ohifDest, { recursive: true })
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
            fs.mkdirSync(workersPath, { recursive: true })
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
            fs.mkdirSync(epicPath, { recursive: true })
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
}
