/**
 * Markdown / HTML document (HTM) edition registrar.
 *
 * Composes the core document module (registered under the `htm` key), the
 * markdown reader, and the interface document UI. See setup/index.ts for why this
 * composition lives in the builder rather than in a package.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import * as interfaceDocModule from '@epicurrents/interface/modules/doc'
import * as docModule from '@epicurrents/doc-module'
import { HtmImporter, MarkdownWorkerSubstitute } from '@epicurrents/htm-reader'
import { mdWorker } from '../workers/htm'

/** Register the document module (as `htm`), the markdown reader and the interface document UI. */
export const registerHtm = ({ app, useSAB, registerInterfaceModule }: SetupContext) => {
    app.registerModule('htm', docModule)
    const htmReader = new HtmImporter('markdown')
    htmReader.setWorkerOverride('markdown', () => {
        const docSAB = window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('doc.useMemoryManager')
        return useSAB && docSAB ? mdWorker() : new MarkdownWorkerSubstitute()
    })
    const htmLoader = new docModule.DocumentLoader('HTMLoader', 'htm', htmReader)
    app.registerStudyImporter('doc/htm-file', 'Open markdown file', 'file', htmLoader)
    app.registerStudyImporter('doc/htm-folder', 'Open markdown files from folder', 'folder', htmLoader)
    app.registerStudyImporter('doc/htm-url', 'Open markdown from URL', 'url', htmLoader)
    registerInterfaceModule('htm', interfaceDocModule)
}
