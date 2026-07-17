# Epicurrents viewer workspace

This repository is the assembly point for building a modular
[Epicurrents](https://github.com/epicurrents) frontend application. Epicurrents is a
browser-based viewer for biomedical signal and imaging data — EEG, EMG, nerve conduction
studies, DICOM, PDF, tabular data and more — built as a set of independently versioned
packages that you compose into exactly the application you need.

You do not edit signal-processing or UI code here. Instead, this workspace clones the
individual `@epicurrents/*` packages, builds them in the correct dependency order, and
assembles the interface application from them. Think of it as the orchestration layer: a
small set of Node.js scripts plus an npm workspace configuration that turn a list of
packages into a working viewer.

For end-user and API documentation, see the
[Epicurrents documentation site](https://docs.epicurrents.io). This README covers building
and assembling the application from source.

## What this repository contains

Only the orchestration lives in this repository. The actual packages are cloned into
subdirectories (which are git-ignored) by the setup script:

```
frontend/viewer/
  scripts/          build / install / clone / copy / update helpers (this is the tooling)
  package.json      npm workspace definition + build commands
  README.md         this file
  ROADMAP.md        planned and deferred work
  epicurrents/      cloned @epicurrents/* packages (git-ignored)
  interface/        cloned Vue 3 interface application (git-ignored)
  util/             cloned standalone utility packages (git-ignored)
  ohif/             cloned OHIF radiology viewer integration (git-ignored)
```

After a successful setup the `epicurrents/`, `interface/`, `util/` and `ohif/` directories
are populated with independent git checkouts. Because they are git-ignored, this repository
stays small and only tracks the tooling that assembles them.

## Architecture in brief

Epicurrents is a pseudo-monorepo. Every package is published to npm under the
`@epicurrents` namespace and installed only if you need it.

| Layer | Packages | Role |
|---|---|---|
| **Core** | `core` | Shared runtime, base classes, state manager, worker infrastructure. Everything depends on it. |
| **File readers** | `edf-reader`, `dicom-reader`, `wav-reader`, `htm-reader`, `pdf-reader`, `csv-reader`, `api-reader` | Parse a specific file format into a structured signal/document representation, each in its own web worker. |
| **Study modules** | `eeg-module`, `emg-module`, `ncs-module`, `acc-module`, `doc-module`, `tab-module` | Add display and interaction for one modality (Vue components, actions, settings). |
| **Services** | `pyodide-service`, `onnx-service` | Optional capabilities in a separate worker — Python (scipy/MNE) analysis, ONNX inference. |
| **Interface** | `interface` | The default Vue 3 application that assembles everything into a ready-to-use UI. |
| **Utilities** | `asymmetric-io-mutex`, `scoped-event-bus`, `scoped-event-log` | Standalone helpers with no dependency on the core runtime. |

A more detailed package catalogue is in the
[library structure](https://docs.epicurrents.io) documentation.

## Prerequisites

- **Node.js** 22.12 or newer (Active LTS) and **npm** 10 or newer. This is required by
  Vite 7 (`engines: ^20.19.0 || >=22.12.0`) and by the build scripts' use of
  `import.meta.dirname` (Node 20.11+). Older Node fails in confusing ways — an undefined
  `rootDir` rather than a clear version error — so the root `package.json` pins
  `engines.node` to `>=22.12.0`.
- **git** with access to the package repositories.
- **yarn** — only if you build the optional OHIF radiology integration (OHIF uses yarn).
- A modern **Chromium-based browser** to run the viewer (the interface requires Chromium
  APIs).

## Quick start

```bash
# 1. Clone this repository and enter it
git clone <this-repo-url> viewer && cd viewer

# 2. Clone and build all the packages listed in scripts/env.mjs
npm run setup

# 3. Copy worker bundles into the interface and start the dev server
npm run start
```

`npm run setup` clones each package, installs its dependencies, strips duplicated shared
packages (see [Why cleaning matters](#why-cleaning-matters)), and builds it in dependency
order. `npm run start` copies the compiled worker bundles into the interface and launches
the Vite dev server.

### Build outputs: library vs. standalone app

Once the packages are built (`npm run build:assets` — util + interface + all epicurrents
packages), the interface can be bundled in one of two ways depending on how you intend to
use it:

```bash
npm run build:lib      # build the interface as an embeddable library (the modular use case)
npm run build:app      # bundle a self-contained standalone application
```

- **`npm run build:lib`** is the primary output for a modular Epicurrents frontend. It
  builds the interface as a consumable library (`vite build --config vite.config.lib.ts`)
  that another application imports and mounts, so you compose the viewer into your own page
  or product with only the modules you selected in `scripts/env.mjs`. This is the build you
  want when embedding Epicurrents.
- **`npm run build:app`** produces a self-contained standalone application
  (`vite.config.app.ts`) — a ready-to-serve viewer with no host application. Use it when you
  just want to deploy the viewer on its own.

For a full development stack in one command (assets + optional OHIF + asset copy + app
build), use `npm run build:dev`.

## Choosing which packages to build

The package list is defined in **`scripts/env.mjs`** as the exported `packages` map. Each
top-level key is a logical group (`util`, `epicurrents`, `interface`, `ohif`) and also the
directory the group is cloned into. Edit this map to add, remove, or pin packages.

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
            { name: 'edf-reader', branch: 'encoder' }, // pin a branch
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

Ordering matters: `util` packages are built before `epicurrents`, and within
`epicurrents`, `core` must come first because every other package depends on it.

### Scoping commands to a group or package

Every workflow command accepts an optional scope argument after `--`:

```bash
npm run setup -- util                  # only the util group
npm run setup -- epicurrents           # only the epicurrents group
npm run setup -- epicurrents/edf-reader  # a single package
```

The same scoping works for `update`, `instl`, `clean`, and `build:asset`.

## Command reference

| Command | Script | What it does |
|---|---|---|
| `npm run setup` | `scripts/setup.mjs` | Clone (or fetch) each package, check out its branch, install, clean, and build. |
| `npm run instl` | `scripts/install.mjs` | Run `npm install` in each already-cloned package. |
| `npm run clean` | `scripts/clean.mjs` | Remove duplicated shared packages nested inside each package's `node_modules`. |
| `npm run build:asset` | `scripts/build.mjs` | Build already-cloned packages (accepts a scope). |
| `npm run build:assets` | `scripts/build.mjs util interface epicurrents` | Build util, interface and all epicurrents packages. |
| `npm run update` | `scripts/update.mjs` | `git pull` each package and re-check out its pinned branch. |
| `npm run copy:workers` | `scripts/copy.mjs workers` | Copy compiled UMD worker bundles into the interface. |
| `npm run copy:all` | `scripts/copy.mjs` | Copy all compiled assets (OHIF, workers, package outputs) into the interface. |
| `npm run typecheck` | `scripts/typecheck.mjs` | Run `tsc --noEmit` over every library package and print a ✓/✗ summary. |
| `npm run start` | — | Copy workers, then launch the interface Vite dev server. |
| `npm run build:app` | — | Build the standalone interface application. |
| `npm run build:lib` | — | Build the interface as a consumable library. |
| `npm run build:dev` | — | Full development stack: assets + OHIF + copy + app. |
| `npm run test` | — | Run every package's test suite (`vitest`). |

A typical from-scratch flow:

```bash
npm run setup          # clone + install + clean + build everything
npm run copy:workers   # stage worker bundles for the interface
npm run build:app      # produce the deployable interface bundle
```

## Why cleaning matters

Every package declares `@epicurrents/core` and the shared utility packages as
dependencies. When each package is installed on its own, npm places a private copy of those
shared packages inside that package's `node_modules`. If those copies are allowed to remain,
the worker bundle and the main-thread code can end up built against **different versions of
the same shared code** — which type-checks locally but silently corrupts data at runtime
(mismatched buffer layouts, a `Log` object missing methods, and similar).

`npm run clean` (run automatically as part of `setup`) deletes the nested `@epicurrents`,
`asymmetric-io-mutex`, `scoped-event-bus`, and `scoped-event-log` copies from each package
so that every package resolves the single workspace-level version. **Run `npm run clean`
again any time you install or remove packages inside a submodule.**

See [ROADMAP.md](ROADMAP.md) and the documentation site for the full rationale behind the
monorepo version-compliance rules.

## Type-checking after shared-code changes

After changing anything in `epicurrents/core/` (types, base classes, method signatures), run
the full sweep to catch cross-package regressions before building:

```bash
npm run typecheck                 # every library package
npm run typecheck epicurrents/core  # scope to one package
```

`scripts/typecheck.mjs` runs `tsc --noEmit` over every `util/*` and `epicurrents/*` package
and exits non-zero on the first failure, so it can gate CI.

## Optional: OHIF radiology integration

The OHIF viewer is an `external` package — the setup script clones it but does not build it
automatically because it uses yarn and its own toolchain. To build it into the interface:

```bash
npm run build:ohif:dev
```

## Notes and tips

- For local Pyodide testing, the interface's `SETUP.pyodideAssetPath` must point at a hosted
  static path — serving the WASM files over `file://` will not work.
- If you change `workerPaths` in `scripts/env.mjs`, make sure the referenced `umd/` folders
  exist in the built packages so the copy step succeeds.
- The `scripts/` directory has its own [README](scripts/README.md) with per-script detail.

## License

Licensed under the Apache License 2.0 — see [LICENSE](LICENSE).
