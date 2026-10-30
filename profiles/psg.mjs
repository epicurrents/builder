/**
 * Polysomnography edition.
 *
 * The EEG edition with sleep studies added: a study opens in the EEG interface, so the EEG module stays active.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
export default {
    label: 'PSG',
    packages: [
        'eeg-module',
        'psg-module',
        'edf-reader',
        'dicom-reader',
        'pyodide-service',
    ],
    setup: {
        activeModules: ['eeg', 'psg'],
    },
}
