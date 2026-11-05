/**
 * Static server for a built edition and the generated fixtures.
 *
 * Serves `dist/<edition>/` at `/` and `e2e/.fixtures/` at `/fixtures/`, and the same fixtures at
 * `/slow-fixtures/` with every response held back in proportion to its size (`E2E_SLOW_MS_PER_MB`,
 * default 250), so a test can see what a viewer does while a large read is still on its way. Every response carries the
 * cross-origin isolation headers, because the SharedArrayBuffer cache only exists in an isolated page
 * and a test that runs without it exercises the substitute reader instead of the one an isolated
 * deployment uses. Byte ranges are answered, so the URL importers read a fixture as they read a
 * remote file.
 *
 * Usage: `node server.mjs [edition] [port]`. The edition defaults to `E2E_EDITION`, then `psg`, and the
 * port to `E2E_PORT`, then 4173. It runs until stopped, so it serves a manual session as well as the
 * tests, which reuse a server already listening on their port.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const edition = process.argv[2] || process.env.E2E_EDITION || 'psg'
const port = Number(process.argv[3] || process.env.E2E_PORT || 4173)
const slowMsPerMb = Number(process.env.E2E_SLOW_MS_PER_MB || 250)
const roots = [
    ['/fixtures/', path.join(here, '.fixtures')],
    ['/slow-fixtures/', path.join(here, '.fixtures')],
    ['/', path.resolve(here, '..', 'dist', edition)],
]
const editionRoot = roots[roots.length - 1][1]
if (!fs.existsSync(path.join(editionRoot, 'index.html'))) {
    console.error(`No built edition at ${editionRoot}. Run \`npm run build:edition -- --profile ${edition}\`.`)
    process.exit(1)
}
const types = {
    '.css': 'text/css',
    '.edf': 'application/octet-stream',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
}

/** Map a request path to a file under one of the roots, or null when it escapes them. */
const resolve = (urlPath) => {
    for (const [prefix, root] of roots) {
        if (!urlPath.startsWith(prefix)) {
            continue
        }
        const rel = decodeURIComponent(urlPath.slice(prefix.length)) || 'index.html'
        const file = path.resolve(root, rel)
        return file.startsWith(root + path.sep) || file === root ? file : null
    }
    return null
}

/** Send bytes `start` to `end` of `file`, after the throttle delay when the request asked for one. */
const send = (res, file, start, end, slow) => {
    const stream = () => fs.createReadStream(file, { start, end }).pipe(res)
    if (slow) {
        setTimeout(stream, ((end - start + 1)/(1024*1024))*slowMsPerMb)
    } else {
        stream()
    }
}

http.createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://localhost').pathname
    const slow = urlPath.startsWith('/slow-fixtures/')
    const file = resolve(urlPath)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    res.setHeader('Cache-Control', 'no-store')
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end()
        return
    }
    const size = fs.statSync(file).size
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
    if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
        if (start > end || start >= size) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
            return
        }
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
        send(res, file, start, end, slow)
        return
    }
    res.writeHead(200, { 'Content-Length': size })
    send(res, file, 0, size - 1, slow)
}).listen(port, '127.0.0.1', () => {
    console.info(`Serving the '${edition}' edition at http://127.0.0.1:${port}/`)
    console.info(`Fixtures: http://127.0.0.1:${port}/fixtures/ (from ${roots[0][1]})`)
})
