/**
 * Full edition.
 *
 * Every modality the builder can register, from public packages only — the kitchen-sink demo
 * build. `activeModules` is listed explicitly rather than left empty (which would mean "every
 * registrar in setup/modules/") because some registrars compose non-public packages; naming the
 * public ones keeps this profile buildable by anyone.
 *
 * Modalities with no registrar yet (ncs, tab) are left out: their packages would be cloned and
 * built without anything registering them. Add the package and the registrar together.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
export default {
    label: 'Full',
    packages: [
        'doc-module',
        'eeg-module',
        'emg-module',
        'dicom-reader',
        'edf-reader',
        'htm-reader',
        'pdf-reader',
        'wav-reader',
        'pyodide-service',
    ],
    setup: {
        activeModules: ['eeg', 'emg', 'htm', 'pdf'],
    },
}
