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
- `setup` describes the interface bundle configuration. It becomes active once config-driven module registration lands (see the platform ROADMAP); it is defined now so the profile format is stable.

## Public vs. local profiles

- **Public profiles** live directly in `profiles/` and are committed. They may reference only packages that are published — a public profile that names a package marked `public: false` in `env.mjs` fails to load, which is what keeps public editions reproducible from public sources.
- **Local profiles** live in the gitignored [`profiles/local/`](local/) subfolder. Use them for editions that pull non-public packages (or any edition you do not want to publish). The loader checks `profiles/<name>.mjs` first, then `profiles/local/<name>.mjs`.
