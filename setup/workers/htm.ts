/**
 * Document reader worker factories. See ./core.ts for the inlining contract.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { inlineWorker } from '@epicurrents/core/util'
import htmlWorkerSrc from '@epicurrents/htm-reader/workers/html.worker.js?raw'
import mdWorkerSrc from '@epicurrents/htm-reader/workers/markdown.worker.js?raw'

/** HTML reader. */
export const htmlWorker = () => inlineWorker('HtmlWorker', htmlWorkerSrc).create()

/** Markdown reader. */
export const mdWorker = () => inlineWorker('MarkdownWorker', mdWorkerSrc).create()
