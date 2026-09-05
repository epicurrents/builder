# Build profiles

A profile is a named *edition* of the application — a selection of packages from the master registry in [`scripts/env.mjs`](../scripts/env.mjs) plus the viewer setup that edition ships with. Editions are what releases are cut from: `eeg`, `emg`, `full`, and so on.

## Using a profile

Pass `--profile <name>` to any workspace script to restrict it to that edition's packages:

```bash
npm run setup -- --profile eeg      # clone + build only the EEG edition's packages
npm run build:asset -- --profile eeg
```

Without `--profile`, every registered package is used — the all-in developer default.

## Writing a profile

Each profile is an `.mjs` module that default-exports an object:

```js
export default {
    label: 'EEG',                       // human-readable edition name
    packages: ['eeg-module', 'edf-reader', 'dicom-reader', 'pyodide-service'],
    setup: { activeModules: ['eeg'] },  // viewer SETUP for the bundle
}
```

- `packages` names entries from `scripts/env.mjs`. `core`, the `util` group and the `interface` group are always included, so a profile lists only the modules, readers and services its edition adds.
- **Every profile needs `pyodide-service`.** The setup entry imports its registrar statically, so the package must be installed for the edition to build even when no session activates it. The service itself is opt-in per session (`?services=pyodide` / `?advanced`) and starts no interpreter until then.
- `setup` is the interface bundle configuration. The lib build injects it as `__EPI_SETUP__`, and its `activeModules` decide which registrars in `setup/` run — and which survive bundle trimming, so an edition contains only the modules it names.

**List `activeModules` explicitly.** An empty list means "every registrar in `setup/modules/`". Some registrars compose non-public packages, and rollup has to resolve a static import before it can tree-shake what the import provides, so the untrimmed build only works in a tree that has every package installed. A public edition that names its modules builds anywhere.

## Public vs. local profiles

- **Public profiles** live directly in `profiles/` and are committed. They may reference only packages that are published — a public profile that names a package marked `public: false` in `env.mjs` fails to load, which is what keeps public editions reproducible from public sources. That guarantee is only as good as the `public` flags themselves, so keep them in step with the repositories' actual visibility.
- **Local profiles** live in the gitignored [`profiles/local/`](local/) subfolder. Use them for editions that pull non-public packages (or any edition you do not want to publish). The loader checks `profiles/<name>.mjs` first, then `profiles/local/<name>.mjs`.
