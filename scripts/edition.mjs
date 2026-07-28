/**
 * Build an edition end to end: the lib bundle, then the standalone `index.html` beside it.
 *
 * Both steps have to agree on which edition is being built, so the profile is resolved once here
 * and handed to them through `EPI_PROFILE`. Chaining the two as separate npm scripts could not do
 * that: npm appends `-- --profile eeg` to the last command in the chain only, so the lib build
 * emitted `dist/default/` while the standalone step looked in `dist/eeg/` and failed.
 *
 * Usage: `npm run build:edition -- --profile <name>`, or `EPI_PROFILE=<name> npm run build:edition`.
 * With neither, every registered modality is built into `dist/default/`.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import fs from 'fs'
import path from 'path'
import { run } from './util.mjs'
import { getProfileArg, loadProfile } from './profile.mjs'
import { rootDir } from './env.mjs'

const name = process.env.EPI_PROFILE || getProfileArg()
if (name) {
    // Fail on an unknown or non-public profile before spending a full bundle build on it.
    const profile = await loadProfile(name)
    console.info(`Building the '${profile.label || profile.name}' edition.`)
    process.env.EPI_PROFILE = name
} else {
    console.info('Building the default edition (every registered modality).')
}

// Assert the shared singletons before bundling. A duplicated core produces a bundle that builds and
// type-checks cleanly and then corrupts data at runtime, so this has to gate the build rather than
// be a step someone remembers to run.
run(`node ${path.join('scripts', 'depcheck.mjs')}`, rootDir)

const vite = path.join(rootDir, 'node_modules', '.bin', 'vite')
if (!fs.existsSync(vite)) {
    throw new Error(
        `Vite not found at ${vite}. Run \`npm install\` in the workspace root (or \`npm run setup\` ` +
        `if the packages have not been cloned yet).`
    )
}
run(`"${vite}" build --config vite.config.lib.ts`, rootDir)
run(`node ${path.join('scripts', 'standalone.mjs')}`, rootDir)
if (process.argv.includes('--release')) {
    // Same reason the two build steps live here: the manifest has to pin the edition that was
    // actually built, so it reads the profile this script already resolved.
    run(`node ${path.join('scripts', 'manifest.mjs')}`, rootDir)
}
