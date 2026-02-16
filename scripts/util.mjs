/**
 * Dependency utilities.
 */
import fs from 'fs'
import path from 'path'

export const sep = path.sep
/**
 * Recursively copy the contents of the folder from `root` to the `dest`.
 * @param {string} root - Root folder of the items to copy.
 * @param {string} dest - Copy destination.
 * @param {string} path - Current copy path relative to `root` (optional, defaults to the `root`).
 * @param {string[]} extensions - List of file extensions to copy (optional, defaults to all files).
 */
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
 * Delete the folder and all of its contents.
 * @param {string} path - Path of the folder to delete.
 *
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
/**
 * Dependency packages as a Map of:
 * ```
 * key: {
 *      name<sring>: name of the folder to install the package in,
 *      branch<sring>?: name of the git branch to check out,
 *      prebuild<sring[]>: list of commands to run before building the package,
 *      rename<boolean>?: rename the install folder to match the `name` parameter,
 *      repository<sring>: URL to a git repository,
 * }
 * // Or
 * ```
 */
export const dependencies = new Map([
    // Utilities must be installed first.
    ['util', {
        packages: [
            { name: 'scoped-event-log' },
            { name: 'scoped-event-bus' },
            { name: 'asymmetric-io-mutex' },
        ],
        repository: 'https://github.com/sam-19',
    }],
    ['epicurrents', {
        packages: [
            // { branch: '', name: 'package-name', repository: '' },
            // Core must be the first @epicurrents module.
            { name: 'core' },
            // Resource modules.
            { name: 'doc-module' },
            { name: 'eeg-module' },
            { name: 'emg-module' },
            { name: 'ncs-module' },
            { name: 'tab-module' },
            // Source type readers.
            { name: 'api-reader' },
            { name: 'dicom-reader' },
            { name: 'edf-reader', branch: 'encoder' },
            { name: 'htm-reader' },
            {
                name: 'pdf-reader',
                prebuild: [
                    //'xcopy node_modules\\pdfjs-dist node_modules\\@epicurrents\\pdf-reader\\node_modules\\pdfjs-dist /s /i', // Windows
                    'cp -r node_modules/pdfjs-dist node_modules/@epicurrents/pdf-reader/node_modules/pdfjs-dist', // Unix
                ],
            },
            //{ name: 'synergy-reader' },
            { name: 'wav-reader' },
            // Services.
            { name: 'onnx-service' },
            { name: 'pyodide-service' },
        ],
        repository: 'https://github.com/epicurrents',
    }],
    /** There is only one interface. */
    ['interface', {
        branch: 'main',
        name: 'interface',
        /** Run these commands before building the package. */
        prebuild: [
            'npm run copy:workers',
        ],
        /** Rename the package to the map item key value (here 'interface'). */
        rename: true,
        repository: 'https://github.com/epicurrents/interface',
    }],
    /** Add OHIF viewer last. */
    ['ohif', {
        branch: '3.9/nextcloud',
        external: true,
        name: 'ohif',
        rename: true,
        repository: 'https://github.com/epicurrents/ohif-viewers.git',
    }],
])

export const interfaceDir = 'interface'
export const rootDir = import.meta.dirname.replace(/[\/\\]scripts\/?$/, '')

export const workerPaths = [
    ['node_modules', '@epicurrents', 'api-reader', 'umd'],
    ['node_modules', '@epicurrents', 'dicom-reader', 'umd'],
    ['node_modules', '@epicurrents', 'edf-reader', 'umd'],
    ['node_modules', '@epicurrents', 'htm-reader', 'umd'],
    ['node_modules', '@epicurrents', 'pdf-reader', 'umd'],
    ['node_modules', '@epicurrents', 'wav-reader', 'umd'],
    ['node_modules', '@epicurrents', 'pyodide-service', 'umd'],
    // The other modules may contained compiled core package workers.
    // Copy core last to overwrite any such previously copied files.
    ['node_modules', '@epicurrents', 'core', 'umd'],
]
