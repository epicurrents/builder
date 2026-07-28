/**
 * EDF/BDF reader worker factory. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import edfWorkerSrc from '@epicurrents/edf-reader/workers/edf.worker.js?raw'

/** EDF/BDF reader. */
export const edfWorker = () => inlineWorker('EdfWorker', edfWorkerSrc).create()
