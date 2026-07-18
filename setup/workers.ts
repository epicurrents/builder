/**
 * Worker factories for the builder setup.
 *
 * Each package ships a self-contained UMD worker bundle under `./workers/*`;
 * they are loaded here as raw source strings (Vite `?raw`) and wrapped by
 * `inlineWorker` into classic Blob workers. The builder's vite config resolves
 * the `?raw` specifiers to each package's `umd/` bundle.
 *
 * These are the workers the current registrars need; add a factory here when a
 * new modality registrar requires one. Until per-profile bundle trimming lands
 * (stage 2), every factory imported here is bundled regardless of the active
 * edition — correctness first, size second.
 */
import { inlineWorker } from '@epicurrents/core/util'

import memWorkerSrc from '@epicurrents/core/workers/memory-manager.worker.js?raw'
import montWorkerSrc from '@epicurrents/core/workers/montage.worker.js?raw'
import trendWorkerSrc from '@epicurrents/core/workers/trend.worker.js?raw'
import edfWorkerSrc from '@epicurrents/edf-reader/workers/edf.worker.js?raw'
import dcmWorkerSrc from '@epicurrents/dicom-reader/workers/dicom.worker.js?raw'
import csvWorkerSrc from '@epicurrents/csv-reader/workers/csv.worker.js?raw'
import mdWorkerSrc from '@epicurrents/htm-reader/workers/markdown.worker.js?raw'
import pdfWorkerSrc from '@epicurrents/pdf-reader/workers/pdfjs.worker.js?raw'

/** Shared memory manager (SAB signal buffers). */
export const memWorker = () => inlineWorker('MemoryManagerWorker', memWorkerSrc).create()
/** Montage derivation + filtering. */
export const montWorker = () => inlineWorker('MontageWorker', montWorkerSrc).create()
/** Biosignal trend (aEEG, …) computation. */
export const trendWorker = () => inlineWorker('TrendWorker', trendWorkerSrc).create()
/** EDF/BDF reader. */
export const edfWorker = () => inlineWorker('EdfWorker', edfWorkerSrc).create()
/** DICOM reader. */
export const dcmWorker = () => inlineWorker('DicomWorker', dcmWorkerSrc).create()
/** CSV reader (accelerometry, tabular). */
export const csvWorker = () => inlineWorker('CsvWorker', csvWorkerSrc).create()
/** Markdown reader. */
export const mdWorker = () => inlineWorker('MarkdownWorker', mdWorkerSrc).create()
/** PDF reader — pdfjs needs a Blob URL string (GlobalWorkerOptions.workerSrc), not a worker instance. */
export const pdfWorkerUrl = () => inlineWorker('PdfWorker', pdfWorkerSrc).url
