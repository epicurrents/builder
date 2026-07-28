/**
 * EEG edition.
 *
 * The amplitude / EEG viewer with EDF/BDF and DICOM sources and the Python
 * analysis service (PSD, topomaps). Public readers only — an edition that adds a
 * non-public reader lives in profiles/local/.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
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
