/**
 * Markdown reader worker factory. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import mdWorkerSrc from '@epicurrents/htm-reader/workers/markdown.worker.js?raw'

/** Markdown reader. */
export const mdWorker = () => inlineWorker('MarkdownWorker', mdWorkerSrc).create()
