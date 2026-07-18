# Epicurrents builder

This repository is the **builder** for [Epicurrents](https://github.com/epicurrents) — a browser-based viewer for biomedical signal and imaging data (EEG, EMG, nerve conduction studies, DICOM, PDF, tabular data and more), built as a set of independently versioned `@epicurrents/*` packages. The builder assembles those packages into an *edition*: a ready-to-run application bundling exactly the modalities and readers you choose.

You do not edit signal-processing or UI code here — that lives in each package's own repository. The builder is the orchestration layer: a small set of Node.js scripts plus an npm workspace that clone the packages, build them in dependency order, and bundle a chosen edition into an embeddable library and a self-contained standalone app. Releases are editions (`eeg-1.2.3`, `full-1.4.0`, …).

For end-user and API documentation, see the [Epicurrents documentation site](https://docs.epicurrents.io). This README covers building editions from source.

## What this repository contains

Only the orchestration lives in this repository. The actual packages are cloned into subdirectories (which are git-ignored) by the setup script:

```
builder/
  scripts/          build / install / clone / copy / update / profile / manifest helpers
  setup/            config-driven consumer setup — the edition build entry
  profiles/         edition definitions (package subset + SETUP); profiles/local/ is git-ignored
  package.json      npm workspace definition + build commands
  README.md         this file
  ROADMAP.md        planned and deferred work
  epicurrents/      cloned @epicurrents/* packages (git-ignored)
  interface/        cloned Vue 3 interface application (git-ignored)
  util/             cloned standalone utility packages (git-ignored)
  ohif/             cloned OHIF radiology viewer integration (git-ignored)
```

After a successful setup the `epicurrents/`, `interface/`, `util/` and `ohif/` directories are populated with independent git checkouts. Because they are git-ignored, this repository stays small and only tracks the tooling that assembles them.

## Architecture in brief

Epicurrents is a pseudo-monorepo. Every package is published to npm under the `@epicurrents` namespace and installed only if you need it.

| Layer | Packages | Role |
|---|---|---|
| **Core** | `core` | Shared runtime, base classes, state manager, worker infrastructure. Everything depends on it. |
| **File readers** | `edf-reader`, `dicom-reader`, `wav-reader`, `htm-reader`, `pdf-reader`, `csv-reader`, `api-reader` | Parse a specific file format into a structured signal/document representation, each in its own web worker. |
| **Study modules** | `eeg-module`, `emg-module`, `ncs-module`, `acc-module`, `doc-module`, `tab-module` | Add display and interaction for one modality (Vue components, actions, settings). |
| **Services** | `pyodide-service`, `onnx-service` | Optional capabilities in a separate worker — Python (scipy/MNE) analysis, ONNX inference. |
| **Interface** | `interface` | The Vue 3 application the builder mounts the chosen modules into. |
| **Utilities** | `asymmetric-io-mutex`, `scoped-event-bus`, `scoped-event-log` | Standalone helpers with no dependency on the core runtime. |

A more detailed package catalogue is in the [library structure](https://docs.epicurrents.io) documentation.

## Prerequisites

- **Node.js** 22.12 or newer (Active LTS) and **npm** 10 or newer. Required by Vite 7 (`engines: ^20.19.0 || >=22.12.0`) and by the build scripts' use of `import.meta.dirname` (Node 20.11+). Older Node fails in confusing ways — an undefined `rootDir` rather than a clear version error — so the root `package.json` pins `engines.node` to `>=22.12.0`.
- **git** with access to the package repositories.
- **yarn** — only if you build the optional OHIF radiology integration (OHIF uses yarn).
- A modern **Chromium-based browser** to run the viewer (the interface requires Chromium APIs).

## Quick start

```bash
git clone <builder-repo-url> builder && cd builder
npm run setup                            # clone + build every package
EPI_PROFILE=eeg npm run build:edition    # build the EEG edition → dist/eeg/
```

`npm run setup` clones each package, installs its dependencies, strips duplicated shared packages (see [Why cleaning matters](#why-cleaning-matters)), and builds it in dependency order. To work on the viewer with a live dev server instead, use `npm run start` — it copies the worker bundles into the interface and launches Vite.

## Building an edition

An *edition* is a named selection of packages — the modalities and readers a build bundles — defined by a profile in `profiles/`. Build one with:

```bash
EPI_PROFILE=eeg npm run build:edition    # → dist/eeg/
```

This produces, under `dist/<edition>/`, a trimmed embeddable **library** (`epicurrents-lib.*`, for mounting into a host page) and a self-contained **standalone** folder (`index.html` + the library + workers, ready to serve). Only the chosen edition's packages are bundled; the rest are trimmed out.

**Defining an edition.** Copy a profile in `profiles/` (`eeg`, `full`, …) and edit its package list. Keep it in `profiles/` if it uses only public packages, or in the git-ignored `profiles/local/` if it pulls a private one — a public profile that names a non-public package refuses to build. See [profiles/README.md](profiles/README.md) for the full format.

**Reproducible releases.** `scripts/manifest.mjs` records each package's exact commit for an edition, and `npm run setup -- --manifest <file>` rebuilds from those pins — no npm version bumps needed. Tagging `<edition>-v<major>.<minor>.<patch>` on `main` triggers the release workflow, which builds the (public) edition and attaches it plus its manifest to a GitHub release.

> `npm run build:lib` / `build:app` build the interface's *own* all-in bundle (every module) rather than a profile-selected edition; they remain for the platform embedding pipeline. New builds should use `build:edition`.

## Choosing which packages to build

The package registry is defined in **`scripts/env.mjs`** as the exported `packages` map. Each top-level key is a logical group (`util`, `epicurrents`, `interface`, `ohif`) and also the directory the group is cloned into. Edit this map to add, remove, or pin packages; profiles then select from it.

```js
export const packages = new Map([
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
            { name: 'core' },                        // must be first
            { name: 'eeg-module' },
            { name: 'edf-reader', branch: 'feat/dev' }, // pin a branch
            // ...
        ],
        repository: 'https://github.com/epicurrents',
    }],
    // ...
])
```

Each package descriptor supports:

| Field | Type | Meaning |
|---|---|---|
| `name` | string (required) | Folder / package name to clone. |
| `branch` | string | Git branch to check out (defaults to `main`). |
| `repository` | string | Override the group's base repository URL for this one package. |
| `prebuild` | string[] | Shell commands run inside the package folder before building it. |
| `rename` | boolean | Rename the cloned folder to the map key (used when the repo name differs). |
| `external` | boolean | Skip automatic install/build — the package is managed manually (e.g. OHIF). |
| `public` | boolean | Whether the package is published from a public source (default true). A public profile may not include a `public: false` package. |

Ordering matters: `util` packages are built before `epicurrents`, and within `epicurrents`, `core` must come first because every other package depends on it.

### Scoping commands to a group, package, or edition

Every workflow command accepts an optional scope after `--`, and `--profile <name>` restricts it to an edition's packages:

```bash
npm run setup -- util                    # only the util group
npm run setup -- epicurrents/edf-reader  # a single package
npm run setup -- --profile eeg           # only the EEG edition's packages
```

The same scoping works for `update`, `instl`, `clean`, and `build:asset`.

## Command reference

| Command | Script | What it does |
|---|---|---|
| `npm run setup` | `scripts/setup.mjs` | Clone (or fetch) each package, check out its branch (or a manifest's pinned commit), install, clean, and build. |
| `npm run build:edition` | — | Build the active edition (profile) → `dist/<edition>/` (trimmed lib + standalone folder). |
| `npm run instl` | `scripts/install.mjs` | Run `npm install` in each already-cloned package. |
| `npm run clean` | `scripts/clean.mjs` | Remove duplicated shared packages nested inside each package's `node_modules`. |
| `npm run build:asset` | `scripts/build.mjs` | Build already-cloned packages (accepts a scope / `--profile`). |
| `npm run build:assets` | `scripts/build.mjs util interface epicurrents` | Build util, interface and all epicurrents packages. |
| `npm run update` | `scripts/update.mjs` | `git pull` each package and re-check out its pinned branch. |
| `npm run copy:workers` | `scripts/copy.mjs workers` | Copy compiled UMD worker bundles into the interface. |
| `npm run typecheck` | `scripts/typecheck.mjs` | Run `tsc --noEmit` over every library package and print a ✓/✗ summary. |
| `npm run start` | — | Copy workers, then launch the interface Vite dev server. |
| `npm run build:lib` / `build:app` | — | Build the interface's own all-in library / standalone app (platform pipeline). |
| `npm run build:dev` | — | Full development stack: assets + OHIF + copy + app. |
| `npm run test` | — | Run every package's test suite (`vitest`). |

## Why cleaning matters

Every package declares `@epicurrents/core` and the shared utility packages as dependencies. When each package is installed on its own, npm places a private copy of those shared packages inside that package's `node_modules`. If those copies are allowed to remain, the worker bundle and the main-thread code can end up built against **different versions of the same shared code** — which type-checks locally but silently corrupts data at runtime (mismatched buffer layouts, a `Log` object missing methods, and similar).

`npm run clean` (run automatically as part of `setup`) deletes the nested `@epicurrents`, `asymmetric-io-mutex`, `scoped-event-bus`, and `scoped-event-log` copies from each package so that every package resolves the single workspace-level version. **Run `npm run clean` again any time you install or remove packages inside a submodule.**

See [ROADMAP.md](ROADMAP.md) and the documentation site for the full rationale behind the monorepo version-compliance rules.

## Type-checking after shared-code changes

After changing anything in `epicurrents/core/` (types, base classes, method signatures), run the full sweep to catch cross-package regressions before building:

```bash
npm run typecheck                   # every library package
npm run typecheck epicurrents/core  # scope to one package
```

`scripts/typecheck.mjs` runs `tsc --noEmit` over every `util/*` and `epicurrents/*` package and exits non-zero on the first failure, so it can gate CI.

## Optional: OHIF radiology integration

The OHIF viewer is an `external` package — the setup script clones it but does not build it automatically because it uses yarn and its own toolchain. To build it into the interface:

```bash
npm run build:ohif:dev
```

## Notes and tips

- For local Pyodide testing, the interface's `SETUP.pyodideAssetPath` must point at a hosted static path — serving the WASM files over `file://` will not work.
- If you change `workerPaths` in `scripts/env.mjs`, make sure the referenced `umd/` folders exist in the built packages so the copy step succeeds.
- The `scripts/` directory has its own [README](scripts/README.md) with per-script detail.

## License

Licensed under the Apache License 2.0 — see [LICENSE](LICENSE).
