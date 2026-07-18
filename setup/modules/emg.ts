/**
 * Electromyography (EMG) edition registrar.
 *
 * Composes the core EMG module, its WAV study importer (EMG data arrives as WAV,
 * not EDF), and the interface EMG UI. See setup/index.ts for why this composition
 * lives in the builder rather than in a package.
 */
import type { SetupContext } from '@epicurrents/interface'
import * as interfaceEmgModule from '@epicurrents/interface/modules/emg'
import * as emgModule from '@epicurrents/emg-module'
import { WavImporter, WavWorkerSubstitute } from '@epicurrents/wav-reader'
import { wavWorker } from '../workers'

/** Register the EMG module, its WAV importer and the interface EMG UI. */
export const registerEmg = ({ app, useSAB, registerInterfaceModule }: SetupContext) => {
    app.registerModule('emg', emgModule)
    const wavImporter = new WavImporter()
    wavImporter.setWorkerOverride('emg', () => {
        const emgSAB = window.__EPICURRENTS__.RUNTIME!.SETTINGS.getFieldValue('emg.useMemoryManager')
        return useSAB && emgSAB ? wavWorker() : new WavWorkerSubstitute()
    })
    const emgLoader = new emgModule.EmgStudyLoader('EmgWavLoader', wavImporter)
    app.registerStudyImporter('emg/wav-file', 'Open WAV file', 'file', emgLoader)
    app.registerStudyImporter('emg/wav-folder', 'Open WAV files from folder', 'folder', emgLoader)
    app.registerStudyImporter('emg/wav-url', 'Open WAV from URL', 'url', emgLoader)
    registerInterfaceModule('emg', interfaceEmgModule)
}
