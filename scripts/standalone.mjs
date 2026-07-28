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
 * Run after the lib build: `EPI_PROFILE=<name> node scripts/standalone.mjs`. Normally you do not
 * run it directly — `scripts/edition.mjs` (`npm run build:edition`) resolves the profile once and
 * chains the lib build and this step so both target the same edition.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
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
        // Report a failed or incomplete lib load instead of leaving a blank page: the container is
        // empty either way, so a silent guard here is indistinguishable from the app not starting.
        if (window.Epicurrents && window.Epicurrents.createEpicurrentsApp) {
            window.Epicurrents.createEpicurrentsApp()
        } else {
            document.getElementById('epicurrents').textContent =
                'Could not start Epicurrents: epicurrents-lib.umd.js did not load, or loaded without ' +
                'createEpicurrentsApp. Check that it sits next to this page and the console for errors.'
            console.error('Epicurrents: epicurrents-lib.umd.js did not expose createEpicurrentsApp.')
        }
    </script>
</body>
</html>
`
fs.writeFileSync(path.join(dir, 'index.html'), html)
console.info(`Wrote standalone ${path.join(dir, 'index.html')}`)
