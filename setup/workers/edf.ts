/**
 * EDF/BDF reader and writer worker factories. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import edfWorkerSrc from '@epicurrents/edf-reader/workers/edf.worker.js?raw'
import edfWriterWorkerSrc from '@epicurrents/edf-reader/workers/edf.writer.worker.js?raw'

/** EDF/BDF reader. */
export const edfWorker = () => inlineWorker('EdfWorker', edfWorkerSrc).create()
/** EDF writer, which encodes an export off the main thread. */
export const edfWriterWorker = () => inlineWorker('EdfWriterWorker', edfWriterWorkerSrc).create()
