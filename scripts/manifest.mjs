/**
 * Generate a reproducibility manifest for the active edition.
 *
 * For every package an edition uses (the profile's packages plus the always-
 * included core / util / interface), records the repository and the exact commit
 * currently checked out, plus the builder's own commit. The commit is the pin: a
 * later `npm run setup -- --manifest <file>` checks out these exact SHAs, so the
 * edition rebuilds from identical sources without depending on any npm version bump.
 *
 * Sources, not the whole dependency graph: setup installs each package with `npm i`
 * against its own lockfile, so third-party dependency resolution is pinned only as
 * far as those lockfiles pin it. Identical first-party code, not a byte-identical
 * bundle.
 *
 * Run after setup + build: `EPI_PROFILE=<name> node scripts/manifest.mjs`. The
 * edition version comes from `EPI_VERSION` (the release tag sets it); it is null
 * for a plain development manifest. Output: `dist/<profile>/manifest.json`.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { packages, rootDir } from './env.mjs'
import { getProfileArg, loadProfile, makePackageFilter } from './profile.mjs'

const name = process.env.EPI_PROFILE || getProfileArg(process.argv.slice(2))
const profile = name ? await loadProfile(name) : null
const includes = makePackageFilter(profile)
const editionName = profile ? profile.name : 'default'

/** Read `git <args>` in `dir`, trimmed, or null on failure. */
function git (dir, args) {
    try {
        return execSync(`git -C "${dir}" ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
        return null
    }
}

/**
 * Rewrite a git remote into its public HTTPS form.
 *
 * A manifest is published for other people to rebuild from, but the remote is read from whatever
 * checkout happened to produce the build — typically SSH on a maintainer's machine, which nobody
 * else can clone. The commit is the pin either way; this only makes the URL usable.
 * @param {string|null} url - Remote URL as git reports it.
 */
function publicRemote (url) {
    if (!url) {
        return url
    }
    const ssh = url.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?$/)
    if (ssh) {
        return `https://${ssh[1]}/${ssh[2]}`
    }
    return url.replace(/\.git$/, '')
}

/** Resolve the repo + pinned commit for a cloned package, or null if unavailable. */
function pin (dir, pkg) {
    if (!fs.existsSync(dir)) {
        console.warn(`Package ${pkg.name} not found at ${dir} — run setup for this profile first.`)
        return null
    }
    const commit = git(dir, 'rev-parse HEAD')
    if (!commit) {
        console.warn(`Package ${pkg.name} at ${dir} is not a git checkout — skipping.`)
        return null
    }
    return {
        name: pkg.name,
        repository: publicRemote(git(dir, 'remote get-url origin')),
        branch: git(dir, 'rev-parse --abbrev-ref HEAD'),
        commit,
    }
}

const pins = []
for (const [group, value] of packages) {
    if (Array.isArray(value.packages)) {
        for (const pkg of value.packages) {
            if (!includes(group, pkg.name)) {
                continue
            }
            const entry = pin(path.join(rootDir, group, pkg.name), pkg)
            if (entry) {
                pins.push(entry)
            }
        }
    } else if (value.name) {
        if (!includes(group, value.name)) {
            continue
        }
        const entry = pin(path.join(rootDir, value.name), value)
        if (entry) {
            pins.push(entry)
        }
    }
}
pins.sort((a, b) => a.name.localeCompare(b.name))

const manifest = {
    edition: editionName,
    version: process.env.EPI_VERSION || null,
    generated: new Date().toISOString(),
    builder: {
        repository: publicRemote(git(rootDir, 'remote get-url origin')),
        commit: git(rootDir, 'rev-parse HEAD'),
    },
    packages: pins,
}

const outDir = path.join(rootDir, 'dist', editionName)
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'manifest.json')
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n')
console.info(`Wrote ${outFile} (${pins.length} pinned packages).`)
