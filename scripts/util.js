/**
 * Dependency utilities.
 */
import fs from 'fs'
import path from 'path'

export const sep = path.sep
export function copyFolderRecursive (root, dest, path = '', extensions = []) {
    const sourcePath = path.length ? [root, path].join(sep) : root
    if (fs.existsSync(sourcePath) && fs.lstatSync(sourcePath).isDirectory()) {
        fs.readdirSync(sourcePath).forEach((item) => {
            const curPath = [sourcePath, item].join(sep)
            const targetPath = [dest, path, item].join(sep)
            if (fs.lstatSync(curPath).isDirectory()) {
                if (!fs.existsSync(targetPath)) {
                    console.debug(`Creating target directory '${targetPath}'.`)
                    fs.mkdirSync(targetPath)
                }
                copyFolderRecursive(root, dest, [path, item].join(sep))
            } else if (!extensions.length || extensions.some(ext => item.endsWith(ext))) {
                console.debug(path.length ? `Copying file '${item}' to '${path}'.` : `Copying file '${item}'.`)
                fs.copyFileSync(curPath, targetPath)
            }
        })
    } else if (!fs.existsSync(path)) {
        console.warn(`Directory ${path} does not exist.`)
    } else {
        console.warn(`${path} is not a directory.`)
    }
}
/**
 * Original method from https://stackoverflow.com/a/52526549.
 */
export function deleteFolderRecursive (path) {
    if (fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
        fs.readdirSync(path).forEach((item) => {
            const curPath = [path, item].join(sep)
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath)
            } else {
                fs.unlinkSync(curPath)
            }
        })
        console.debug(`Deleting directory '${path}'.`)
        fs.rmdirSync(path)
    } else if (!fs.existsSync(path)) {
        console.warn(`Directory ${path} does not exist.`)
    } else {
        console.warn(`${path} is not a directory.`)
    }
}

export const dependencies = new Map([
    // Utilities must be installed first.
    ['util', {
        packages: [
            { name: 'asymmetric-io-mutex' },
            { name: 'scoped-event-bus' },
            { name: 'scoped-event-log' },
        ],
        repository: 'https://github.com/sam-19',
    }],
    /** There is only one interface. This package will be renamed 'interface' after it has been cloned. */
    ['interface', {
        name: 'interface',
        repository: 'https://github.com/epicurrents/vite-interface',
    }],
    ['epicurrents', {
        packages: [
            // { branch: '', name: 'package-name', repository: '' },
            // Core must be the first @epicurrents module.
            { name: 'core', branch: 'workspace' },
            // Resource modules.
            { name: 'doc-module', branch: 'workspace' },
            { name: 'eeg-module', branch: 'workspace' },
            { name: 'emg-module', branch: 'workspace' },
            // Source type readers.
            { name: 'edf-reader', branch: 'workspace' },
            { name: 'htm-reader', branch: 'workspace' },
            { name: 'pdf-reader', branch: 'workspace' },
            // Services.
            { name: 'onnx-service', branch: 'workspace' },
            { name: 'pyodide-service', branch: 'workspace' },
        ],
        repository: 'https://github.com/epicurrents',
    }],
    /** Add OHIF viewer last. */
    ['ohif', {
        branch: 'release/3.9',
        external: true,
        name: 'ohif',
        repository: 'https://github.com/OHIF/Viewers.git',
    }],
])

export const interfaceDir = 'interface'
export const rootDir = import.meta.dirname.replace(/scripts\/?$/, '')

export const workerPaths = [
    ['node_modules', '@epicurrents', 'edf-reader', 'umd'],
    ['node_modules', '@epicurrents', 'htm-reader', 'umd'],
    ['node_modules', '@epicurrents', 'pdf-reader', 'umd'],
    ['node_modules', '@epicurrents', 'pyodide-service', 'umd'],
    // The other modules may contained compiled core package workers.
    // Copy core last to overwrite any such previously copied files.
    ['node_modules', '@epicurrents', 'core', 'umd'],
]
