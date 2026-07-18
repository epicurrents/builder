/**
 * EEG edition.
 *
 * The amplitude / EEG viewer with EDF/BDF and DICOM sources and the Python
 * analysis service (PSD, topomaps). Public readers only — the Nicolet reader is
 * not public, so an edition that needs it lives in profiles/local/.
 */
export default {
    label: 'EEG',
    packages: [
        'eeg-module',
        'edf-reader',
        'dicom-reader',
        'pyodide-service',
    ],
    setup: {
        activeModules: ['eeg'],
    },
}
