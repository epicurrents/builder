/**
 * Environment-specific variables.
 * @package    epicurrents/builder
 * @copyright  2025 Sampsa Lohi
 * @license    Apache-2.0
 */

/**
 * Packages that the application depends on, represented as a Map of:
 * ```
 * key: {
 *      name<sring>: name of the folder to install the package in,
 *      branch<sring>?: name of the git branch to check out,
 *      prebuild<sring[]>: list of commands to run before building the package,
 *      rename<boolean>?: rename the install folder to match the `name` parameter,
 *      repository<sring>: URL to a git repository,
 * }
 * // Or
 * ```
 * key: {
 *      packages: [
 *          { name<sring>: name of the folder to install the package in,
 *            branch<sring>?: name of the git branch to check out,
 *            build<sring>?: build command override (defaults to 'npm run build'),
 *            prebuild<sring[]>: list of commands to run before building the package,
 *            rename<boolean>?: rename the install folder to match the `name` parameter,
 *            repository<sring>: URL to a git repository,
 *          },
 *          ...
 *      ],
 *      repository<sring>: URL to a git repository, // Optional, can be defined for each package instead.
 * }
 * ```
 * The key is used to determine the installation directory for the package(s) and can be used as a scope for update
 * commands. If `repository` is defined for a package, it overrides the repository defined for the whole group.
 * The `name` parameter is used to determine the installation folder for the package. If `rename` is true, the package
 * will be installed in a folder named after the key instead of the repository name. This is useful when the repository
 * contains multiple packages and the package name does not match the repository name.
 * The `branch` parameter is used to check out a specific branch of the repository. If not defined, the main branch will
 * be used.
 * The `prebuild` parameter is used to run commands before building the package. This is useful for copying files or
 * installing dependencies that are not part of the package repository.
 * The `rename` parameter is used to rename the install folder to match the `name` parameter. This is useful when the
 * repository contains multiple packages and the package name does not match the repository name.
 * The `external` parameter is used to indicate that the package is not part of the monorepo and should be installed
 * in the root directory instead of the `interface` directory.
 * The `public` parameter (default true) marks whether the package is published from a public source. A public build
 * profile (one in `profiles/`) may not include a package with `public: false`, and the all-in default (no profile)
 * skips them so a fresh clone builds without access to any private repository; such packages are available only to
 * local editions in `profiles/local/`, or via `--include-private` for a maintainer's full working tree. Keep this
 * flag in step with the repositories' actual visibility — it is what the public/local profile split rests on.
 * See `scripts/profile.mjs`.
 *
 * The `packages` parameter is used to define multiple packages under the same key. This is useful for grouping related
 * packages together, such as all @epicurrents modules.
 */
export const packages = new Map([
    // Utilities must be installed first.
    ['util', {
        packages: [
            { name: 'scoped-event-log' },
            { name: 'scoped-event-bus' },
            { name: 'asymmetric-io-mutex' },
        ],
        repository: 'https://github.com/sam-19',
    }],
    ['epicurrents', {
        packages: [
            // { branch: '', name: 'package-name', repository: '' },
            // Core must be the first @epicurrents module.
            { name: 'core' },
            // Resource modules.
            { name: 'acc-module' },
            { name: 'doc-module' },
            { name: 'eeg-module' },
            { name: 'emg-module' },
            { name: 'ncs-module' },
            { name: 'tab-module' },
            // Source type readers.
            { name: 'api-reader', public: false },
            { name: 'csv-reader' },
            { name: 'dicom-reader' },
            { name: 'edf-reader' },
            { name: 'htm-reader' },
            { name: 'nic-reader', public: false },
            {
                name: 'pdf-reader',
                prebuild: [
                    'node scripts/copy.mjs --from node_modules/pdfjs-dist --to node_modules/@epicurrents/pdf-reader/node_modules/pdfjs-dist',
                    //'xcopy node_modules\\pdfjs-dist node_modules\\@epicurrents\\pdf-reader\\node_modules\\pdfjs-dist /s /i', // Windows
                    //'cp -r node_modules/pdfjs-dist node_modules/@epicurrents/pdf-reader/node_modules/pdfjs-dist', // Unix
                ],
            },
            { name: 'wav-reader' },
            // Services.
            { name: 'onnx-service' },
            { name: 'pyodide-service' },
        ],
        repository: 'https://github.com/epicurrents',
    }],
    /** There is only one interface. */
    ['interface', {
        branch: 'main',
        name: 'interface',
        /** Run these commands before building the package. */
        prebuild: [
            'npm run copy:workers',
        ],
        /** Rename the package to the map item key value (here 'interface'). */
        rename: true,
        repository: 'https://github.com/epicurrents/interface',
    }],
    /** Add OHIF viewer last. */
    ['ohif', {
        branch: 'release/3.9',
        external: true,
        name: 'ohif',
        rename: true,
        repository: 'https://github.com/OHIF/Viewers.git',
    }],
])
/**
 * Name of the directory that the interface module is installed in.
 */
export const interfaceDir = 'interface'
/**
 * Root directory of the project. Used as the base path for installing dependencies and copying files.
 * The path is determined by removing the trailing 'scripts' directory from the current file's directory.
 */
export const rootDir = import.meta.dirname.replace(/[\/\\]scripts\/?$/, '')
/**
 * Paths to worker files that need to be copied to the interface module for the application to work. Each path is an
 * array of path segments relative to the root directory.
 */
export const workerPaths = [
    ['node_modules', '@epicurrents', 'api-reader', 'umd'],
    ['node_modules', '@epicurrents', 'csv-reader', 'umd'],
    ['node_modules', '@epicurrents', 'dicom-reader', 'umd'],
    ['node_modules', '@epicurrents', 'edf-reader', 'umd'],
    ['node_modules', '@epicurrents', 'htm-reader', 'umd'],
    ['node_modules', '@epicurrents', 'nic-reader', 'umd'],
    ['node_modules', '@epicurrents', 'pdf-reader', 'umd'],
    ['node_modules', '@epicurrents', 'wav-reader', 'umd'],
    ['node_modules', '@epicurrents', 'pyodide-service', 'umd'],
    // The other modules may contained compiled core package workers.
    // Copy core last to overwrite any such previously copied files.
    ['node_modules', '@epicurrents', 'core', 'umd'],
]
