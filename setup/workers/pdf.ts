/**
 * PDF reader worker factory. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import pdfWorkerSrc from '@epicurrents/pdf-reader/workers/pdfjs.worker.js?raw'

/** pdfjs needs a Blob URL string (GlobalWorkerOptions.workerSrc), not a worker instance. */
export const pdfWorkerUrl = () => inlineWorker('PdfWorker', pdfWorkerSrc).url
