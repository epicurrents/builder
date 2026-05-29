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
 * Get a list of package namespaces and names from a list of scopes passed as command line arguments.
 * Scopes can be passed as `namespace` or `namespace/package` to get all packages in a namespace or a specific package,
 * respectively.
 * @param  {...any} scopes - One or more scopes.
 * @returns {Array} - An array of arrays, each containing the namespace and package name. Will always return at least one array with an empty string if no scopes are provided.
 */
export function getScopeComponents (...scopes) {
    const components = []
    for (const scope of scopes) {
        components.push(scope.split('/'))
    }
    return components.length ? components : [['']]
}
