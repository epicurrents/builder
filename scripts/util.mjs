/**
 * Dependency utilities.
 * @package    epicurrents/builder
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export const sep = path.sep
/**
 * Options that take their value as the following argument (`--profile eeg`) rather than inline
 * (`--profile=eeg`). Both forms are accepted; this set is what lets `parseArgs` consume the value
 * so it is not mistaken for a scope.
 */
const VALUE_OPTIONS = new Set(['profile', 'manifest', 'from', 'to'])
/**
 * Split command line arguments into named options and positional scopes.
 *
 * Every workspace script takes optional positional scopes (`epicurrents`, `epicurrents/core`) plus
 * named options (`--profile eeg`). Parsing them by hand is what made `--profile <name>` silently
 * select nothing: the value is not `--`-prefixed, so a naive filter left it in the scope list where
 * it matched no package group.
 * @param {string[]} argv - Arguments to parse (optional, defaults to the current process arguments).
 * @returns {{ options: Map<string, string|boolean>, scopes: string[] }} - Named options and positional scopes.
 */
export function parseArgs (argv = process.argv.slice(2)) {
    const options = new Map()
    const scopes = []
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (!arg.length) {
            continue
        }
        if (!arg.startsWith('--')) {
            scopes.push(arg)
            continue
        }
        const inline = arg.indexOf('=')
        if (inline !== -1) {
            options.set(arg.slice(2, inline), arg.slice(inline + 1))
            continue
        }
        const name = arg.slice(2)
        if (!VALUE_OPTIONS.has(name)) {
            options.set(name, true)
            continue
        }
        const value = argv[i + 1]
        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Option --${name} requires a value (use --${name} <value> or --${name}=<value>).`)
        }
        options.set(name, value)
        // Consume the value so the loop does not read it as a scope.
        i++
    }
    return { options, scopes }
}
/**
 * Run a shell command, throwing an error that names the command when it fails.
 *
 * `execSync` takes no callback, so a trailing error handler passed to it is never called; a failing
 * command throws instead. This wrapper turns that throw into a message that says which command
 * failed, which the callers then annotate with what they were trying to do.
 * @param {string} command - Command to run.
 * @param {string} cwd - Directory to run the command in (optional, defaults to the current directory).
 * @returns {Buffer} - Output of the command.
 */
export function run (command, cwd = undefined) {
    try {
        return execSync(command, { stdio: 'inherit', cwd: cwd })
    } catch (error) {
        const reason = typeof error.status === 'number' ? `exit code ${error.status}` : error.message
        throw new Error(`Command failed (${reason}): ${command}`)
    }
}
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
