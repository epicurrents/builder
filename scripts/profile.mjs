/**
 * Build-profile loader.
 *
 * A profile is a named selection of packages (an "edition") from the master
 * registry in env.mjs, plus the viewer SETUP config that edition ships with. It
 * is the input to a release: `eeg`, `emg`, `full`, etc. Public profiles live in
 * `profiles/`; private ones — which may reference non-public packages — go in
 * the gitignored `profiles/local/` subfolder.
 *
 * Passing `--profile <name>` (or `--profile=<name>`) to any workspace script
 * restricts the operation to that edition's packages. Without `--profile`, every
 * registered package is used — the all-in developer default, unchanged.
 *
 * A profile module default-exports:
 * ```
 * export default {
 *     label: 'EEG',                       // human-readable edition name
 *     packages: ['eeg-module', ...],      // names selected from env.mjs
 *     setup: { activeModules: ['eeg'] },  // viewer SETUP for the bundle (see note)
 * }
 * ```
 * `core`, the `util` group and the `interface` group are always included, so a
 * profile lists only the modules/readers/services its edition needs. The `setup`
 * field describes the interface bundle configuration; it is consumed by the
 * interface build once config-driven module registration lands (viewer ROADMAP
 * Level 1) and is carried here now so the profile format is stable.
 */
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { packages, rootDir } from './env.mjs'

const PROFILES_DIR = path.join(rootDir, 'profiles')

/** Groups included in every build regardless of profile. */
const INFRA_GROUPS = new Set(['util', 'interface'])
/** Individual packages included in every build regardless of profile. */
const INFRA_PACKAGES = new Set(['core'])

/** Read the `--profile <name>` / `--profile=<name>` argument from argv, or null. */
export function getProfileArg (argv = process.argv.slice(2)) {
    const flag = argv.indexOf('--profile')
    if (flag !== -1 && argv[flag + 1] && !argv[flag + 1].startsWith('--')) {
        return argv[flag + 1]
    }
    const inline = argv.find(a => a.startsWith('--profile='))
    return inline ? inline.slice('--profile='.length) : null
}

/** Flatten the env.mjs registry into a `name -> { group, ...descriptor }` map. */
function registryIndex () {
    const index = new Map()
    for (const [group, value] of packages) {
        if (Array.isArray(value.packages)) {
            for (const pkg of value.packages) {
                index.set(pkg.name, { group, ...pkg })
            }
        } else if (value.name) {
            index.set(value.name, { group, ...value })
        }
    }
    return index
}

/**
 * Load a profile by name. Public `profiles/<name>.mjs` is checked first, then the
 * gitignored `profiles/local/<name>.mjs`. Throws with a clear message if the
 * profile is missing, malformed, names an unknown package, or (when public) pulls
 * a package marked `public: false` in env.mjs.
 */
export async function loadProfile (name) {
    const candidates = [
        path.join(PROFILES_DIR, `${name}.mjs`),
        path.join(PROFILES_DIR, 'local', `${name}.mjs`),
    ]
    const file = candidates.find(f => fs.existsSync(f))
    if (!file) {
        throw new Error(`Build profile '${name}' not found. Looked for:\n  ${candidates.join('\n  ')}`)
    }
    const profile = (await import(pathToFileURL(file).href)).default
    if (!profile || !Array.isArray(profile.packages)) {
        throw new Error(`Profile '${name}' (${file}) must default-export an object with a 'packages' array.`)
    }
    const isPublic = !file.includes(`${path.sep}local${path.sep}`)
    const index = registryIndex()
    for (const pkgName of profile.packages) {
        const entry = index.get(pkgName)
        if (!entry) {
            throw new Error(`Profile '${name}' names unknown package '${pkgName}' (not in env.mjs).`)
        }
        if (isPublic && entry.public === false) {
            throw new Error(
                `Public profile '${name}' names non-public package '${pkgName}'. Move this profile to ` +
                `profiles/local/, or publish the package before shipping the edition.`
            )
        }
    }
    return { name, ...profile }
}

/**
 * Build a predicate deciding whether a `(group, packageName)` pair belongs to the
 * given profile. A null profile includes everything — the all-in default.
 */
export function makePackageFilter (profile) {
    if (!profile) {
        return () => true
    }
    const selected = new Set(profile.packages)
    return (group, pkgName) => {
        if (INFRA_GROUPS.has(group) || INFRA_PACKAGES.has(pkgName)) {
            return true
        }
        return selected.has(pkgName)
    }
}

/** Resolve the active profile from argv, or null when no `--profile` is given. */
export async function resolveProfile (argv = process.argv.slice(2)) {
    const name = getProfileArg(argv)
    return name ? await loadProfile(name) : null
}
