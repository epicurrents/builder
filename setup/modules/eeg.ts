/**
 * EEG edition registrar.
 *
 * Composes, for the `eeg` modality: the core EEG module runtime, its EDF/BDF and
 * DICOM study importers (each wrapped in an `EegStudyLoader`), and the interface
 * EEG UI module. This composition is a consumer-scope
 * concern — it spans several core packages (`eeg-module`, `edf-reader`,
 * `dicom-reader`) and the interface layer (`@epicurrents/interface/modules/eeg`),
 * so it lives in the builder rather than in any one package. See setup/index.ts
 * for why registration belongs to the consumer.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import * as interfaceEegModule from '@epicurrents/interface/modules/eeg'
import * as eegModule from '@epicurrents/eeg-module'
import { EdfImporter, EdfWorkerSubstitute } from '@epicurrents/edf-reader'
import { DicomImporter, DicomWorkerSubstitute } from '@epicurrents/dicom-reader'
import { dcmWorker } from '../workers/dicom'
import { edfWorker } from '../workers/edf'

/** Register the EEG module, its EDF/DICOM importers and the interface EEG UI. */
export const registerEeg = ({ app, useSAB, registerInterfaceModule }: SetupContext) => {
    app.registerModule('eeg', eegModule)
    // The eeg module ships useMemoryManager=false; opt it into the shared-memory
    // path (must be set after registerModule so 'eeg' resolves as a module field).
    app.configure({ 'eeg.useMemoryManager': useSAB })
    const edfLoader = new EdfImporter()
    edfLoader.setWorkerOverride('eeg', () => {
        const eegSAB = window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('eeg.useMemoryManager')
        return useSAB && eegSAB ? edfWorker() : new EdfWorkerSubstitute()
    })
    const eegEdfLoader = new eegModule.EegStudyLoader('EegEdfLoader', ['eeg'], edfLoader)
    app.registerStudyImporter('eeg/edf-file', 'Open EDF file', 'file', eegEdfLoader)
    app.registerStudyImporter('eeg/edf-folder', 'Open EDF files from folder', 'folder', eegEdfLoader)
    app.registerStudyImporter('eeg/edf-url', 'Open EDF from URL', 'url', eegEdfLoader)
    const dcmLoader = new DicomImporter()
    dcmLoader.setWorkerOverride('eeg', () => {
        const eegSAB = window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('eeg.useMemoryManager')
        return useSAB && eegSAB ? dcmWorker() : new DicomWorkerSubstitute()
    })
    const eegDcmLoader = new eegModule.EegStudyLoader('EegDicomLoader', ['eeg'], dcmLoader)
    app.registerStudyImporter('eeg/dcm-file', 'Open DICOM file', 'file', eegDcmLoader)
    app.registerStudyImporter('eeg/dcm-folder', 'Open DICOM files from folder', 'folder', eegDcmLoader)
    app.registerStudyImporter('eeg/dcm-url', 'Open DICOM from URL', 'url', eegDcmLoader)
    registerInterfaceModule('eeg', interfaceEegModule)
}
