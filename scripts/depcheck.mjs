/**
 * Verify that every shared singleton package resolves to exactly one installed copy.
 *
 * The core runtime and the shared utilities must exist once in a tree. Two copies give two class
 * identities, so `instanceof` fails across the boundary, and a worker built against one copy can
 * disagree with the main thread about a buffer layout. Both failures are silent: the build
 * succeeds, every type-check passes, and the corruption appears at runtime as mismatched data or a
 * method that is missing from an object that plainly has it.
 *
 * Declaring these packages as `peerDependencies` is what normally prevents it — npm refuses to nest
 * a second copy to satisfy a peer, and fails the install instead. This check exists because that
 * guarantee can be switched off without any visible signal: `npm install --legacy-peer-deps`, or
 * npm 6, restores the old nesting behaviour and resolves the conflict silently. A CI job that adds
 * the flag to work around an unrelated error dissolves the protection with it, so the invariant is
 * asserted here rather than assumed.
 *
 * Run standalone with `npm run check:deps`; the edition build runs it before bundling.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { rootDir } from './env.mjs'

/**
 * Packages that carry runtime identity and must resolve to a single copy. Ordinary dependencies are
 * not listed: two copies of a parser are wasteful, not incorrect.
 */
const SINGLETONS = [
    '@epicurrents/core',
    'asymmetric-io-mutex',
    'scoped-event-bus',
    'scoped-event-log',
]

/** Directories whose `node_modules` may hold a nested copy shadowing the workspace one. */
function packageRoots () {
    const roots = []
    for (const group of ['epicurrents', 'util']) {
        const dir = path.join(rootDir, group)
        if (!fs.existsSync(dir)) {
            continue
        }
        for (const name of fs.readdirSync(dir)) {
            roots.push(path.join(dir, name))
        }
    }
    roots.push(path.join(rootDir, 'interface'))
    return roots.filter(r => fs.existsSync(path.join(r, 'node_modules')))
}

/**
 * Installed locations of a package, as npm resolves them. One line per physical copy.
 *
 * npm exits non-zero both when a package is absent and when the tree is in the very state this
 * check exists to catch, so its exit code says nothing useful on its own and the filesystem is
 * consulted separately. Whatever paths it does print are still real installs and are merged in.
 * @param {string} name - Package name.
 */
function installedPaths (name) {
    try {
        const out = execSync(`npm ls ${name} --all --parseable`, {
            cwd: rootDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        })
        return out.split('\n').map(l => l.trim()).filter(Boolean)
    } catch (error) {
        return (error.stdout || '').split('\n').map(l => l.trim()).filter(Boolean)
    }
}

/**
 * Every distinct copy of a package, keyed by the location it really occupies on disk.
 *
 * Paths are resolved through symlinks before being compared. The workspace install is itself a
 * symlink into the package checkout, and npm also links packages into each other's `node_modules`,
 * so comparing the paths as written would report a duplicate for what is one directory reached two
 * ways. Only a separate real directory is a genuine second copy.
 * @param {string} name - Package name.
 * @returns {Map<string, string>} - Real path to the path it was discovered as.
 */
function copiesOf (name) {
    const segments = name.split('/')
    const candidates = [
        ...installedPaths(name),
        path.join(rootDir, 'node_modules', ...segments),
        ...packageRoots().map(root => path.join(root, 'node_modules', ...segments)),
    ]
    const copies = new Map()
    for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) {
            continue
        }
        const real = fs.realpathSync(candidate)
        if (!copies.has(real)) {
            copies.set(real, candidate)
        }
    }
    return copies
}

let failed = 0
for (const name of SINGLETONS) {
    const copies = copiesOf(name)
    if (!copies.size) {
        // A profile-scoped setup legitimately installs only part of the registry.
        console.info(`· ${name} — not installed, skipping`)
        continue
    }
    // The workspace install is the copy that belongs there; anything else shadows it.
    const workspace = path.join(rootDir, 'node_modules', ...name.split('/'))
    const expected = fs.existsSync(workspace) ? fs.realpathSync(workspace) : null
    const duplicates = [...copies].filter(([real]) => real !== expected)
    if (!duplicates.length) {
        console.info(`✓ ${name}`)
        continue
    }
    failed++
    const plural = duplicates.length === 1 ? 'copy' : 'copies'
    console.error(
        expected
            ? `✗ ${name} — ${duplicates.length} duplicate ${plural} shadowing the workspace install:`
            : `✗ ${name} — no workspace install, but ${duplicates.length} ${plural} found:`
    )
    if (expected) {
        console.error(`    workspace  ${workspace}`)
    }
    for (const [, discovered] of duplicates) {
        console.error(`    duplicate  ${discovered}`)
    }
}

if (failed) {
    console.error(
        `\n${failed} shared ${failed === 1 ? 'package is' : 'packages are'} installed more than once. ` +
        `Run \`node scripts/clean.mjs\` to delete the nested copies, then \`npm install\` in the ` +
        `workspace root.\n` +
        `If this appeared after an install, check that neither --legacy-peer-deps nor npm 6 was ` +
        `used: both silently nest a second copy instead of failing on a peer conflict.`
    )
    process.exit(1)
}
console.info(`\nChecked ${SINGLETONS.length} shared packages: one copy each.`)
