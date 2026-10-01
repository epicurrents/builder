/**
 * Markdown / HTML document (HTM) edition registrar.
 *
 * Composes the core document module (registered under the `htm` key), the two document readers and
 * the interface document UI. See setup/index.ts for why this composition lives in the builder rather
 * than in a package.
 *
 * Each format gets its own importer, because a reader hands over the worker for the format it was
 * constructed with and a document module asks for that worker without naming a file.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import * as interfaceDocModule from '@epicurrents/interface/modules/doc'
import * as docModule from '@epicurrents/doc-module'
import { HtmImporter, HtmlWorkerSubstitute, MarkdownWorkerSubstitute } from '@epicurrents/htm-reader'
import { htmlWorker, mdWorker } from '../workers/htm'

/** Register the document module (as `htm`), both document readers and the interface document UI. */
export const registerHtm = ({ app, useSAB, registerInterfaceModule }: SetupContext) => {
    app.registerModule('htm', docModule)
    const inWorker = () => {
        return useSAB && window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('doc.useMemoryManager')
    }

    const mdReader = new HtmImporter('markdown')
    mdReader.setWorkerOverride('markdown', () => inWorker() ? mdWorker() : new MarkdownWorkerSubstitute())
    const mdLoader = new docModule.DocumentLoader('HTMLoader', 'htm', mdReader)
    app.registerStudyImporter('doc/htm-file', 'Open markdown file', 'file', mdLoader)
    app.registerStudyImporter('doc/htm-folder', 'Open markdown files from folder', 'folder', mdLoader)
    app.registerStudyImporter('doc/htm-url', 'Open markdown from URL', 'url', mdLoader)

    const htmlReader = new HtmImporter('html')
    htmlReader.setWorkerOverride('html', () => inWorker() ? htmlWorker() : new HtmlWorkerSubstitute())
    const htmlLoader = new docModule.DocumentLoader('HTMLLoader', 'htm', htmlReader)
    app.registerStudyImporter('doc/html-file', 'Open HTML file', 'file', htmlLoader)
    app.registerStudyImporter('doc/html-folder', 'Open HTML files from folder', 'folder', htmlLoader)
    app.registerStudyImporter('doc/html-url', 'Open HTML from URL', 'url', htmlLoader)

    registerInterfaceModule('htm', interfaceDocModule)
}
