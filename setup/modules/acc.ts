/**
 * Accelerometry (ACC) edition registrar.
 *
 * Composes the core ACC module, its CSV and EDF study importers, and the
 * interface ACC UI. See setup/index.ts for why this composition lives in the
 * builder rather than in a package.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import * as interfaceAccModule from '@epicurrents/interface/modules/acc'
import * as accModule from '@epicurrents/acc-module'
import { CsvImporter, CsvWorkerSubstitute } from '@epicurrents/csv-reader'
import { EdfImporter, EdfWorkerSubstitute } from '@epicurrents/edf-reader'
import { csvWorker } from '../workers/csv'
import { edfWorker } from '../workers/edf'

/** Register the ACC module, its CSV/EDF importers and the interface ACC UI. */
export const registerAcc = ({ app, useSAB, registerInterfaceModule }: SetupContext) => {
    app.registerModule('acc', accModule)
    const csvLoader = new CsvImporter()
    csvLoader.setWorkerOverride('acc', () => {
        const accSAB = window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('acc.useMemoryManager')
        return useSAB && accSAB ? csvWorker() : new CsvWorkerSubstitute()
    })
    const accLoader = new accModule.AccStudyLoader('AccCsvLoader', csvLoader)
    app.registerStudyImporter('acc/csv-file', 'Open CSV file', 'file', accLoader)
    app.registerStudyImporter('acc/csv-folder', 'Open CSV files from folder', 'folder', accLoader)
    app.registerStudyImporter('acc/csv-url', 'Open CSV from URL', 'url', accLoader)
    // Also load ACC data from EDF (accelerometry exported / converted to EDF).
    const accEdfImporter = new EdfImporter()
    accEdfImporter.setWorkerOverride('acc', () => {
        const accSAB = window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('acc.useMemoryManager')
        return useSAB && accSAB ? edfWorker() : new EdfWorkerSubstitute()
    })
    const accEdfLoader = new accModule.AccStudyLoader('AccEdfLoader', accEdfImporter)
    app.registerStudyImporter('acc/edf-file', 'Open EDF file', 'file', accEdfLoader)
    app.registerStudyImporter('acc/edf-folder', 'Open EDF files from folder', 'folder', accEdfLoader)
    app.registerStudyImporter('acc/edf-url', 'Open EDF from URL', 'url', accEdfLoader)
    registerInterfaceModule('acc', interfaceAccModule)
}
