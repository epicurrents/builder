/**
 * DICOM reader worker factory. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import dcmWorkerSrc from '@epicurrents/dicom-reader/workers/dicom.worker.js?raw'

/** DICOM reader. */
export const dcmWorker = () => inlineWorker('DicomWorker', dcmWorkerSrc).create()
