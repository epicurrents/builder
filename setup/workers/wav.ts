/**
 * WAV reader worker factory. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import wavWorkerSrc from '@epicurrents/wav-reader/workers/wav.worker.js?raw'

/** WAV reader (EMG). */
export const wavWorker = () => inlineWorker('WavWorker', wavWorkerSrc).create()
