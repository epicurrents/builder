# Epicurrents Viewer — instructions and architecture notes for AI coding assistants

## Getting started — set up and build an edition

This repo is the **builder**: it assembles the Epicurrents application from the independently-versioned `@epicurrents/*` packages and produces per-*edition* releases. You do not edit signal-processing or UI code here — that lives in each package's own repository; the builder only decides *which* packages are combined and *how*.

```bash
git clone <app-workspace-url> app && cd app
npm run setup                            # clone + build every package (add -- --profile <name> to scope it)
EPI_PROFILE=eeg npm run build:edition    # build the EEG edition → dist/eeg/
```

`build:edition` produces a trimmed, embeddable **lib** (`epicurrents-lib.*`) plus a self-contained **standalone** folder (`index.html` + lib + workers) under `dist/<edition>/`.

**Editions come from profiles.** A profile in `profiles/` names the packages an edition bundles and the viewer SETUP it ships with (`eeg`, `full`, …). To make your own, copy one and edit its package list: keep it in `profiles/` if it uses only public packages, or in the gitignored `profiles/local/` if it pulls a private one (a public profile that names a non-public package refuses to build). Full profile format in [profiles/README.md](profiles/README.md).

**Reproducible releases.** `scripts/manifest.mjs` records each package's exact commit for an edition, and `npm run setup -- --manifest <file>` rebuilds from those pins — no npm version bumps needed. Tagging `<edition>-v<major>.<minor>.<patch>` on `main` triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds the (public) edition and attaches it plus its manifest to a GitHub release.

For the full workspace guide — prerequisites, every command, the optional OHIF integration — see [README.md](README.md). Everything below is architecture reference for working on the viewer internals.

## Monorepo version compliance — HIGH PRIORITY

All 14 packages under `epicurrents/` share a single toolchain. Version drift between packages is
a documented cause of **silent runtime corruption** — the worker bundle and main-thread code can
disagree on data layouts or API shapes while all type-checks pass locally.

**Canonical versions:**

| Tool | Version |
|---|---|
| TypeScript | `^5.7.0` |
| ts-loader | `^9.5.1` |
| webpack | `^5.73.0` |
| tsconfig base | `epicurrents/core/tsconfig.base.json` (core extends it locally; siblings extend `@epicurrents/core/tsconfig.base.json` so it resolves standalone too) |

**Mandatory rules:**
1. **Never pin a package-specific TypeScript version** that differs from the table. A single
   divergent package produces structurally incompatible `.d.ts` files that type-check but
   corrupt data at runtime.
2. **Never override `tsconfig.base.json` options per-package** without a comment explaining why.
3. **After any toolchain bump or shared-code change**, run the full type-check sweep:
   ```bash
   npm run typecheck
   ```
   (`scripts/typecheck.mjs` — runs `tsc --noEmit` over every `util/*` and `epicurrents/*`
   package and exits non-zero on the first failure; pass e.g. `epicurrents/core` to scope it.)
4. **Both build outputs must be regenerated together** after any change to shared code (see
   "After changing core" below). The UMD worker bundle and the TSC `dist/` output are separate
   build artifacts; rebuilding only one leaves a stale mismatch.
5. **After changing `epicurrents/core/`** (types, worker code, shared utilities):
   - Run the type-check sweep above
   - Run `npm run build:tsc` (updates `dist/`)
   - Run `npm run build:umd && node scripts/copy.mjs workers` (updates worker bundles)
   Both steps are needed — the Vite-served main thread reads from `dist/` while the browser
   loads workers from `umd/` via `scripts/copy.mjs`.

---

## Code comment conventions

Comments and docstrings describe the code's **current contract** — what it does and the invariants it upholds, for a reader who has never seen an earlier version.

- **No change history or anecdotes.** Don't narrate what the code used to do, what a change replaced, or why it was added ("previously…", "now dispatches…", "added for…", "the active set changed without a dispatch"). That belongs in the commit message, where `git blame` surfaces it; in the file it rots as soon as the change lands.
- **Describe the layer's own contract, not its consumers.** A core or worker comment shouldn't name a specific upper-layer caller (e.g. a platform component) — state the invariant the layer guarantees so it holds regardless of who calls it.
- **Keep the `@package` / `@copyright` / `@license` header** on every source file.
- **Wrap TypeScript source at a 120-column soft cap** — code, docstrings, and comments alike. The one exception: `@param` (method parameter) docstrings stay on a single line regardless of length, because wrapping them renders poorly in the VS Code hover. Do not hard-wrap Markdown prose (README/AGENTS/etc.): one line per paragraph, since docs are read as rendered output at varying widths. Full rule in the platform's [AGENTS.md → Line length](../../AGENTS.md#line-length).

These mirror the platform's documentation-style rules, but the platform's `documentation-style` review agent does not run on viewer commits — apply them by hand here.

---

## Adding icons to the interface

Every icon used in `interface/src/` requires **three edits** to `interface/src/app/icons.ts`:
1. An SVG `import` from `@material-symbols/svg-400/outlined/`.
2. An entry in the `ICON_SVGS` lookup table.
3. An entry in `FA_TO_MATERIAL` mapping the FA kebab-case caller name to the Material snake_case name
   (only when they differ).

All three must be in alphabetical order within their respective blocks. Missing any one of them causes the
icon to silently render nothing at runtime.

Run `/add-interface-icon` to have all three edits made automatically. The skill is at
`.claude/skills/add-interface-icon.md`.

---

## After changing core

After any change to `epicurrents/core/` (types, base classes, method signatures),
run a type-check sweep across all dependent packages to catch regressions:

```bash
npm run typecheck
```

`scripts/typecheck.mjs` runs `tsc --noEmit` over every `util/*` and `epicurrents/*` package
(the `epicurrents/*` ones all depend on core; `util/*` is upstream of core and swept only as
free coverage) without emitting files or running any copy/replace steps, so it is fast. It
prints a ✓/✗ per package and exits non-zero on any failure; pass a scope such as
`npm run typecheck epicurrents/core` to check one package. All packages type-check clean, so
any error indicates a regression.

If a package suddenly reports `TS2339` for methods that exist on a core base
class (`awaitAction`, `_setPropertyValue`, `dispatchPropertyChangeEvent`, …), the
cause is almost always a stale `@epicurrents/core` copy nested in that package's
own `node_modules` shadowing the workspace symlink — run `node scripts/clean.mjs`
to strip the nested copies, the same fix as the `scoped-event-log` duplicate.

---

## Running tests

Tests use **Vitest**. Each package has its own `vitest.config.ts`; tests live under `tests/` inside each package. Only three packages currently have test files: `core` (48 suites), `eeg-module` (10 suites), and `tab-module` (1 suite).

```bash
# Run tests for a specific package
cd epicurrents/core && vitest run

# Run with coverage
cd epicurrents/core && vitest run --coverage

# Run all at once from the workspace root
npm run test:core      # epicurrents/core
npm run test:eeg       # epicurrents/eeg-module
npm run test:tab       # epicurrents/tab-module
```

### Key configuration

**`package.json` imports field** (`core/package.json`): The `"#*": "./src/*"` entry maps `#`-prefixed path aliases to source files. This is intentional — the post-build step (`tsconfig-replace-paths`) rewrites all `#` imports in emitted JS, so dist files never contain `#` aliases and this setting does not affect the published build.

**`vitest.config.ts` aliases**: The `resolve.alias` entries in each package's config provide path alias resolution for Vitest's module graph. For `eeg-module`, additional aliases redirect `@epicurrents/core` and `scoped-event-log` to mock implementations under `tests/mocks/`.

### Adding tests to a new package

1. Add `vitest.config.ts` (copy from an existing package, adjust aliases).
2. Create `tests/` with `__init__` or test files named `*.test.ts`.
3. Add `"test": "npm run test:unit"` and `"test:unit": "vitest run --coverage"` to `package.json` scripts.
4. Add a `test-<pkg>` job to `.github/workflows/ci.yml` in the platform repo with `DJANGO_SETTINGS_MODULE` set appropriately.

---

## Monorepo layout

`frontend/viewer/` is an npm workspace pseudo-monorepo managed by `scripts/`:

```
frontend/viewer/
  epicurrents/          # domain packages (each its own git repo / npm workspace)
    core/               # @epicurrents/core — shared abstractions & runtime
    edf-reader/         # @epicurrents/edf-reader — EDF/BDF file I/O
    eeg-module/         # @epicurrents/eeg-module — EEG modality
    emg-module/         # @epicurrents/emg-module — EMG modality
    ncs-module/         # @epicurrents/ncs-module — NCS modality
    doc-module/         # @epicurrents/doc-module — document modality
    tab-module/         # @epicurrents/tab-module — tabular data modality
    dicom-reader/       # @epicurrents/dicom-reader — DICOM file reader
    htm-reader/         # @epicurrents/htm-reader — HTM file reader
    wav-reader/         # @epicurrents/wav-reader — WAV audio reader
    pdf-reader/         # @epicurrents/pdf-reader — PDF reader
    api-reader/         # @epicurrents/api-reader — API URL importer
    onnx-service/       # @epicurrents/onnx-service — ONNX ML inference service
    pyodide-service/    # @epicurrents/pyodide-service — Python-in-browser service
  interface/            # Vue 3 viewer application (mounts all modules)
  util/                 # standalone utility packages
    asymmetric-io-mutex/  # SharedArrayBuffer mutex (asymmetric I/O buffers)
    scoped-event-bus/     # typed event bus with scoped events
    scoped-event-log/     # global log with scoped entries
  ohif/                 # OHIF viewer integration (radiology)
  scripts/              # build, install, copy, update, profile + manifest helpers (Node.js)
  setup/                # config-driven consumer setup — the official edition build entry
  profiles/             # build editions (package subset + SETUP); profiles/local/ is gitignored
  vite.config.lib.ts    # builder-owned per-edition lib build
```

The root `package.json` orchestrates builds. The **official build path** is the builder's own config-driven setup: `EPI_PROFILE=<name> npm run build:edition` builds an *edition* — the package subset a profile in `profiles/` selects — into a trimmed lib plus a self-contained standalone folder under `dist/<edition>/`. `setup/index.ts` is the config-driven consumer (its registrars in `setup/modules/` run only for the edition's `activeModules`), `scripts/profile.mjs` resolves profiles, and a build-time plugin trims unused registrars from the bundle. `scripts/manifest.mjs` pins each package's exact commit so a release is reproducible (`npm run setup -- --manifest <file>` rebuilds from the pins), and `.github/workflows/release.yml` publishes a public edition on an `<edition>-v<x.y.z>` tag. `build:assets` (build util + interface + epicurrents packages) and `build:lib` (the interface's own all-in bundle, still consumed by the platform's `build:viewer`) remain. See `profiles/README.md`.

---

## Core (`@epicurrents/core`)

**The single most important package.** Everything else depends on it.

### Key concepts

| Concept | Class / Interface | Role |
|---|---|---|
| Application | `Epicurrents` (class), `EpicurrentsApp` (interface) | Entry point. Holds runtime, event bus, interface, memory manager. |
| Runtime state | `RuntimeStateManager` / `StateManager` interface | Central reactive store: `APP`, `MODULES`, `SERVICES`, `SETTINGS`, `WORKERS`, `INTERFACE` maps. |
| Asset | `BaseAsset` interface | Root type of everything — has `id`, `name`, `modality`, `state`, event API. |
| Resource | `DataResource` interface | Loadable asset with lifecycle (`added → loading → loaded → ready → destroyed`). |
| Module | `ResourceModule` / `RuntimeResourceModule` | Pluggable modality support registered with `registerModule(name, module)`. |
| Service | `GenericService` / `AssetService` | Web-worker interface. Manages commission/promise pairs for off-thread work. |
| Study loader | `GenericStudyLoader` / `StudyLoader` | Knows how to read a file format and produce `StudyContext` + `DataResource`. |
| Interface | `InterfaceModule` / `InterfaceModuleConstructor` | Vue UI shell — passed `EpicurrentsApp` + `StateManager` at `launch()`. |
| Dataset | `MixedMediaDataset` / `MediaDataset` | Container for a set of resources opened together. |
| Event bus | `EventBus` (wraps `scoped-event-bus`) | Application-wide event dispatch; exposed as `window.__EPICURRENTS__.EVENT_BUS`. |

### Globals

The `Epicurrents` constructor sets:
```ts
window.__EPICURRENTS__ = { APP, EVENT_BUS, RUNTIME }
```

### Core source layout

```
src/
  assets/
    biosignal/           # GenericBiosignalResource, GenericBiosignalService,
                         # BiosignalCache, BiosignalMutex, MontageService, etc.
    connector/           # DatabaseAPIConnector, WebDAVConnector
    dataset/             # GenericDataset, MixedMediaDataset
    document/            # GenericDocumentResource
    reader/              # GenericSignalReader/Writer/Processor, LocalFileReader,
                         # filesystem/ (FileSystemDirectory, FileSystemFile)
    service/             # GenericService, ServiceMemoryManager, ServiceWorkerSubstitute
    study/               # GenericStudyLoader, StudyCollection, StudyLoadProtocol
    annotation/          # GenericAnnotation, ResourceLabel
  config/                # Settings singleton
  events/                # EventBus, ApplicationEvents enum
  runtime/               # RuntimeStateManager, module stubs (app.ts)
  types/                 # All TypeScript interfaces (application.ts is the main one)
  util/                  # constants, conversions, signal maths, worker helpers
  workers/               # base.worker, montage.worker, memory-manager.worker
```

### App lifecycle

1. Instantiate `new Epicurrents()` — sets globals, creates `RuntimeStateManager`.
2. Call `registerModule(name, module)` for each modality (EEG, EMG…).
3. Call `registerService(name, service)` for optional services (Pyodide, ONNX…).
4. Call `registerStudyImporter(name, label, mode, loader)`.
5. Call `registerInterface(InterfaceConstructor)`.
6. Call `launch()` — creates interface, sets up memory manager if `useSAB` is true.
7. Call `loadStudy(loaderName, source, options)` to open a recording.

---

## File reader concept — `edf-reader`

**Pattern shared by all `*-reader` packages.**

```
src/
  edf/
    EdfReader.ts          # extends GenericSignalReader — parses header & data records
    EdfDecoder.ts         # binary → typed-array conversion
    EdfEncoder.ts         # typed-array → binary (for writing)
    EdfHeaderRecord.ts    # typed representation of an EDF header
    EdfImporter.ts        # extends GenericStudyImporter — entry point for "open file"
    EdfExporter.ts        # extends GenericStudyExporter
    EdfWriter.ts          # wraps EdfEncoder for writing
    EdfWorkerSubstitute.ts# fallback when no web worker is available
  workers/
    edf.worker.ts         # dedicated worker; delegates to EdfReader
  types/                  # EDF-specific TypeScript types
  util.ts                 # header ↔ BiosignalHeader conversions
```

`EdfReader` extends `GenericSignalReader` (core). Key method: `cacheEdfInfo(header, dataRecordSize)` — stores offsets + chunk sizing into the base class so the worker can stream data records progressively.

The worker (`edf.worker`) receives commissions from the biosignal service. The `EdfWorkerSubstitute` runs the same code synchronously on the main thread as a fallback.

---

## Study module concept — `eeg-module`

**Pattern shared by all `*-module` packages.**

```
src/
  EegRecording.ts         # extends GenericBiosignalResource — the top-level resource
  components/
    EegMontage.ts         # extends GenericBiosignalMontage
    EegSetup.ts           # extends GenericBiosignalSetup (channel definitions)
    EegSourceChannel.ts   # physical electrode channel
    EegMontageChannel.ts  # derived (montage) channel
    EegEvent.ts           # timed event annotation
    EegLabel.ts           # label annotation
    EegVideo.ts           # associated video resource
  service/
    EegService.ts         # extends GenericBiosignalService — commissions the worker
  loader/
    EegStudyLoader.ts     # extends BiosignalStudyLoader — creates EegRecording
  config/
    defaults/             # bundled 10-20 and 10-10 setups + standard montages (JSON)
    extra/                # additional montage definitions
  pyodide/
    scripts/              # Python scripts run via PyodideService for filtering/topomaps
  runtime/                # module registration export (used by interface)
  types/                  # EEG-specific TypeScript types
```

`EegRecording` is what gets added to a `Dataset`. It holds `EegSetup` (electrode positions + source channels) and a list of `EegMontage` objects. `EegService` owns the web worker that reads signal data on demand.

---

## Services concept — `pyodide-service`

**Pattern shared by all `*-service` packages.**

`GenericService` (core) abstracts a web worker: each method call creates a *commission* (UUID-keyed `Promise`) and posts a message to the worker; the worker replies with the same UUID so the promise can be resolved.

`PyodideService` extends this:

```
src/
  PyodideService.ts       # extends GenericService — manages the Pyodide worker
  PyodideRunner.ts        # helper: run a named Python script; cache result
  pyodide.worker.ts       # the actual worker — loads pyodide, runs Python scripts
  components/
    PyodideMontageProcessor.ts  # montage computation via Python (alt to JS montage)
  workers/
    PyodideMontageWorker.ts     # worker-side implementation of montage processing
    PyodideWorker.ts            # base worker class
  scripts/
    biosignal.py          # biosignal processing utilities (filtering etc.)
  types/                  # PythonInterpreterService interface, etc.
```

Services register themselves: `app.registerService('PYODIDE', new PyodideService())`. The `EegModule` can then call into PyodideService for filtering, PSD computation, or topomap generation.

The memory manager (`ServiceMemoryManager`, `asymmetric-io-mutex`) uses `SharedArrayBuffer` to pass large signal arrays between threads without copying, when cross-origin isolation is available.

---

## Interface (`interface/`)

Vue 3 + Vuex application. Builds as a standalone app or as an embeddable library.

```
src/
  DefaultInterface.ts     # implements InterfaceModule — root Vue app entry
  standalone.ts           # app entry for standalone build
  app/
    App.vue               # root component
    AppMenubar.vue        # top menu
    modules/              # per-modality UI (eeg/, emg/, ncs/, doc/, pdf/, tab/, rad/)
      eeg/
        components/       # EegViewer, EegPlot, EegControls, EegNavigator, etc.
        tools/            # ExamineTool, FftTool, PowerSpectrumTool, TopomapTool, etc.
        overlays/         # EegAnalysisTools, EegChannelProperties
      …
    views/
      biosignal/          # BiosignalInterface, annotation overlays, axis plots, sidebar
      media/              # MediaInterface (audio/video)
      radiology/          # RadiologyInterface (OHIF wrapper)
      default/            # DefaultInterface fallback
    navigator/            # DatasetNavigator, DatasetSelector
    overlays/             # ConnectorDialog, DatasetDialog, WelcomeDialog, etc.
    settings/             # SettingsDialog + individual control components
    footers/              # AppFooter, SystemFooter, FooterMenu
    controls/             # ButtonControl, DropdownControl, OnOffControl (toolbar)
  components/
    plots/biosignal/      # CanvasPlot, WebGlPlot — hardware-accelerated signal rendering
    report/               # DynamicReportForm, FormParser, SchemaManager (structured reporting)
  store/                  # Vuex store: index, actions, mutations
  i18n/                   # English + Finnish translations
  config/                 # interface-level settings defaults
  epicurrents/
    EpicurrentsPlugin.ts  # Vue plugin that wires the app to the core runtime
```

Signal rendering uses two strategies:
- `CanvasPlot` — 2D Canvas API fallback
- `WebGlPlot` / `WebGlPlotTrace` — WebGL hardware-accelerated (default)

---

## Platform integration (`frontend/src/projects/types.ts`)

The platform (Django + Vue) embeds the viewer in `ViewerView.vue`. Project-specific
customisation is done via the `ViewerPlugin` interface:

```ts
interface ViewerPlugin {
    extraSetup?: Record<string, unknown>       // merged into Epicurrents setup object
    onAppReady?(epic, bus): void | Promise<void>  // called after app.launch()
    onStudiesReady?(epic, studies): void | Promise<void>  // called after studies loaded
}
```

Projects register a plugin that hooks into the viewer lifecycle without modifying the core `ViewerView`.

---

---

## Core runtime internals

### RuntimeStateManager

Extends `GenericAsset`. Wraps a module-level `state` singleton object — not a reactive Vue store. All mutations go through named methods (`addDataset`, `setActiveResource`, `setModule`, …) that dispatch `before`/`after` scoped events via the `EventBus`. The `SETTINGS` singleton supports both programmatic and `localStorage`-persisted user-overridable fields. `WORKERS` is a `Map<name, () => Worker | null>` used to inject test doubles or platform-specific workers.

### Signal data flow — two paths

Signal data travels along two distinct paths depending on whether `SharedArrayBuffer` is available:

**Path A — Memory manager (SAB / cross-origin isolated)**
```
EDF worker → BiosignalMutex (SAB, raw signals)
  ↓  (MutexExportProperties transferred to montage worker)
MontageWorker.setupInputMutex → MontageProcessor reads directly from SAB
  ↓
MontageProcessor.getSignals() → derived signals → sent back to main thread
```

**Path B — No memory manager (JS heap)**
```
EDF worker → BiosignalCache (SignalCachePart, main thread JS heap)
  ↓  (cache reference passed to montage worker)
MontageWorker.setInputCache → MontageProcessor reads from shared worker / simple cache
  ↓
MontageProcessor.getSignals() → derived signals → sent back to main thread
```

`GenericBiosignalResource` holds both: `_mutexProps` (SAB path, `MutexExportProperties`) and `_cacheProps` (`BiosignalCache`). The `dataCache` getter returns `_mutexProps || _cacheProps`.

### BiosignalCache

Simple non-SAB cache. Holds a single `SignalCachePart` (`{ start, end, signals: { data: Float32Array, samplingRate }[] }`). `insertSignals(part)` merges adjacent parts via `combineSignalParts`. No locking — safe for single-threaded (main-thread) access only.

### GenericBiosignalResource

Key properties:
- `_service` — the format-specific `BiosignalDataService` (e.g. `EegService`) that reads raw bytes
- `_montages[]` — list of available montages (one active at a time)
- `_activeMontage` — signals routed through this if set; `null` = raw signals displayed
- `visibleChannels` → `activeMontage.channels` (filtered) if montage active, else `_channels` (source)
- `signalCacheStatus: [start, end]` — tracks what portion of recording is loaded

Setting `activeMontage` stops prior montage signal caching, updates filters, and relays channel change events to resource listeners. All filter mutations (`setHighpassFilter` etc.) are async — they await `activeMontage.updateFilters()` which sends a commission to the montage worker.

### MontageService + MontageWorker

`MontageService` (main thread) owns the `MontageWorker` (or `MontageWorkerSubstitute` for non-SAB mode). Commission pattern:
1. `_commissionWorker(action, params)` → generates UUID → posts message → returns `{ promise }`
2. Worker processes, replies with same UUID
3. `handleMessage` matches UUID → resolves/rejects promise

Worker actions map: `get-signals`, `map-channels`, `set-filters`, `set-interruptions`, `setup-worker`, `setup-input-mutex`, `setup-input-cache`, `compute-trend`, `setup-trend`.

`setupWorker` initialises a `MontageProcessor` in the worker with the channel config and module settings. `get-signals` → `MontageProcessor.getSignals(range, config)` → derived `Float32Array[]` → transferred back.

### MontageProcessor

Lives entirely inside the montage worker (not transferred). Holds the actual signal math — channel derivation (active channels minus reference channels), filter application (highpass/lowpass/notch), downsampling. Reads raw signals from the cache/mutex. Key method: `getSignals(range, config)`.

### Property change events

Every setter on `GenericBiosignalResource` (and all assets) calls `_setPropertyValue(name, value)` which dispatches a `property-change:<name>` scoped event. The interface subscribes to these events to trigger Vue reactivity/redraws without direct coupling.

---

## EDF reader internals

### GenericSignalReader (core)

Runs **inside the format worker**. Key design:
- `_readAndCachePart(startRecord, process?)` → `_readSignalPart(start, end)` → `_readPartFromFile(start, length)` → HTTP `Range: bytes=start-end` fetch or `File.slice()` → blob → `decoder.decodeData()`
- Progressive loading: `cacheSignals()` loops `_readAndCachePart` with `sleep(10)` yield between chunks to avoid blocking the worker thread. Reports progress via `_updateCallback` (main thread updates `signalCacheStatus`).
- Two cache types: `BiosignalMutex` (SAB path, preferred) or `BiosignalCache` (JS heap fallback).
- `_awaitData` promise: if `getSignals(range)` is called before that range is cached, a timeout promise awaits until the background caching loop covers the requested range.

### Interruption handling

Discontinuous EDF+: cache stores signal in **data time** (gap-exclusive). `_readSignalPart` computes `priorGaps` (total interruption time before range) and `innerGaps` (within range). `getSignals` fills interruption periods with zeros in the output.

### EDF Worker

Single `READER = new EdfReader(SETTINGS)` instance per worker. Actions: `setup-worker` (parse EDF header, store URL), `setup-cache` (SAB mutex or fallback cache), `cache-signals` (progressive background load), `get-signals` (on-demand range fetch), `release-cache`, `shutdown`, `update-settings`. Progress updates posted back to main thread during background caching.

### EdfDecoder

`decodeData(header, buffer, byteOffset, startRecord, numRecords, priorGaps, raw)` → `Float32Array[]`. Digital→physical: `(v - dMin) × (pMax - pMin) / (dMax - dMin) + pMin`. EDF+ TAL records parsed for events and interruptions inline.

### Key design insight

The format worker is pure message-in/message-out. It has no knowledge of Vue or the runtime — only `WorkerMessage` / `WorkerResponse`. The format-specific service (e.g. `EegService`) on the main thread owns the worker lifecycle.

---

## EEG module internals

### EegStudyLoader → EegRecording creation

`EegStudyLoader.getResource(idx)` is called by `Epicurrents.loadStudy()`. It:
1. Extracts `channels`, `header` (already parsed by the importer, e.g. `EdfImporter`), and `formatHeader` from `study.meta`
2. Gets the EDF worker (`_studyImporter.getFileTypeWorker('eeg')`)
3. Constructs `new EegRecording(name, channels, header, worker, memoryManager, config)` — the recording owns the worker from this point

### EegRecording activation lifecycle

`prepare()` is called externally (by `Epicurrents.loadStudy`) after `getResource`. It commissions `EegService.setupWorker(header, study, options, formatHeader)` → sends `setup-worker` to the EDF worker → worker calls `READER.setupStudy(header, edfHeader, url)`. Worker returns `{ dataLength, recordingLength }` → `prepare()` sets `totalDuration` and `state = 'ready'`.

When `isActive` is set to `true` (user opens the recording), the `ACTIVATE` event handler runs:
1. Requests SAB memory (`requestMemory(totalMem)`) or sets up `BiosignalCache`
2. Calls `addDefaultSetupsAndMontages()` — loads bundled 10-20 JSON setups + standard montages (avg, lon, rec, trv), optionally extra montages (CZ-ref, Laplacian)
3. Starts `cacheSignals()` — progressive background loading

### Recording → Setup → Montage → Channel hierarchy

```
EegRecording
  _channels: EegSourceChannel[]   (one per raw signal in the file)
  _setups: EegSetup[]             (electrode position + channel matching)
    .channels: SetupChannel[]     (mapped: raw index → setup channel)
  _montages: EegMontage[]         (display derivations)
    .channels: EegMontageChannel[] (active - reference arithmetic)
```

`addSetup(config, channels)` → `new EegSetup(channels, config)` — matches EDF signal labels to setup channel names/patterns. First setup is stored as `this.setup` (the canonical one).

`addMontage(name, label, setup, template)` → `new EegMontage(name, recording, setup, template, manager)` → `montage.mapChannels()` → `mapMontageChannels(setup, config)` (core utility) → populates `EegMontageChannel[]` with `active`/`reference` indices. Then `montage.setupServiceWithInputMutex(mutexProps)` or `setupServiceWithCache(cache)` wires the montage's `MontageService` to the raw signal source.

### EegService (thin wrapper)

`EegService` is mostly a pass-through to `GenericBiosignalService`. Its only real addition is `setupWorker(header, study, options, formatHeader)` which:
- Extracts the EDF data file URL from `study.files` (filtered by `modality === 'eeg'` and `role === 'data'`)
- Commissions `'setup-worker'` to the EDF worker with the serializable header, URL, and optional auth header

All other commission handling (`cacheSignals`, `getSignals`, `setupMutex`, `setupCache`) is inherited from `GenericBiosignalService`.

### Event pattern filtering

`EegRecording.events` setter applies `ignorePatterns` (regex) and `convertPatterns` (regex → property map) from EEG module settings before calling the base class setter. This lets deployment-specific EDF annotation labels be suppressed or re-mapped without touching the decoder.

### EegMontage

Thin subclass of `GenericBiosignalMontage`. Key difference: constructor forces `overrideWorker: 'eeg-montage'` so the EEG montage uses its own named worker slot (different from the generic `'montage'` slot). `mapChannels()` reads EEG settings from the global runtime to build `ConfigMapChannels`.

### `unloadOnClose` setting

`EegRecording.isActive` setter checks `_SETTINGS.unloadOnClose`. If true, deactivating a resource calls `this.unload()` (releases SAB buffers, clears events/interruptions) so memory is freed when the recording is closed in the UI.

---

## Pyodide service internals (`@epicurrents/pyodide-service`)

### Overview

Provides a Python-in-browser compute service. Instead of implementing signal math in JS, complex algorithms (spectral analysis, topographic mapping) run as Python scripts inside a [Pyodide](https://pyodide.org) web worker.

### `PyodideService` (main-thread side)

Source: `pyodide-service/src/PyodideService.ts`

Key design: `biosignal.py` is imported at **build time** via Vite's `?raw` loader and bundled into the module — no network fetch needed:

```ts
import biosignal from './scripts/biosignal.py?raw'
const DEFAULT_SCRIPTS = new Map([['biosignal', biosignal]])
```

**Script caching** — each named script has a state tracked in `_scripts: Map<string, ScriptState>`:

| State | Meaning |
|---|---|
| `'not_loaded'` | Not yet sent to worker |
| `'loading'` | Commission sent, awaiting worker ack |
| `'loaded'` | Python executed successfully |
| `'error'` | Execution failed |

`runScript(name, script, params, deps)` is idempotent:
- If `'loaded'` → returns immediately (no re-execution)
- If `'loading'` → awaits the action waiter for that commission
- If `'not_loaded'` → sends `'run-script'` commission to worker, transitions to `'loading'`

`setInputMutex(input, dataDuration, recordingDuration, bufferStart)` auto-loads the `biosignal` script first (calls `runScript('biosignal', ...)`) before commissioning `'setup-input-mutex'`. This guarantees the Python-side global state is initialized before the SAB is wired.

`runCode(code, params, scriptDeps, transferList)` → `_commissionWorker('run-code', ...)` — for one-shot Python snippets that don't need persistent state.

### Worker stack

`pyodide-service/src/pyodide.worker.ts` — bare worker entry:
```ts
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js")
const PYODIDE = new PyodideMontageWorker()
onmessage = async (message) => { PYODIDE.handlePythonMessage(message) }
```

`PyodideMontageWorker` (in `workers/PyodideMontageWorker.ts`) extends `MontageWorker` from core, adding a Python layer on top of the signal-processing pipeline.

#### `PyodideMontageWorker` action map additions

| Action | Handler |
|---|---|
| `load-packages` | Loads additional Python packages into Pyodide |
| `run-code` | Executes an arbitrary Python string via `_runPythonCode()` |
| `setup-input-mutex` | Registers the SAB-backed `Float32Array` views as `_biosignal['buffers']` via `biosignal_set_buffers()`. No per-channel numpy array is allocated yet. |
| `setup-montage` | Creates `PyodideMontageProcessor(this._runPythonCode, this._settings)` |

**Initialization sequence**: `loadPyodideAndPackages()` always loads `['numpy', 'scipy']` (plus any extras requested). Then `setupMontage()` creates the processor.

#### `_runPythonCode(code, context, simulateDocument)` — the JS↔Python bridge

1. Binds each `context` property onto `self` (the global JS scope), making them accessible as `from js import <name>` in Python
2. Calls `pyodide.runPython(code)`
3. Converts Proxy result to JS via `.toJs({ dict_converter: Object.fromEntries, create_proxies: false })`
4. Destroys the proxy
5. Unbinds all context properties from `self`

This is the central mechanism — every Python call from TypeScript goes through this bridge.

### `biosignal.py` — signal processing global state

Source: `pyodide-service/src/scripts/biosignal.py`

A module-level `_biosignal` dict holds all shared state across calls:
```python
_biosignal = {
    'available_montages': [],
    'buffers': None,       # JS proxies for SAB-backed Float32Array views (set by biosignal_set_buffers)
    'input': [],           # list of per-channel numpy float32 arrays, lazily allocated on first access
    'output': [],          # JS typed array views for writing output
    'filters': { 'highpass': ..., 'lowpass': ..., 'notch': ... }
}
```

**SAB wiring** — `biosignal_set_buffers()`:
```python
from js import buffers
_biosignal['buffers'] = buffers
_biosignal['input'] = [None] * len(buffers)   # allocated on first touch
```

Pyodide 0.25 cannot alias an external `SharedArrayBuffer` into Python-visible memory: both `JsBuffer.to_py()` and `JsBuffer.to_memoryview()` materialise a snapshot at call time. Every refresh has to copy. To minimise per-call bandwidth, the design is **lazy-allocate + slice-refresh**:

- `_ensure_input_array(idx)` — full-channel-sized `np.zeros` is allocated the first time anything touches channel `idx`. Channels a compute step never touches never allocate.
- `_refresh_channel_range(idx, start, end)` — copies the metadata header (`sampling_rate`, `updated_start`, `updated_end`) plus `[start:end]` from the live SAB into the channel's numpy array via `buf.subarray(start, end).assign_to(target[start:end])`. The header is always refreshed so load-status checks see live values.

**Signal computation** — `biosignal_get_signals(channels)`:
- Per channel: derivation (`active_signal - reference_signal`)
- Butterworth bandpass/highpass/lowpass/notch applied via `sosfiltfilt` (zero-phase)
- Filter coefficients are **cached** by `(signal_fs, freq)` key to avoid recomputation
- Gap handling: removed before filtering, reinserted after
- Before reading: the active and reference channels for the requested derivation are slice-refreshed for `[start_pos:end_pos]`. A per-call `(channel_idx, start, end)` dedup set avoids re-copying the same slice when many montage channels share a reference (e.g. average reference).
- Returns list of filtered `Float32Array` buffers

**Batched preload** — `biosignal_refresh_channels(specs)`:
- Takes `specs : list of [channel_idx, start, end]` from JS.
- Calls `_refresh_channel_range` for each entry.
- Use this for workloads that read the same channel(s) repeatedly in many small windows: a trend computation that scans a full channel across many epochs (one bulk refresh of just the needed channels, then loop entirely in Python) or source-localization epoch extraction across scattered event timestamps (one batched refresh per event covering all channels). The viewer's per-frame `biosignal_get_signals` path does not need this — its own internal refresh handles small windows.

**Threading limitation**: Pyodide cannot block waiting for data. If the requested signal is not yet loaded (after the slice refresh), `biosignal_get_signals` prints a warning and returns the (mostly `None`) `signals` list early. The caller must ensure data availability before requesting.

### Analysis scripts (loaded on demand)

Located in `interface/src/app/modules/eeg/scripts/`:

**`psd.py`** — Power spectral density. Two functions:
- `psd_welch_periodogram()`: Welch's method with Hamming window (2-second window). Returns JSON `{ fs, channels }`.
- `psd_squared_fft_coeffs()`: Squared FFT coefficients (periodogram). Returns JSON array `[{ coeffs, frequencies }]`.
Both receive data from JS via `from js import data, fs` (the `_runPythonCode` context binding pattern).

**`topomap.py`** — EEG topographic mapping via MNE + matplotlib. Key design:
- Module-level `_topomap` dict holds pre-created matplotlib figures/axes and MNE `Evoked` object
- `topomap_set_montage()` — loads a standard MNE montage by name (e.g. `'standard_1020'`)
- `topomap_set_channels(channels, sfreq)` — creates MNE `Info` object
- `topomap_set_data(data)` — wraps numpy array into `mne.EvokedArray`
- `topomap_set_canvas(topomap_canvas, series_canvas)` — receives `OffscreenCanvas` handles from JS
- `topomap_draw_canvas(...)` — renders via MNE `plot_topomap()`, copies RGBA buffer to canvas via `ImageData`
- Mode `'avg'`: single average topomap. Mode `'dev'`: 3×3 propagation series grid at ±0.4×span offsets
- Channel masking via `channel_indices` parameter (marks selected channels with white circles)
- `topomap.py` requires `matplotlib` and `mne` — these are loaded on demand via `load-packages`

---

## Interface internals — DefaultInterface, store, rendering

### Overview

Vue 3 + Vuex application. `DefaultInterface` is the `InterfaceModule` implementation that creates the Vue app, wires it to the core runtime, and manages lifecycle. All signal rendering goes through WebGL (`WebGlPlot`).

### `DefaultInterface` (entry point)

Source: `interface/src/DefaultInterface.ts`

**Constructor sequence:**
1. Finds `#epicurrents<containerId>` container in the DOM
2. Optionally creates a **Shadow DOM** (`config.embedded = true`) to isolate styles from the host page; otherwise removes foreign page stylesheets
3. `createApp(VueApp)` → installs `EpicurrentsPlugin`, i18n, Vuex store, WebAwesome `v-property` directive
4. **Pyodide wiring**: listens on `add-resource` event bus event; for any `BiosignalResource` registers the `pyodide-core` and `pyodide-biosignal` dependencies and loads the `biosignal` script. Pyodide-side input arrays are refreshed lazily on demand from inside `biosignal_get_signals` / `biosignal_refresh_channels` — there is no per-`signalCacheStatus` push step
5. **Store subscriptions**: `load-study-folder` and `load-study-url` mutations delegate to `epicApp.loadStudy()`
6. **Fullscreen** tracking via `fullscreenchange` events → commits `set-fullscreen` to Vuex
7. Calls `loadModules(config.activeModules || [])` → for each module: fetches optional JSON config, calls `store.addModule()`. Resolves `awaitReady()` promise when all done
8. **Mounts Vue app** after `awaitReady()` + WebAwesome `allDefined()` both resolve (avoids fouc from unregistered web components)

### Vuex Store (`store/index.ts`)

**Key design**: The Vuex state **is** the `RuntimeStateManager` instance (the same object). No copying — the store holds a direct reference to the core runtime. This means Vue reactivity and the core runtime state are the same object.

Interface-specific properties are added directly to `runtime.APP` via `Object.assign`:
- `activeScope`, `activeModality`, `componentStyles`, `containerId`, `plots` (Map of BiosignalPlot), `settingsOpen`, `shadowRoot`, `showOverlay`, `uiComponentVisible`, `view`

**Getters:**
| Getter | Returns |
|---|---|
| `getBiosignalPlot` | Lazily creates `new WebGlPlot()` on first call, stores in `APP.plots.get('biosignal')` |
| `getResourceViewer` | Returns `resourceMod.getViewerComponent` for the active resource's modality |
| `getResourceControls` | Same pattern for controls component |
| `getResourceFooter` | Same pattern for footer component |

**Module registration** (`addModule()`): injects the module's `actions` and `mutations` into the live Vuex store via `hotUpdate()`. This is how EEG/EMG/etc. module actions become available in the store without knowing about them at store construction time.

**Local settings persistence** (`loadLocalSettings()`): reads `sessionStorage` / `localStorage` key `'epicurrents'`, applies only fields declared in module `_userDefinable` with correct constructor type. Session storage wins over local storage (allows per-tab settings isolation).

### `App.vue` (root component)

**CSS grid layout:**
```
top: menubar (calc(1.5rem + 1px) tall)
bottom: [dataset-navigator split-panel | interface-view]
```

**Interface views** — loaded conditionally based on `config.activeViews`:
- `default-interface` — always present
- `biosignal-interface`, `media-interface`, `radiology-interface` — lazy-loaded only if in `activeViews`

**Browser check**: requires `window.chrome` (Chromium-only API). Shows an error page with a bypass link (`?override`) on other browsers.

**Callout (toast) system**: floating `wa-callout` elements, fade out after 5s, removed at 10s.

**Dialogs** tracked in `reactive(dialogs)`: connector, dataset, url, settings, reload, log, instructions.

**File loading**: hidden `<input type="file">` elements triggered programmatically. Falls back to `window.showOpenFilePicker()` if available (shows native OS picker with MIME/extension filter). All file loading goes through `$store.dispatch('load-study-url', ...)` or `load-study-folder`.

**Theme**: CSS custom properties (`--epicv-background`, `--epicv-text-main`, etc.) under `.epicv-dark-theme` and `.epicv-light-theme`. WebAwesome components get matching `wa-dark` / `wa-light` class.

### Component hierarchy (EEG modality)

```
App.vue
  ├── AppMenubar
  ├── DatasetNavigator (resizable panel, left)
  └── default-interface / biosignal-interface
        └── EegViewer.vue (manages layout and state)
              ├── PlotYAxis (channel labels column)
              ├── TimescaleGrid (horizontal time markers)
              ├── EegPlot.vue (WebGL canvas → primary rendering)
              ├── AnnotationLabels (event markers overlay)
              ├── VerticalCursors (time cursor overlays)
              ├── ContextMenu (right-click actions)
              ├── AnnotationEditor
              ├── EegAnalysisTools (PSD, topomap windows)
              ├── AnnotationSidebar (right panel)
              └── EegNavigator (overview strip at bottom)
```

### `EegViewer.vue` (state + layout orchestration)

- Two nested `SplitPanelView` panels:
  - **Outer** (vertical split): signal area (top, ~80%) + navigator strip (bottom)
  - **Inner** (horizontal split): plot+overlays (left) + annotation sidebar (right)
- Tracks: `visibleRange`, `viewRange`, `secPerPage`, `pxPerSecond`, `plotDimensions`
- `useEegContext(store)` provides reactive access to `RESOURCE`, `SETTINGS`, `MONTAGE` from the EEG module's Vuex context
- Analysis windows (`EegAnalysisTools`) are floating `WindowDialog` components opened on signal selection (right-click drag)

### `EegPlot.vue` — Signal → WebGL rendering

Source: `interface/src/app/modules/eeg/components/EegPlot.vue`

**Signal data flow:**
1. `mounted()` hooks `RESOURCE.onPropertyChange('signalCacheStatus', checkCacheState)` to know when data is ready
2. Once `viewDataAvailable = true`, calls `drawPlot()`:
   - Gets `WebGlPlot` via `$store.getters.getBiosignalPlot()` (single shared plot instance)
   - Sets `pxPerSensRefUnit = screenPPI / 2.54` (px per cm, for μV/cm sensitivity display)
   - Calls `wglPlot.addTo(this.plot)` to mount canvas
3. `addTraces()`: iterates `RESOURCE.activeMontage.channels` (or raw channels), creates one `WebGlPlotTrace` per visible channel with color (laterality-aware: L=sin, R=dex, Z=mid), sensitivity, polarity, scale, baseline offset. Calls `wglPlot.addChannel(trace)`.
4. `updateTraces()`:
   - Calls `RESOURCE.getAllSignals([viewStart, viewStart + viewRange])`
   - Iterates signal response, calls `line.setData(response.signals[i].data, downSampleFactor)` per trace
   - Sets `newSignalData = true`
5. **Animation loop**: `requestAnimationFrame(newFrame)` — on each frame, if `newSignalData`, calls `wglPlot.update()` (uploads data to GPU, draws), sets `newSignalData = false`

**Property change triggers for re-render**: `RESOURCE.onPropertyChange(['filters', 'channels', 'sensitivity', 'viewStart'], updateTraces)`

**Downsampling**: if `samplingRate >= 2 × downsampleLimit × 2`, `downSampleFactor = floor(samplingRate / downsampleLimit)`. Only one sample per `downSampleFactor` samples is passed to the GPU buffer.

### `WebGlPlot.ts` — WebGL line renderer

Source: `interface/src/components/plots/biosignal/WebGlPlot.ts`

Custom implementation (inspired by [webgl-plot](https://github.com/danchitnis/webgl-plot)).

**Shaders:**
```glsl
// Vertex:
attribute vec2 coordinates;
uniform mat2 uScale;  // [1,0, 0,ampScale*polarity]
uniform vec2 uOffset; // [0, baseline*2-1]
void main() { gl_Position = vec4(uScale*coordinates + uOffset, 0.0, 1.0); }

// Fragment:
uniform highp vec4 uColor;
void main() { gl_FragColor = uColor; }
```

**Per-trace draw** (`_updateLines()`):
- `ampScale = 2 × 10^scale / (heightInSensRefUnits × sensitivity)` — maps physical amplitude to NDC
- `uOffset.y = baseline * 2 - 1` — positions channel vertically (NDC: -1 = bottom, 1 = top)
- `gl.bufferData(ARRAY_BUFFER, line.xy, STREAM_DRAW)` — uploads interleaved [x, y] pairs
- `gl.drawArrays(LINE_STRIP, 0, length)` — draws as a connected line

**Blend mode**: `SRC_COLOR × DST_COLOR` (multiply) — overlapping traces from different channels darken each other naturally.

**Trace x-geometry is TIME-based, and must stay that way.** `WebGlPlotTrace.initData` positions each datapoint at its offset from the view start as a fraction of the view duration:

```ts
clipSpaceStep = 2*(downsampleFactor/samplingRate)/viewRange   // one sample period as a share of the view
```

Normalising over the datapoint count instead (`2/length`) is *equivalent* only when the points exactly span the view, and the residual is one sample period — 0.04 % of the width at 256 Hz over a 10 s view (invisible), but **10 % at 1 Hz**. A `.e` recording mixes 256 Hz EEG with 1 Hz aEEG/CFM trends in one plot, so the low-rate case is real: with count-normalisation a 1 Hz trend pins its last point at a fixed fraction of the width and *stretches* as the view widens, instead of gaining a sample. The trace falls back to count-normalisation when `viewRange` is not passed — `EmgPlot` / `NcsPlot` / `AccPlot` still do this, which is harmless only because their channels are uniformly high-rate. Pass `viewRange` if a low-rate channel can ever appear in those plots.

Two invariants ride along:

- **Allocate `ceil(viewRange*rate/downsampleFactor) + 1` points**, not `floor(...)`. A range `[t, t+d]` contains up to `floor(d*rate)+1` samples; rounding down silently truncates the last in-range sample. The `+1` holds the datapoint past the view edge — `initData` gives it its true x (> 1) and WebGL clips it, which is what lets a line reach the right edge.
- **`pointCount`, not `length`, is what gets drawn.** `setData` records how many datapoints actually hold data; `_updateLines` / `_drawSegmentedLine` draw only those. Drawing `length` would trail a filler line from the last real sample whenever the data is short (recording end, partial cache).

`EegPlot.edgePadding()` requests **one** sample period of the *slowest visible* channel past the view end. A half-open view holds no datapoint at its end, so reading one beyond it is what lets a line reach the right edge — legitimate renderer lookahead, not a workaround. The trace's own `ceil(...)+1` allocation drops the surplus, so it costs nothing. It is a method, not a computed — the visible channel set changes with the active montage, and `RESOURCE.channels` is not reliably reactive, so a computed would cache a stale value.

One period is only sufficient because `GenericSignalReader.getSignals` returns `ceil(duration*samplingRate)` datapoints. It historically returned `Math.round(...)`, which drops the last datapoint whenever the range doesn't land on a sample boundary; with rounding, one period of lookahead leaves a gap at roughly half of all view widths (see the count contract below).

**`getSignals` count contract.** The response allocation and the slice taken from the cache are derived from the *same* datapoint count, and must stay that way. Sizing them independently lets them disagree by a datapoint: a short slice leaves a zero datapoint at the end of the signal, a long one overruns the array and `set` throws. Pinned by `getSignals datapoint count` in [core/tests/assets/GenericSignalReader.test.ts](epicurrents/core/tests/assets/GenericSignalReader.test.ts) — including the 256 Hz case, which must stay unchanged.

**Known residual at low rates.** `getSignals` returns a bare array per channel whose sample *k* is implied to sit at `range[0] + k/samplingRate`, but the underlying samples are only aligned to the recording, not to an arbitrary range start — the reader slices from `round((rangeStart - cacheStart)*rate)`. The presented times are therefore off by up to half a sample period: negligible at 256 Hz (2 ms), but up to half a second for a 1 Hz trend, which can make it appear to shift against the EEG while scrolling. The renderer and the serving layer agree on the contract, so nothing is internally inconsistent; fixing it means carrying an explicit sample phase (or absolute start time) per signal through the response — one `start` per part cannot express it, because each channel has its own phase at its own rate.

**`heightInSensRefUnits`**: when set, computes `pxPerSensRefUnit = canvasHeight / value`. When sensitivity reference unit is cm, this produces correct μV/cm amplitude display.

**Canvas**: positioned `absolute` within the plot `div`, pointer-events disabled (pointer handling is on the overlay div above it).

### Signal data end-to-end summary

```
viewStart changes (user navigates)
  → EegPlot.updateTraces()
    → RESOURCE.getAllSignals([start, end])
      → EegRecording → activeMontage.getAllSignals()
        → MontageService.getSignals() [commission to MontageWorker]
          → MontageWorker/MontageProcessor: derivation + filters → Float32Array[]
            ← back to main thread via postMessage
      ← getAllSignals() resolves with { signals: Float32Array[] }
    → line.setData(signals[i].data) for each WebGlPlotTrace
    → newSignalData = true
  → requestAnimationFrame → wglPlot.update()
    → gl.bufferData(xy) + gl.drawArrays(LINE_STRIP)
```

---

## Interface — plugin, store vocabulary, settings, and module system

### `EpicurrentsPlugin`

Source: `interface/src/epicurrents/EpicurrentsPlugin.ts`

Minimal Vue plugin. `install(app, options)` registers five globals via both `app.provide()` (Composition API) and `app.config.globalProperties` (Options API):

| Key | Value |
|---|---|
| `$config` | `window.__EPICURRENTS__.SETUP` — the startup configuration object |
| `$epicurrents` | The `EpicurrentsApp` instance |
| `$interface` | The `InterfaceModule` (the `DefaultInterface` instance) |
| `$eventBus` | `epicApp.eventBus` — the core typed event bus |
| `$runtime` | `epicApp.runtime` — the `RuntimeStateManager` |

Any component can then use `inject('$runtime')` or `this.$runtime` to reach the core runtime directly, without going through Vuex.

### Store actions vocabulary

Source: `interface/src/store/actions.ts`

Actions split into two behavioral categories:

**Broadcast-only actions** — do nothing themselves, exist so components can `subscribeAction` on them:
- `display-callout`, `display-viewer`, `load-dataset-progress`, `overlay-clicked`, `pointer-left-app`, `redo-action`, `undo-action`, `toggle-dialog`, `create-dataset`

**State-mutating actions** — validate, then commit a mutation:
- `set-active-resource`: key action. First awaits `disableAllOtherResources()` (deactivates all other resources, waits for each deactivation if memory manager is in use to avoid SAB race conditions). Then checks that the view required by the resource's modality (`INTERFACE.modules.get(modality)?.settings?.compatibleView`) is available. Then commits `SET_ACTIVE_RESOURCE`.
- `set-view`: looks up the view in `applicationViews` map, commits `SET_VIEW`, then applies per-view UI component defaults (e.g., hiding the navigator in some views).
- `toggle-ui-component` / `set-ui-component-visible`: guard against unknown component names before committing.
- `toggle-fullscreen`: uses browser fullscreen API directly.
- `set-settings-value`, `add-dataset`, `set-active-dataset`, etc.: thin wrappers.

**Promise-bridge actions** — `load-study-url`, `load-study-folder`, `load-study-file`:
```ts
let resolve, reject
const promise = new Promise((res, rej) => { resolve = res; reject = rej })
commit(LOAD_STUDY_URL, { study: payload, promise: { resolve, reject } })
return promise
```
The commit is broadcast-only. `DefaultInterface` subscribes to it and calls `epicApp.loadStudy()`, resolving the promise when done. This decouples the store from knowing about the Epicurrents API.

### Store mutations vocabulary

Source: `interface/src/store/mutations.ts`

**Broadcast-only mutations** — body is `null`, exist only as subscription trigger points:
- `add-styles`, `load-dataset-folder`, `load-study-file`, `load-study-folder`, `load-study-url`

**State mutations** — directly modify `state.APP.*` or delegate to `RuntimeStateManager`:

| Mutation | What it does |
|---|---|
| `set-active-resource` | Calls `state.setActiveResource(payload)` on the runtime; sets `APP.activeModality` |
| `set-settings-value` | Tries `INTERFACE.setFieldValue()` first, then `state.setSettingsValue()`. If changed and user-definable, persists to `sessionStorage` (and `localStorage` if it already exists) |
| `accept-disclaimer` | Sets `INTERFACE.app.disclaimerAccepted = Date.now()` and saves to storage |
| `toggle-expand-viewer` | Mutates `INTERFACE.app.isExpanded`, then calls `INTERFACE.onPropertyUpdate()` to fire registered property change handlers (necessary because INTERFACE is not reactive) |
| `set-active-dataset` | Delegates to `state.setActiveDataset(payload)` on the runtime |
| `add-connector` / `remove-connector` | Delegates to `state.addConnector()` / `state.removeConnector()` |
| `set-view` | `state.APP.view = payload` |
| `set-fullscreen` | `state.APP.isFullscreen = payload` |

**Key insight on `set-settings-value`**: Interface settings (`INTERFACE`) take priority over core runtime settings. The mutation calls `INTERFACE.setFieldValue()` first — if the field exists there, it's set and the core runtime is never touched. This lets the interface layer shadow/override any core setting without conflict.

### `INTERFACE` singleton and settings system

Source: `interface/src/config/index.ts`

`INTERFACE` is a **module-level singleton object** (not reactive, not in Vuex state). It runs in parallel with the core `SETTINGS` object and holds interface-specific settings. It has its own property change handler registry (`_PropertyChangeHandlers[]`) — separate from the core `scoped-event-bus` system.

**`INTERFACE.setFieldValue(field, value)`**: dotted path traversal (e.g. `'eeg.sensitivity'` → looks up `eeg` module settings → `sensitivity` field). Auto-converts hex/rgba strings to settings color objects. Validates constructor type match before writing. Calls `INTERFACE.onPropertyUpdate()` on success.

**`applicationViews`**: `Map<string, ApplicationView>` with keys `'biosignal'`, `'default'`, `'media'`, `'radiology'`. Populated from per-view config files. Used by `set-active-resource` to switch to the correct view for a modality.

### `useContext(store, context)` — the universal composable

Every component in the interface calls a variant of this. It returns:

```ts
{
    ID: string,          // Unique per-call ID for event subscription tracking
    RUNTIME: StateManager,
    PYODIDE: { service: PythonInterpreterService | null, usesMemoryManager: boolean },
    SCOPE: string,       // e.g. 'eeg'
    SCHEMAS: ...,        // Module-specific JSON schemas
    SETTINGS: Proxy,     // See below
    getFieldValue(field, depth?): SettingsValue,
    setFieldValue(field, value): boolean,
}
```

**`SETTINGS` is a `Proxy`**: reads try interface settings first (`INTERFACE.modules.get(context)?.settings`), then core runtime settings (`store.state.SETTINGS.modules[context]`). Writes go to core runtime settings first, then interface settings. This shadow pattern means interface settings always override core without needing to copy values.

**Specialised variants:**
- `useAppContext(store)` — context `'app'`, typed to `AppSettings & AppModuleSettings`
- `useBiosignalContext(store)` — context of the active modality, adds typed `RESOURCE: BiosignalResource`
- `useEegContext(store)` — context `'eeg'`, adds typed `RESOURCE: EegResource` and `SETTINGS` typed to `EegModuleSettings & EegInterfaceSettings`

The `ID` field is consumed by `RESOURCE.onPropertyChange(field, handler, ID)` — when a component unmounts it passes `ID` to `removeAllEventListeners(ID)` to clean up all subscriptions at once without tracking individual handlers.

### EEG module registration

Source: `interface/src/app/modules/eeg/index.ts`

The `runtime` export is a plain object (not a class) that satisfies `InterfaceResourceModule`:

**`applyConfiguration(config)`**: processes a `EegModuleConfiguration` JSON (from config file or inline object):
- `epochMode.enabled/epochLength/onlyFullEpochs`
- `extraMontages`: per-setup arrays of montage templates (URL strings → fetched, or inline objects)
- `extraSetups`: setup config objects (URL strings → fetched)
- `hotkeys`: annotation, examine, fft, topogram hotkeys

**Component getters** — all lazy-loaded:
```ts
getViewerComponent: () => loadAsyncComponent(() => import('./components/EegViewer.vue'))
getControlsComponent: () => loadAsyncComponent(() => import('./components/EegControls.vue'))
getFooterComponent: () => loadAsyncComponent(() => import('./components/EegFooter.vue'))
```
These are called by the store's `getResourceViewer/Controls/Footer` getters whenever the active resource modality is `'eeg'`.

**`resourceLifecycleHooks.created(resource)`**: called when a new `EegResource` is added to the runtime. Automatically applies all `settings.extraSetups` and `settings.extraMontages` to the resource — this is how deployment-specific montage configurations propagate into newly loaded recordings without touching core EEG module code.

**`setPropertyValue`**: initially a no-op stub. Overridden by `AppStore.addModule()` to:
```ts
module.runtime.setPropertyValue = (property, value) =>
    this.runtime?.setModulePropertyValue('eeg', property, value)
```
So EEG actions like `SET_SENSITIVITY` call `runtime.setPropertyValue('sensitivity', value)` → `RuntimeStateManager.setModulePropertyValue('eeg', 'sensitivity', value)` → updates the EEG module's settings in the core runtime.

**EEG-specific Vuex actions** (prefixed `'eeg.'`):
- `eeg.set-active-montage`, `eeg.set-sensitivity`, `eeg.set-timebase`
- `eeg.set-highpass-filter`, `eeg.set-lowpass-filter`, `eeg.set-notch-filter`
- `eeg.set-cursor-tool`, `eeg.set-open-sidebar`, `eeg.set-report-open`
- `eeg.toggle-annotation-sidebar` (broadcast only)

All injected into the live Vuex store via `hotUpdate()` when `loadModules()` runs.

---

## Subscribing to viewer events from platform Vue components

Project-specific Vue components (e.g. `PhasePanel.vue` in `frontend/src/projects/prehos/`) run outside the viewer's own Vue app but share the same `window.__EPICURRENTS__.EVENT_BUS`. The following pitfalls are non-obvious.

### The bus is null at mount time

`window.__EPICURRENTS__.EVENT_BUS` starts as `null` and is assigned by the Epicurrents constructor during viewer initialisation. A component that calls `bus.addEventListener` in `onMounted` synchronously will get `null` and register nothing.

**Fix**: await `waitForEventBus()` from `frontend/src/projects/eventBus.ts` before registering any listeners. It polls every 50 ms and resolves once the bus is non-null (times out after 10 s).

```ts
import { waitForEventBus } from '../eventBus'

let isMounted = false

onMounted(async () => {
    isMounted = true
    let bus: EventTarget
    try {
        bus = await waitForEventBus()
    } catch {
        return  // viewer never initialised — nothing to do
    }
    if (!isMounted) return  // component was destroyed while waiting
    bus.addEventListener('property-change:activeResources', onActiveResourcesChanged)
})

onUnmounted(() => {
    isMounted = false
    window.__EPICURRENTS__?.EVENT_BUS
        ?.removeEventListener('property-change:activeResources', onActiveResourcesChanged)
})
```

### How `dispatchScopedEvent` reaches plain `addEventListener`

`GenericAsset.dispatchEvent(event, phase, detail)` calls `_eventBus.dispatchScopedEvent(event, this.id, phase, detail)`. That method:
1. Calls all matching scoped subscribers registered via `addScopedEventListener` directly.
2. Creates a `CustomEvent` and calls `this.dispatchEvent(e)` — the standard `EventTarget` method — which reaches any listener registered with plain `addEventListener`.

Step 2 happens for **both** phases when the `CustomEvent` is not cancelable (the default). This means plain `addEventListener` receives 'before' and 'after' events alike. Filter by `(e as CustomEvent).detail?.phase === 'before'` if you only want the final value.

### `detail` shape by dispatch type

| Dispatch method | `detail` fields |
|---|---|
| `dispatchPropertyChangeEvent(prop, newValue, oldValue)` | `{ property, newValue, oldValue, phase, scope, origin }` |
| `dispatchPayloadEvent(event, payload)` | `{ payload, phase, scope, origin }` |

### Useful events for biosignal project panels

| Event | Fired by | `detail.newValue` / `detail.payload` | When |
|---|---|---|---|
| `property-change:activeResources` | `GenericDataset` | `DataResource[]` — the new active set | Recording opened/switched in viewer |
| `property-change:displayViewStart` | `GenericBiosignalResource` | `number` — seconds from recording start | View scrolled |
| `property-change:viewStart` | `GenericBiosignalResource` | `number` | View position committed (after scroll inertia) |
| `property-change:events` | `GenericBiosignalResource` | `BiosignalEvent[]` | Annotation created/moved/deleted |
| `add-dataset` | `RuntimeStateManager` | dataset object (payload) | New dataset loaded |
| `set-active-resource` | `RuntimeStateManager` | `DataResource \| null` (payload) | Active resource changed |
| `epoch-changed` | `EegViewer` (scope `interface`) | `{ resourceId, epochNumber, epochStart, epochLength }`; null `epochNumber` outside centered display | Focused epoch changes in centered (semi-epoch) display |

The focused-epoch index cannot be derived from `displayViewStart` (adjacent epochs clamp to the same view start at the recording edges), so `EegViewer` pushes it under the `interface` scope via `InterfaceEvents.EPOCH_CHANGED`. A consumer that subscribes after the last change can dispatch `InterfaceEvents.REQUEST_EPOCH` (scoped, `interface`) to pull the current value; the viewer answers with `epoch-changed`.

### Accessing the current resource without waiting for an event

After the bus is live, the currently active resource can be read directly:

```ts
const runtime = (window.__EPICURRENTS__ as unknown as {
    RUNTIME?: { APP?: { activeDataset?: { activeResources?: DataResource[] } } }
})?.RUNTIME
const resource = runtime?.APP?.activeDataset?.activeResources?.[0] ?? null
```

---

## Biosignal trends

### Architecture

A **trend** is a derived per-epoch signal computed from one or more montage channels. The first concrete trend type is **`'amplitude'`** (aEEG — amplitude-integrated EEG), but the infrastructure is generic; future types include frequency spectrogram, brain symmetry index, etc.

| Layer | Class / Symbol | Role |
|---|---|---|
| Type union | `BiosignalTrendType` (`'amplitude'`) in `core/src/types/biosignal.ts` | Extend this union per new trend type |
| Base asset | `GenericBiosignalTrend` (concrete, not abstract) | Owns `signal[]`, `derivation`, `epochLength`, `samplingRate`; calls `service.setupTrend()` in constructor; `computeTrend(range?)` streams epoch results into `_signal` and emits `'trend-epoch'` / `'trend-complete'` / `'trend-error'` |
| Concrete trend | `EegAmplitudeIntegratedTrend` in `eeg-module/src/components/` | Fixes `type: 'amplitude'`, NICU-standard defaults (15 s epochs, 2 / 15 Hz band-pass) |
| Math | `computeAmplitudeIntegratedEpoch` / `compressAmplitudeValue` in `core/src/util/signal.ts` | Pure functions: band-pass → rectify → envelope (min/max or 5/95 percentile) → semi-log compress |
| Per-epoch compute | `MontageProcessor.computeTrendEpoch(name, epochIndex)` | Reads montage signals, builds derived `(source − reference)` array, dispatches by `derivation.type` |
| Loop + cancellation | `MontageProcessor.computeTrend(name, range?)` + `_cancelledTrends` set | Loops epochs, `postMessage` per epoch (`'trend-epoch'`), supports cooperative cancel |
| Worker actions | `'setup-trend'`, `'compute-trend'`, `'cancel-trend-computation'` in `MontageWorkerCommission` | All keyed by trend `name` — multiple trends can coexist on one montage |
| Service | `MontageService.computeTrend(name, range?)` / `setupTrend(...)` | Tracks per-trend computation in `_trendComputations: Map<string, ...>`; routes `'trend-epoch'` / `'trend-complete'` / `'trend-cancelled'` messages back to the right trend |
| Registry | `GenericBiosignalMontage._trends` + `addTrend` / `getTrend` / `removeTrend` / `removeAllTrends` | Dispatches `property-change:trends` |
| Lifecycle | `EegRecording._setupAeegTrend()` + `ensureAeegTrendSetup()` | Setup runs on `SIGNAL_CACHING_COMPLETE` + active-montage change. Compute is gated on `settings.aeeg.autoCompute` (default `false`) OR a pending setup request from the UI — `EegViewer.setTrendVisible(true)` calls `RESOURCE.ensureAeegTrendSetup()` to register that request. The flag is one-shot so subsequent montage changes don't re-fire the heavy compute without another toggle |
| Resolver | `resolveAeegDerivation(montage, source, reference)` in `eeg-module/src/util/derivation.ts` | Two strategies: direct bipolar channel name match (`'p3-p4'`) → fall back to individual electrodes (works on the `'rec'` referential montage) |
| Settings | `CommonBiosignalSettings.trends.amplitude` (math) + `EegModuleSettings.aeeg` (derivations, display) | EEG defaults set in `eeg-module/src/config/index.ts` |

**Important design choices**:
- Trend math is generic in core; the per-modality wrapper class (e.g. `EegAmplitudeIntegratedTrend`) only fixes the trend `type` and supplies defaults. To add a new trend type (e.g. brain symmetry index), extend the `BiosignalTrendType` union, add a `compute*` math function in `core/src/util/signal.ts`, dispatch on the new type inside `MontageProcessor.computeTrendEpoch`, and (optionally) create a per-modality wrapper class.
- The signal layout is implicit: amplitude trends produce interleaved `[min0, max0, min1, max1, …]` per epoch. The renderer reads `signal.length / 2` epochs. Future trend types should document their layout in the wrapper class.
- The service abstraction (`BiosignalMontageService.computeTrend`) is what enables a future "compute on the backend" mode — swap the worker implementation, keep the same interface. Today's worker computes everything in JS via Fili.js; nothing else needs to change to offload to a backend service.

### Interface — `EegTrend.vue` (general-purpose trend strip)

`interface/src/app/modules/eeg/components/EegTrend.vue` is a standalone component (not coupled to `EegNavigator`). It:

- Mirrors the navigator's horizontal layout: 80 px left gutter for derivation labels, plot canvas in the middle, 30 px right padding for the amplitude scale and to keep the x-axis aligned with the navigator below it.
- **Two-canvas pattern** (same as `EmgNavigator`): heavy `drawTrends()` paints the bands on the main canvas; lightweight `drawViewbox()` paints the red view-position bar on a second absolutely-positioned canvas. Scrolling only repaints the viewbox layer.
- **Viewbox bitmap is height-fixed at 1 px** and stretched to fill the strip via CSS (`:style="{ width, height: canvasHeight - 2 + 'px' }"`). The width attribute must also be set in CSS — modern browsers compute an implicit `aspect-ratio` from the canvas `width`/`height` attributes, and leaving CSS width unset makes the canvas explode horizontally when only the CSS height is bound. With a fixed bitmap height, `height` changes on the trend strip never auto-clear the viewbox bitmap, so the red bar survives resizing without a redraw.
- Subscribes to the active montage's `trends` property and to each trend's `'trend-epoch'` / `'trend-complete'` events for progressive rendering.
- Dispatches by `trend.derivation.type`: today only `'amplitude'` (`_drawAmplitudeBand`) — new types add new branches and new `_draw*` methods.
- `displayMode` prop ("separate" / "superimposed" / null=fallback to setting) is overridable by the parent so layout breakpoints can force `superimposed` when the strip is compressed.

#### Amplitude scale and zero-line

- The right 30 px padding hosts a small Hellström-Westas amplitude scale. Tick markers at 10, 20, 50, 100, 200 and 500 µV — 10 and 100 are labelled, the rest are bare tick lines. Compression follows `compressAmplitudeValue` in `core/src/util/signal.ts` so tick y-positions match the rendered band exactly. The `compressMicrovolts` helper in `EegTrend.vue` duplicates the formula for the label positioning, deliberately kept local because the scale is presentation-only.
- The scale anchor (`.scale`) is positioned at `right: 30px` (= the canvas's right edge). Tick lines extend leftward into the canvas; numeric labels float rightward into the padding. Both are vertically centred on their value's y-coordinate via `transform: translateY(-50%)`.
- In stacked (separate) mode the scale is drawn per slot. In superimposed mode there's a single full-strip scale.
- A **zero-line separator** is drawn between adjacent slots in stacked mode (`drawTrends` final loop). The separator is the bottom of the upper slot and the top of the lower slot — i.e. value = 0 for the upper trend. Painted in the navigator's `borderColor`.

#### Derivation labels — side-aware colours and slot anchoring

- Side-aware colour resolution: `_sideColorForTrend(name)` matches the trend's `aeeg-<id>` name and returns `SETTINGS.trace.color.sin` (`left`), `.dex` (`right`), or `.mid` (`central`/`mid`). Falls back to the colour stored on the trend asset itself. This keeps trend bands in sync with the EEG side-colour theme so a single setting change re-themes both raw EEG traces and aEEG bands.
- Labels render text first, colour dot second — the dot sits closest to the trend band on the right.
- **Layout modes** (`labelStyles` computed):
  - `layout-separate`: each label is `position: absolute` with `bottom: canvasHeight - slot.bottom + 'px'`, anchoring its bottom edge to the slot's zero-line.
  - `layout-superimposed`: container is a `flex-direction: column; justify-content: flex-end; align-items: flex-end` so labels stack at the bottom-right of the combined area.
- Labels are right-aligned via `right: 0.5rem` in separate mode and via flex `align-items: flex-end` in superimposed mode. The legend shows the **electrode/derivation name only** (`C3`, `P3-P4`, …) — the "Left"/"Right" prefix was stripped because the side colour already conveys the hemisphere.

### `EegNavigator.vue` — also uses the two-canvas viewbox split

Identical pattern: `drawNavigator()` paints the heavy content (events, highlights, channel rejection, cached/loaded bars, interruptions, ticks), `drawViewbox()` paints the red bar on a second canvas overlay. `RESOURCE.onPropertyChange('displayViewStart', drawViewbox)` and the `visibleRange` watcher both target `drawViewbox` only.

CSS pattern (applies to both):
```css
.timeline { position: relative; }
.timeline > canvas + canvas { position: absolute; top: 10px; left: 0; }
```

The viewbox canvas also gets `style="pointer-events: none;"` inline so clicks pass through to the main canvas.

### EegViewer split-panel layout (with trend strip)

The viewer is two nested `SplitPanelView` instances (`interface/src/app/views/SplitPanelView.vue` wraps `wa-split-panel`):

```
outer (orientation=vertical, primary-slot=end)
├── start: inner split (horizontal: plot | annotation sidebar)
└── end: bottom-stack
        ├── EegTrend           (flex 1 1 auto, min-height: 0)  ← optional
        └── EegNavigator       (flex 0 0 auto)
```

**Bottom-slot sizing breakpoints** (all in `EegViewer.vue`):

| Bottom slot height | Behaviour |
|---|---|
| `< 75 px` | Forbidden — clamped by `:primary-size-bounds[0]` |
| `75 px` (no trend) | Navigator only, full slot |
| `75 px` (trend on) | Trend hidden, navigator owns full slot (`effectiveTrendVisible = false`) |
| `75–115 px` (trend on) | `trendHeight < 40` → trend hidden, navigator gets full slot |
| `115–155 px` (trend on) | Trend shown, forced `'superimposed'` mode (`trendHeight < 80`) |
| `≥ 155 px` (trend on) | Trend shown, mode follows `SETTINGS.aeeg.displayMode` |

**Toggling**: `eeg.set-trend-visible` (payload `boolean`) and `eeg.toggle-trend-visible` are broadcast Vuex actions. `EegViewer.subscribeAction` listens and calls `setTrendVisible(visible)`, which:
- Sets `trendVisible` (local ref).
- On toggle-on: expands `navigatorHeight` to `75 + 150 = 225 px` if it's currently smaller. (We don't shrink past a user-set larger size.)
- On toggle-off: **snaps back** to `75 px` per the design choice — the trend's size is not remembered.

**`SplitPanelView.primaryStartSize` reactivity gotcha**: the prop name suggests "initial" but the watcher in `SplitPanelView.vue` mirrors the prop → internal `primarySize` ref so updates after mount actually move the divider. Without the watcher, `navigatorHeight.value = newSize` from a parent has no visual effect.

**Bottom-slot bounds** (`bottomSlotBounds` computed) are dynamic:
- Trend off: `['75px', '20%']` (legacy cap)
- Trend on: `['75px', '40%']` (allow room for the trend strip)

### Adding a new trend type

1. **Type union**: add the new literal to `BiosignalTrendType` in `core/src/types/biosignal.ts`.
2. **Math**: add `compute<Whatever>Epoch(signal, samplingRate, options)` to `core/src/util/signal.ts`. Return a `number[]` representing one epoch's output samples — interleave coordinates if your trend has multi-dimensional output (mirroring the amplitude trend's `[min, max]`).
3. **Dispatch**: extend `MontageProcessor.computeTrendEpoch` with a branch for the new `derivation.type`.
4. **Wrapper class** (optional but recommended): per-modality, similar to `EegAmplitudeIntegratedTrend`, that fixes the type and supplies module-specific defaults (epoch length, output sample rate, derivation).
5. **Settings**: extend `CommonBiosignalSettings.trends` if the new type needs math knobs, or per-modality settings (`EegModuleSettings`) if the defaults are EEG-specific.
6. **Renderer**: add a `_draw<Whatever>Band` (or `_draw<Whatever>Heatmap` etc.) method to `EegTrend.vue` and dispatch on `trend.derivation.type` inside `drawTrends()`.
7. **Lifecycle**: if the new trend should auto-instantiate, mirror the `_setupAutoAeegTrend()` pattern in `EegRecording`.

---

## Worker bundle exports

Every package that ships its own worker (core, the readers, the services) exposes the **self-contained `umd/` worker bundles** through two `exports` keys:

```json
"./workers/*": "./umd/*",
"./umd/*": "./umd/*"
```

The `umd/*.worker.js` files are the runnable, dependency-inlined bundles (webpack `build:umd`) suitable for `inlineWorker(src)` after a `?raw` import — e.g. `import edf from '@epicurrents/edf-reader/workers/edf.worker.js?raw'`. The `dist/workers/*.worker.js` files are TSC ESM with bare imports and are **not** runnable as a standalone worker; do not export or `?raw`-import those for inlining.

When adding a new worker-bearing package, add the same two keys. `interface/scripts/workers.mjs` auto-discovers any `@epicurrents/*` package with a `umd/` directory, so no list needs updating there.

## Worker commission design — three places to keep in sync

Each off-thread processor (montage, EDF, etc.) reaches the worker through a **commission** — a typed message with a string `action` plus action-specific payload fields. The shape is one piece of code and the dispatch lives in three places that must stay aligned.

### 1. The type union (single source of truth)

`core/src/types/biosignal.ts` defines:

```ts
export type MontageWorkerCommission = {
    'cancel-trend-computation': WorkerMessage['data'] & { name: string }
    'compute-trend':            WorkerMessage['data'] & { name: string, range?: number[] }
    'get-signals':              WorkerMessage['data'] & { range: number[], config?: …, montage?: string }
    'setup-trend':              WorkerMessage['data'] & BiosignalTrendProperties & { name: string }
    // …
}
export type MontageWorkerCommissionAction = keyof MontageWorkerCommission
```

A commission added here gets type-checked everywhere it's posted from. **Always add here first.**

### 2. The real worker — action map (`core/src/workers/montage.worker.ts`)

```ts
protected _actionMap = new Map<
    MontageWorkerCommissionAction,
    (message: WorkerMessage['data']) => Promise<boolean>
>([
    ['cancel-trend-computation', this.cancelTrendComputation],
    ['compute-trend',            this.computeTrend],
    // …
])
```

`base.worker.ts:handleMessage` looks up the action in `_actionMap` and calls the handler. Each handler calls `validateCommissionProps(...)` to type-narrow the payload, does work, and returns via `this._success(...)` / `this._failure(...)` — both wrap `postMessage` with the original `rn` correlation ID.

### 3. The substitute — switch statement (`core/src/assets/biosignal/service/MontageWorkerSubstitute.ts`)

When `useMemoryManager === false` (no SAB), the service uses `MontageWorkerSubstitute` instead of a real Worker. The substitute is a plain class that the service `.postMessage(...)`s commissions to, and it sends replies back via `.returnMessage(...)`. The dispatch is a hand-written `switch (action) { case 'foo': ... }` over the same action names.

Because the action map and the switch are two separate places, **adding a new action to the union and the worker is not enough — you must also add a case to the substitute switch**. The compiler does not catch the omission; the failure mode is `Action 'X' is not implemented` at runtime, as happened with the initial aEEG landing.

Inside a substitute case, replies use `this.returnSuccess(message)` / `this.returnFailure(message)`; out-of-band notifications (e.g. per-epoch `'trend-epoch'` messages from inside `MontageProcessor`) need the processor's `_postMessage` callback to be wired to `this.returnMessage.bind(this)` — see the `MontageProcessor` constructor's second parameter.

### 4. Subclass workers (`PyodideMontageWorker extends MontageWorker`)

Subclasses inherit `_actionMap` and any new actions added via `extendActionMap([...])`. Trend actions added to the base worker are picked up automatically here — no per-subclass change required (provided the subclass doesn't shadow the action map or override `handleMessage`).

### Adding a new commission — checklist

1. Add the entry to `MontageWorkerCommission` in `core/src/types/biosignal.ts`.
2. Add a handler method to `MontageWorker` and register it in `_actionMap`.
3. Add a matching `case` to `MontageWorkerSubstitute.postMessage`.
4. If the processor needs to push out-of-band notifications, route them through `this._postMessage(...)` rather than calling `postMessage` directly so the substitute can intercept them.
5. Add the dispatching method on the service (`MontageService` for montage) and wire the response actions in `handleMessage`.

### Simplification notes (deferred)

A cleaner design would share the action map between the real worker and the substitute. Sketch:

- Move `_actionMap` into a base class shared by `MontageWorker` and `MontageWorkerSubstitute`.
- Each handler reads from `data` and writes back through an injected `reply` callback (`postMessage` in the worker, `returnMessage` in the substitute).
- Removes the second hand-maintained switch entirely; substitutes become a thin wrapper that routes incoming `postMessage` to `handleMessage` and forwards `_postMessage` to `returnMessage`.

This is a bigger refactor than was warranted for v1 aEEG; capture it as a roadmap item once trends are stable.

## `Log.announce` — boolean or custom string

[`scoped-event-log/src/Log.ts`](util/scoped-event-log/src/Log.ts) `LogEventContext.announce` accepts `boolean | string`. The `App.vue` listener (`Log.addEventListener(['ERROR', 'WARN'], …)`) pipes any truthy `announce` into the viewer's `addCallout` toast surface:

- `announce: true` — toast uses `event.message` verbatim. Right when the log line is already user-friendly.
- `announce: "Custom message"` — toast uses the string; the log line keeps its own (typically technical) message. Right when the log should stay grep-friendly for SIEM / debugging but the user needs plain prose.
- `announce: false` / omitted — log line only, no toast.

Used by the platform's edu hooks ([`frontend/src/projects/edu/annotations.ts`](../src/projects/edu/annotations.ts)) for closed-session callouts and submission-state notices, where the log entry is keyed for parsing (`edu: session <token> closed; further changes will not be saved`) and the toast is plain prose (`"This teaching session is closed for submissions. Any changes you make will not be saved."`). The aliasing that lets platform-side code reach `scoped-event-log` is wired in [`frontend/tsconfig.app.json`](../tsconfig.app.json) and [`frontend/vite.config.ts`](../vite.config.ts).

## Gotchas

### `wa-reposition` fires before wa-split-panel re-renders — `offsetHeight` is stale

wa-split-panel's `handlePositionChange` calls `dispatchEvent(new WaRepositionEvent())` synchronously, **before** the LitElement render() applies the new grid-template style. `SplitPanelView.handleDividerMove` listens for `wa-reposition` — if it reads `this.end.offsetHeight` at that moment, the value reflects the PRE-RENDER layout and lags the actual divider position by one frame.

This bug had two distinct manifestations:

1. **Programmatic toggle didn't collapse the slot** (trend strip toggle off): an earlier "echo-suppression" filter in `SplitPanelView.primaryStartSize` watcher compared incoming prop values against a tracked `lastEmittedSize` populated from the stale `offsetHeight`. After toggle-on (75 → 225) the stale event poisoned `lastEmittedSize = 75`, and the next toggle-off back to 75 was filtered as an echo.

2. **Manual resize → infinite 2-pixel oscillation** (77 ↔ 79 indefinitely): during user drag, the stale `offsetHeight` consistently lagged the live position by one frame, so the loop `drag → emit(stale) → parent updates navigatorHeight → prop change → wa-split-panel re-renders → emit(new stale) → …` never converged. The previous 1-pixel parent filter caught only single-frame echoes; 2-frame lag slipped through.

**Resolution**: `SplitPanelView.handleDividerMove` schedules its measurement via `requestAnimationFrame`. By the time the callback runs, LitElement has rendered and CSS layout has applied the `clamp(var(--min), …, var(--max))`, so `offsetHeight`/`offsetWidth` accurately reflect the *displayed* slot size. The 1-frame delay (~16 ms) is below the perceptible threshold for resize feedback.

The parent `handleNavigatorResize` filter drops from `<= 1` to `< 0.5` (sub-pixel only) — real user drags of 1 pixel propagate, while float-precision round-trip echoes still get filtered. The previous `SplitPanelView.primaryStartSize` watcher echo filter is removed entirely; the rAF defer + sub-pixel parent filter together break all three feedback scenarios.

**Why not read `panel.positionInPixels` directly?** That property updates synchronously inside `handlePositionChange` *before* `wa-reposition` is dispatched, so it's live — but it's also **unclamped**: it stores the user's full drag target even when the CSS bounds keep the displayed slot at a smaller size. Propagating it would let `navigatorHeight` grow past the configured maximum (`primary-size-bounds`), which is what made the bounds appear to disappear. `offsetHeight` measured one frame later is the only reading that respects the bounds.

**Guard against invalid values at the parent**: on initial mount wa-split-panel's `connectedCallback` runs before its host is laid out — `detectSize()` returns 0, and the first Vue-driven attribute set computes `Infinity`/`NaN` internally. Any transient `wa-reposition` fired during this window would emit an offsetHeight of 0 (slots not yet laid out). `handleNavigatorResize` guards with `Number.isFinite(next) && next > 0` and rejects, preventing `NaN`/0 from propagating into `plotDimensions[1] = viewerSize - navigatorHeight` and breaking the EEG plot's initial render.

The toggle-strip user-reported symptoms had three patterns, all driven by the same stale-offsetHeight root cause: (1) auto-show → auto-hide didn't collapse (poisoned echo cache during show); (2) drag-while-shown → hide worked by accident (the drag emitted the live value when the user happened to release, refreshing the cache); (3) drag-while-hidden → show → hide collapsed only on the *first* subsequent hide because each programmatic toggle-on re-poisoned the cache.

### Module runtime state on `state.INTERFACE.modules` — live getters, not snapshots

The Vuex state has two superficially-similar `Map`s. They actually contain different objects:

- `state.MODULES.get(name)` — the **core** module's runtime (registered via `Epicurrents.registerModule()` → core `RuntimeStateManager.setModule()`). For EEG this is `@epicurrents/eeg-module`'s runtime — without interface-specific fields like `trendVisible`.
- `state.INTERFACE.modules.get(name)` — the **interface** module's combined config + runtime data. Populated by `AppStore.addModule()`. The original `modConfig` only carried `{ schemas, settings }` — the menu tick for the EEG trend strip was stuck because its `reloadOn` callback read `store.state.INTERFACE.modules.get('eeg')?.trendVisible` and got `undefined`.

`AppStore.addModule()` now installs live getters on `modConfig` for every non-method property on the interface module's `runtime` (primitives, objects, arrays — methods stay on the runtime itself). The getters read directly from `runtime`, so `state.INTERFACE.modules.get('eeg').trendVisible` always returns the current toggle state even after action handlers mutate `runtime.trendVisible = !runtime.trendVisible`. Existing keys (`schemas`/`settings`) take precedence over runtime keys with the same name.

**Rule for new interface module runtime fields**: just add them to the module's exported `runtime` object. They become readable via `state.INTERFACE.modules.get(name).<field>` automatically. The generic config typing doesn't expose module-specific fields, so an inline structural cast (`as { modules: Map<string, { fieldName?: T }> }`) is appropriate at the call site. For methods (which are still excluded), call them on the runtime object directly.

### Vuex `subscribeAction(handler)` defaults to `before`

`store.subscribeAction(handler)` invokes the handler *before* the action's mutation handler runs. When `AppMenubar`'s subscribeAction iterates menu items' `reloadOn` callbacks, those callbacks need the post-action state. Use the `store.subscribeAction({ before, after })` form and put the reloadOn dispatch in `after`. Menu-closing logic (pointer-left-app, overlay-clicked) stays in `before` because its effect is independent of any state mutation.

### `Log.debug is not a function` in workers — nested `scoped-event-log` copy

Stack trace signature (Vite dev viewer, EDF reader worker):

```
TypeError: z.debug is not a function
  at executeWithLock
  at setData
  at insertSignals
```

with no obvious source-level cause is almost always a duplicate `scoped-event-log` getting bundled into the worker. The duplicate is `util/asymmetric-io-mutex/node_modules/scoped-event-log/` — an older v2 copy that npm installs because `asymmetric-io-mutex` historically declared `scoped-event-log: ^2.0.1` while the workspace ships v3. With v2 nested under the mutex package, Vite's worker bundler (which walks node_modules from the importing file) finds the v2 copy first; the rest of the page uses v3 from `frontend/viewer/node_modules/scoped-event-log`. Two `Log` shapes coexist, and the v2 one doesn't have `static debug` (it's an instance-style API).

The right fix is two-part — both halves are needed, because either alone lets the nested copy come back on the next `npm install`:

1. Make `util/asymmetric-io-mutex/package.json` declare `scoped-event-log: ^3.0.0` so npm's resolver stops creating the nested v2.
2. Delete the existing nested copy if present and rebuild:
   ```bash
   rm -rf frontend/viewer/util/asymmetric-io-mutex/node_modules/scoped-event-log
   find frontend/viewer -name .vite -type d -exec rm -rf {} +
   cd frontend/viewer/util/asymmetric-io-mutex && npm run build
   ```

Verify there is exactly one copy with:

```bash
find frontend/viewer -name scoped-event-log -type d
# Should print only:
#   frontend/viewer/util/scoped-event-log
#   frontend/viewer/node_modules/scoped-event-log   (symlink to the above)
```

If a third path under `util/asymmetric-io-mutex/node_modules/scoped-event-log` reappears, the version bump in step 1 was reverted or `npm install` was run against a lockfile that still references v2.

## SAB cache lifecycle — cross-activation state leaks

**Public docs:** [memory-management — Recording activation lifecycle](https://epicurrents.github.io/docs/memory-management#recording-activation-lifecycle)

### The problem

Switching between recordings and switching back produces permanently empty signals. Three root causes, all **cross-activation state leaks** — state owned by the recording *object* that doesn't reset atomically when the SAB is freed and reallocated:

1. **`_cacheProcesses` not cleared on `releaseCache()`** — `GenericSignalReader._cacheProcesses` retains stale "fully cached" targets across the release; `partsNotCached()` returns empty; `cacheSignals()` skips loading into the freshly-zeroed SAB.

2. **ACTIVATE event fires for both 'before' and 'after' phases** — `GenericAsset.isActive` setter dispatches ACTIVATE 'before' (when `_isActive = false`), then sets `_isActive = true`, then dispatches ACTIVATE 'after'. The full setup body (including `requestMemory`, `setupMutex`) ran in 'before', leaving `isReady = true`. The 'after' handler saw `isReady = true` and skipped everything — including `cacheSignals()`. **Any ACTIVATE listener in a subclass must guard `if (!this._isActive) return` at the top.**

3. **Stale `cache-signals` progress response** — a progress message buffered as a macro task can arrive after `releaseBuffers()` resets `signalCacheStatus = [0,0]`, restoring a non-zero `signalCacheStatus[1]`. `cacheSignals()` guards on `!_signalCacheStatus[1]`, so the stale value silently skips caching.

### Fixes applied (band-aids)

| File | Fix |
|---|---|
| `epicurrents/core/src/assets/reader/GenericSignalReader.ts` | `releaseCache()` override: `proc.continue = false` on all processes + `_cacheProcesses.length = 0` |
| `epicurrents/eeg-module/src/EegRecording.ts` | ACTIVATE listener: `if (!this._isActive) return` phase guard at top; `signalCacheStatus = [0,0]` reset before `cacheSignals()` call |

### Follow-up: reactivation stuck in "Loading signal data"

A regression introduced by fix #3 above. The `signalCacheStatus = [0, 0]` reset sat
*above* the `if (!isReady && state === 'ready')` setup guard, so it ran on every
ACTIVATE 'after' phase — including reactivations where `unloadOnClose=false` leaves
`isReady=true` and the entire setup block (including the `cacheSignals()` call) is
skipped. Result: the status was just zeroed, but nothing repopulated it. The
EegViewer's `dataSetupDone` flag depends on `signalCacheStatus[1] > 0`, so the
"Loading signal data" placeholder stayed up indefinitely.

**Fix:** moved the reset *inside* the `if (!isReady && state === 'ready')` block. It
still fires before `cacheSignals()` on a fresh setup (so the stale-progress-message
race from #3 is still defused), but a reactivation with intact buffers keeps the
prior status — the renderer immediately sees the cached range and skips the
placeholder, no re-caching needed.

The inline comment in `EegRecording.ts` warns against moving the reset back outside
the guard.

**Superseded** by the three-level lifecycle's in-flight drain
(see below): once `releaseSignalArrays` awaits all in-flight `_readAndCachePart`
promises before its ack reaches the main thread, no stale `cache-signals` message
can land after a release, and the entire `signalCacheStatus = [0, 0]` line was
deleted. The drain replaced the band-aid altogether.

### Three-level cache lifecycle

The cache lifecycle now has three levels with `releaseSignalArrays` as the new Level 1 entry point added across every layer that owns cache state. Existing Level 2 names are kept where they're already established (`releaseCache` on the reader, `releaseBuffers` on the resource/montage/IOMutex) — the consistency comes from Level 1 having a single name across all layers, not from renaming established APIs.

| Level | Reader hierarchy | Mutex (`BiosignalMutex` / `IOMutex`) | Montage / Resource | Worker commission |
|---|---|---|---|---|
| 1 — Soft release | `releaseSignalArrays()` | `releaseSignalArrays()` / `releaseOutputBufferViews()` | `releaseSignalArrays()` | `release-signal-arrays` |
| 2 — Full teardown | `releaseCache()` | `releaseBuffers()` (inherited from `IOMutex`) | `releaseBuffers()` | `release-cache` |
| 3 — Destroy | `destroy()` | `destroy()` | (resource destroy path) | `shutdown` / `decommission` |

**Level 1 contract:** cancel in-flight caching processes, drop the worker-side signal-array views, reset `signalCacheStatus` — but **preserve the mutex layout** (`_outputData.arrays` entries, `_outputData.fields`, `_outputMeta.fields`) and the SAB allocation. The same mutex shell can then be cheaply rebound to a fresh buffer via `initSignalBuffers(..., overwrite=true)` + `IOMutex.rebuildDataArrayViews()`.

**Level 2 contract:** Level 1 first, then drop the mutex reference entirely and free the SAB from the memory manager. A fresh `setupCache` / `setupMutex` round-trip is required afterwards.

**Pieces in place after Stage 1**

- `IOMutex.initialize(buffer, start, overwrite=false)` — re-binds to a new buffer when `overwrite=true`.
- `IOMutex.rebuildDataArrayViews()` — rebuilds the output data array views over the currently bound buffer using the existing layout.
- `IOMutex.releaseOutputBufferViews()` — Level 1 op on the util side: null views + buffer ref, keep layout.
- `BiosignalMutex.initSignalBuffers(..., overwrite=false)` — when `overwrite=true`, skips the `setDataArrays` walk and calls `rebuildDataArrayViews` instead.
- `BiosignalMutex.releaseSignalArrays()` — Level 1 on the consumer mutex.
- `GenericDataProcessor.releaseSignalArrays()` / `GenericSignalReader.releaseSignalArrays()` — Level 1 on the reader. The previous `cacheProcesses.continue = false` + `cacheProcesses.length = 0` band-aid now lives here (was inside `releaseCache` Level 2); `releaseCache` calls Level 1 first.
- `GenericService.releaseSignalArrays()` + matching `release-signal-arrays` worker commission (EDF worker, montage worker, montage worker substitute).
- `BiosignalMontage.releaseSignalArrays()` + `GenericBiosignalResource.releaseSignalArrays()` — Level 1 at the resource API surface.

**Stage 2 follow-ups**

The stale-progress-message race was eliminated by a structural change rather than a generation counter:

- **`SignalCacheProcess.inFlightRead`** — each caching loop now stores its currently-running `awaitThenSleep(_readAndCachePart, yieldMs)` promise on the process and clears it once the chunk resolves.
- **`GenericSignalReader.releaseSignalArrays` drains all in-flight chunks** (`await Promise.all(_cacheProcesses.map(p => p.inFlightRead ?? Promise.resolve()))`) before clearing the process list. By the time the release ack is posted, every `cache-signals` progress message from this cycle has already been posted; postMessage ordering on the receiver side guarantees the resource processes them all before the ack arrives. No stale message can land after the ack.
- **`signalCacheStatus = [0, 0]` band-aid removed** from `EegRecording.ACTIVATE`. The drain makes it unnecessary; an inline comment in the activate handler explains why and points at the drain so the next person reading the code doesn't reintroduce it on a hunch.
- **`releaseCache` (Level 2) inherits the drain via Level 1**, so every existing close/unload path (including `releaseBuffers` on the resource) is now race-free without needing to call Level 1 explicitly.

A generation counter would also work but is strictly more code (per-message tag + receiver filter) for the same guarantee — the drain achieves race-freedom at the SOURCE rather than filtering at the SINK.

**Still deferred (Stage 3-ish):**

- **No consumer is calling Level 1 explicitly yet.** `releaseBuffers` (Level 2) cascades through Level 1, so the drain runs and the band-aid is safely gone — but the cheap rebind path (`initSignalBuffers(..., overwrite=true)` reusing an unallocated mutex shell over a fresh buffer) is not yet wired. Doing so would let `unloadOnClose=true` reactivation skip the `requestMemory` + `setupMutex` + `addDefaultSetupsAndMontages` walk, but needs an "intent to reactivate" signal on close (today's `releaseBuffers` discards the mutex; there's no caller that explicitly wants Level 1 over Level 2).
- **The ACTIVATE `if (!this._isActive) return` phase guard** stays — orthogonal to the cache lifecycle (it's about `GenericAsset.isActive` dispatching both `'before'` and `'after'`).

**Adding a new release-triggering code path** that previously would have needed to defend against the race no longer needs the `signalCacheStatus = [0, 0]` reset, provided it goes through `releaseSignalArrays` or `releaseCache` (Level 2 cascades to Level 1). The drain is intrinsic to the release contract now.

### Companion fix: synchronous `_isActive` flip on EegRecording

The drain (above) made the **resource-switch** workflow (`setActiveResource(newResource, true)` with `unloadOnClose=true`) reliably error out with "signal cache has not been set up yet" cascades. Diagnosis: `EegRecording.isActive` setter was deferring the `_isActive = false` assignment into `unload().then(...)`. The drain widened that `.then` enough that, by the time the runtime fired `'set-active-resource'` and Vue re-rendered, `getActiveResource()` iteration still saw the **old** recording as active (its `_isActive` hadn't flipped yet) and returned it — the new EegViewer's `useEegContext` then captured the **wrong** resource. Once the old's release completed and nulled its `MontageProcessor._cache`, every `getAllSignals` from the bound-to-old EegPlot errored.

**Fix:** flip `_isActive` synchronously **before** kicking off `unload()`; `unload()` runs in the background (with all its draining + commission round-trip preserved). The runtime iteration now sees the new resource immediately.

Inline comment in `EegRecording.isActive` setter explains the ordering. Any listener that needs to know when the actual teardown completes should subscribe to the service's `isReady` property change, not the resource's `DEACTIVATE` event.

### Companion fix: `addMontage` cache setup before `'montages'` dispatch

`EegRecording.addMontage` was dispatching `_setPropertyValue('montages', [...])` **before** calling `setupServiceWithInputMutex` / `setupServiceWithCache`. The property change is synchronous and fans out to Vue (`EegViewer.montagesChanged` → `setChannelLayout` → channel offset change → resource `'channels'` change → `EegPlot.updateTraces` → `getAllSignals`). Sync listeners thus posted `get-signals` to the worker **before** the cache setup commission was even queued; the worker's `MontageProcessor._cache` was still `null` → the same "cache has not been set up yet" error. Pre-existing bug, surfaced by the drain widening the window.

**Fix:** in `addMontage`, set up the cache (await it) and apply interruptions **before** dispatching the `'montages'` property change. The non-SAB branch (`setupServiceWithCache`) is now also `await`-ed; previously it was fire-and-forget. Sync listeners now see a fully-ready montage.

---

## Known issues / tech debt

### `GenericAsset.configure` does not reach prototype-defined setters

Source: `epicurrents/core/src/assets/GenericAsset.ts` — `configure()` method (~line 308).

```ts
const propertySetter = Object.getOwnPropertyDescriptor(target, key)?.set
```

`Object.getOwnPropertyDescriptor` only inspects **own** properties of the instance. Class `get`/`set` accessors are defined on the **prototype**, not on instances, so this call always returns `undefined` for them. The method then logs a warning and skips the field — meaning `configure()` is currently a no-op for every property defined with a getter/setter pair in a class body.

**Fix needed:** walk the prototype chain to find the descriptor, e.g.:

```ts
let proto = Object.getPrototypeOf(target)
let descriptor: PropertyDescriptor | undefined
while (proto && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(proto, key)
    proto = Object.getPrototypeOf(proto)
}
const propertySetter = descriptor?.set
```

This is a sweeping change that touches `GenericAsset` and all subclasses that call `configure` (`ResourceLabel`, `GenericBiosignalEvent`, and any project-specific subclasses). All setter-level guards (including the new `locked` guard in `GenericAnnotation`) will apply correctly once the fix is in place, because every affected setter routes through `_setPropertyValue`.
