/**
 * CSV reader worker factory. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import csvWorkerSrc from '@epicurrents/csv-reader/workers/csv.worker.js?raw'

/** CSV reader (accelerometry, tabular). */
export const csvWorker = () => inlineWorker('CsvWorker', csvWorkerSrc).create()
