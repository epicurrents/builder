/**
 * Pyodide analysis worker factory.
 *
 * The inlining contract is the same as the reader workers': the pre-built bundle
 * is imported as a raw source string and wrapped in a Blob URL by `inlineWorker`,
 * so the edition ships one self-contained file with no separate worker fetch.
 *
 * Two things differ from every other worker here. It is spawned as a MODULE
 * worker, because Pyodide ≥0.27/314 ships an ES module and dynamic-imports
 * `pyodide.mjs` at runtime — a classic worker cannot load it. And the instance is
 * memoised rather than created per call: starting the interpreter is expensive,
 * and every override that targets `pyodide` is meant to address the same one.
 * Creation is deferred to the first call so an edition that never activates the
 * service never starts an interpreter.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import pyoWorkerSrc from '@epicurrents/pyodide-service/workers/pyodide.worker.js?raw'

let instance: Worker | null = null

/** Python interpreter (Pyodide), created once and shared. */
export const pyodideWorker = () => {
    if (!instance) {
        instance = inlineWorker('PyodideWorker', pyoWorkerSrc, 'module').create()
    }
    return instance
}
