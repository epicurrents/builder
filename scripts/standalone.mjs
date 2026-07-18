/**
 * Emit a self-contained standalone `index.html` into an edition's lib output.
 *
 * The lib build (vite.config.lib.ts) produces
 * `dist/<profile>/epicurrents-lib.{umd.js,css}` plus its worker files. This writes
 * an `index.html` next to them that loads the UMD as a classic script and boots
 * the app, turning the lib folder into a deployable standalone edition. It loads
 * the UMD as a classic script deliberately — that avoids re-parsing the interface
 * dist as ESM (which would clash on vite's `__vitePreload` helper), so no
 * re-bundling is needed.
 *
 * Run after the lib build: `EPI_PROFILE=<name> node scripts/standalone.mjs`
 * (or via the `build:app` script, which chains the two).
 */
import fs from 'fs'
import path from 'path'
import { getProfileArg } from './profile.mjs'
import { rootDir } from './env.mjs'

const name = process.env.EPI_PROFILE || getProfileArg(process.argv.slice(2)) || 'default'
const dir = path.join(rootDir, 'dist', name)
const umd = path.join(dir, 'epicurrents-lib.umd.js')
if (!fs.existsSync(umd)) {
    console.error(`No lib build found at ${umd}. Run the lib build for this profile first.`)
    process.exit(1)
}
const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <title>Epicurrents</title>
    <link rel="stylesheet" href="./epicurrents-lib.css" />
    <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
        #epicurrents { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <div id="epicurrents"></div>
    <noscript>This application requires JavaScript.</noscript>
    <script src="./epicurrents-lib.umd.js"></script>
    <script>
        window.Epicurrents && window.Epicurrents.createEpicurrentsApp && window.Epicurrents.createEpicurrentsApp()
    </script>
</body>
</html>
`
fs.writeFileSync(path.join(dir, 'index.html'), html)
console.info(`Wrote standalone ${path.join(dir, 'index.html')}`)
