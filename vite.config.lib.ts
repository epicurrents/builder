/**
 * Builder-owned library build — the official build path.
 *
 * Bundles the builder's config-driven setup (setup/index.ts) into a single
 * `epicurrents-lib.{js,css}` for the active edition. The interface (framework +
 * UI modules) and every `@epicurrents/*` package are consumed as BUILT packages
 * through the workspace `node_modules` — their `exports` maps resolve `dist`/`umd`
 * bundles, so no source aliases are needed. This is the release model: each
 * package is built first, then assembled here.
 *
 * Choose the edition with `--profile <name>` or `EPI_PROFILE=<name>`. The profile's
 * `setup` is injected as `__EPI_SETUP__` and drives which registrars run (see
 * setup/index.ts). Output goes to `dist/<profile>/`; a build with no profile emits
 * `dist/default/` and registers every available modality.
 */
import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'url'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { getProfileArg, loadProfile } from './scripts/profile.mjs'

const abs = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const ASSET_PATH = process.env.ASSET_PATH || '/'

/**
 * Trim the module registry to the active edition at build time (stage-2 bundle
 * trimming). setup/registry.ts statically imports every registrar so it stays
 * type-safe and usable un-trimmed; when a profile restricts the edition, this
 * replaces the file's contents with a registry importing only the active
 * modules' registrars, so rollup drops the unused registrars — and their
 * modules, readers and workers — from the bundle. An empty active list (the full
 * edition, or no profile) leaves the registry untouched.
 */
function trimRegistry (activeModules: string[]) {
    const registryFile = abs('./setup/registry.ts')
    const modulesDir = abs('./setup/modules')
    return {
        name: 'epi-trim-registry',
        enforce: 'pre' as const,
        load (id: string) {
            if (!activeModules.length) {
                return null
            }
            if (path.resolve(id.split('?')[0]) !== registryFile) {
                return null
            }
            const available = fs.readdirSync(modulesDir)
                .filter(f => f.endsWith('.ts'))
                .map(f => f.replace(/\.ts$/, ''))
            const active = available.filter(k => activeModules.includes(k))
            const fn = (k: string) => `register${k[0].toUpperCase()}${k.slice(1)}`
            const imports = active.map(k => `import { ${fn(k)} } from './modules/${k}'`).join('\n')
            const entries = active.map(k => `    ${k}: ${fn(k)},`).join('\n')
            return `${imports}\nexport const MODULE_REGISTRARS = {\n${entries}\n}\n`
        },
    }
}

export default defineConfig(async () => {
    const name = process.env.EPI_PROFILE || getProfileArg(process.argv.slice(2))
    const profile = name ? await loadProfile(name) : null
    const activeModules = profile?.setup?.activeModules ?? []
    return {
        base: ASSET_PATH,
        mode: 'production',
        build: {
            lib: {
                entry: abs('./setup/index.ts'),
                name: 'Epicurrents',
                fileName: 'epicurrents-lib',
            },
            minify: 'esbuild',
            outDir: abs(`./dist/${profile ? profile.name : 'default'}`),
            emptyOutDir: true,
            target: 'esnext',
        },
        esbuild: {
            supported: {
                'top-level-await': true,
            },
            keepNames: true,
        },
        optimizeDeps: {
            esbuildOptions: {
                target: 'esnext',
                keepNames: true,
            },
        },
        // Classic worker format — the UMD worker bundles use importScripts.
        worker: {
            format: 'iife',
        },
        plugins: [
            trimRegistry(activeModules),
            viteSingleFile(),
        ],
        define: {
            __INTLIFY_JIT_COMPILATION__: true,
            __EPI_SETUP__: profile ? JSON.stringify(profile.setup ?? {}) : 'undefined',
            'process.env.ASSET_PATH': JSON.stringify(ASSET_PATH),
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
        resolve: {
            alias: {
                'node-fetch': 'isomorphic-fetch',
                stream: 'stream-browserify',
            },
            preserveSymlinks: true,
        },
    }
})
