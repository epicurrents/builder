/**
 * Polysomnography edition registrar.
 *
 * Composes the study importers for the `psg` modality, each wrapped in a `PsgStudyLoader`. A study opens in the EEG
 * interface and is decoded by the EEG reader worker, so the worker override is keyed `eeg` and this registrar adds no
 * interface module of its own; it relies on the EEG registrar having run, which an edition listing `psg` must do.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import { EdfExporter, EdfImporter, EdfWorkerSubstitute } from '@epicurrents/edf-reader'
import * as psgModule from '@epicurrents/psg-module'
import { edfWorker, edfWriterWorker } from '../workers/edf'

/** Register the EDF/BDF importers of the `psg` modality. */
export const registerPsg = ({ app, useSAB }: SetupContext) => {
    const edfLoader = new EdfImporter()
    edfLoader.setWorkerOverride('eeg', () => {
        const eegSAB = window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('eeg.useMemoryManager')
        return useSAB && eegSAB ? edfWorker() : new EdfWorkerSubstitute()
    })
    const edfExporter = new EdfExporter()
    edfExporter.setWorkerOverride(edfWriterWorker)
    const psgEdfLoader = new psgModule.PsgStudyLoader('PsgEdfLoader', ['eeg'], edfLoader, edfExporter)
    app.registerStudyImporter('psg/edf-file', 'Open polysomnography (EDF)', 'file', psgEdfLoader)
    app.registerStudyImporter('psg/edf-url', 'Open polysomnography from URL', 'url', psgEdfLoader)
}
