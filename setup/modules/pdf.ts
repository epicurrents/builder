/**
 * PDF document (PDF) edition registrar.
 *
 * Composes the core document module (registered under the `pdf` key), the PDF
 * reader, and the interface PDF UI. The PDF reader runs on the main thread and
 * only needs a pdfjs worker URL, so there is no SAB worker override. See
 * setup/index.ts for why this composition lives in the builder.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import * as interfacePdfModule from '@epicurrents/interface/modules/pdf'
import * as docModule from '@epicurrents/doc-module'
import { PdfImporter } from '@epicurrents/pdf-reader'
import { pdfWorkerUrl } from '../workers/pdf'

/** Register the document module (as `pdf`), the PDF reader and the interface PDF UI. */
export const registerPdf = ({ app, registerInterfaceModule }: SetupContext) => {
    app.registerModule('pdf', docModule)
    const pdfReader = new PdfImporter(pdfWorkerUrl())
    const pdfLoader = new docModule.DocumentLoader('PDFLoader', 'pdf', pdfReader)
    app.registerStudyImporter('doc/pdf-file', 'Open PDF file', 'file', pdfLoader)
    app.registerStudyImporter('doc/pdf-folder', 'Open PDF files from folder', 'folder', pdfLoader)
    app.registerStudyImporter('doc/pdf-url', 'Open PDF from URL', 'url', pdfLoader)
    registerInterfaceModule('pdf', interfacePdfModule)
}
