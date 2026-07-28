/**
 * Core worker factories.
 *
 * Each package ships a self-contained UMD worker bundle under `./workers/*`; they are loaded as
 * raw source strings (Vite `?raw`) and wrapped by `inlineWorker` into classic Blob workers. The
 * builder's vite config resolves the `?raw` specifiers to each package's `umd/` bundle.
 *
 * These come from `@epicurrents/core`, which every edition includes. Reader workers live beside
 * them in one file per reader, so that a registrar — and therefore an edition — pulls in only the
 * reader packages it actually uses. Bundle trimming cannot save an unused reader here: rollup has
 * to resolve a static import before it can tree-shake what the import provides, so a single shared
 * module importing every reader makes every edition depend on every reader package being installed.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'

import memWorkerSrc from '@epicurrents/core/workers/memory-manager.worker.js?raw'
import montWorkerSrc from '@epicurrents/core/workers/montage.worker.js?raw'
import trendWorkerSrc from '@epicurrents/core/workers/trend.worker.js?raw'

/** Shared memory manager (SAB signal buffers). */
export const memWorker = () => inlineWorker('MemoryManagerWorker', memWorkerSrc).create()
/** Montage derivation + filtering. */
export const montWorker = () => inlineWorker('MontageWorker', montWorkerSrc).create()
/** Biosignal trend (aEEG, …) computation. */
export const trendWorker = () => inlineWorker('TrendWorker', trendWorkerSrc).create()
