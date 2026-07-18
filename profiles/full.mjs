/**
 * Full edition.
 *
 * Every public module, reader and service — the kitchen-sink demo build. Matches
 * the all-in developer default (no `--profile`) but is pinned and shipped as a
 * release. Excludes the non-public Nicolet reader and the external OHIF viewer;
 * add `'ohif'` here if a radiology-capable full build is wanted.
 */
export default {
    label: 'Full',
    packages: [
        'acc-module',
        'doc-module',
        'eeg-module',
        'emg-module',
        'ncs-module',
        'csv-reader',
        'dicom-reader',
        'edf-reader',
        'htm-reader',
        'pdf-reader',
        'wav-reader',
        'pyodide-service',
    ],
    setup: {
        activeModules: [],
    },
}
