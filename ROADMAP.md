Epicurrents builder roadmap
===========================

Planned and deferred work for the **builder** — the repository that assembles the `@epicurrents/*` packages into per-edition releases. Architecture and conventions are in [AGENTS.md](AGENTS.md); how to build an edition is in [README.md](README.md).

Scope: how editions are defined, resolved, built, pinned and published. Work on signal processing, readers, modules or the interface belongs in the roadmap of the package that owns it — each package is its own repository.


Dev editions and npm releases
-----------------------------

🟢 **Priority: green** — the change that settles what a release means.

The builder is a development tool. Another developer running the same configuration is not expected to land on a byte-identical workspace, and paying for that would buy nothing. But the artifacts cut from it are the authoritative versions of the software, and those do need to be pinned. Splitting the two resolves the tension:

- **Dev editions** are built from the cloned package repositories. Fast to iterate, reproducible only as far as the commit pins go, and never published as releases.
- **Releases** are built from published npm packages, where the registry versions and a lockfile do the pinning.

**This is one mechanism with two provenances, not two build models.** The builder already consumes *built* packages: setup builds each repository (webpack for workers, tsc for the rest) and the lib build resolves `@epicurrents/*` through their `exports` maps to `dist`/`umd`, exactly as an installed package would. A workspace symlink and an installed directory resolve the same way, and `preserveSymlinks` in the lib config makes the dev layout behave like the flat one. So the mode is a source setting (`--source git|npm`), not a separate pipeline.

### Release mode is a validation gate

The reason to run the npm mode continuously in CI is not parity — it is that release mode is strictly *stricter*, and surfaces three classes of defect the workspace structurally hides:

- **Duplicate core copies.** Every package declares `@epicurrents/core` as a regular `dependency` with a `^` range, and no package declares peer dependencies. Today the ranges agree so npm would install one copy; the moment one diverges, npm installs two and nests one — which is the worker/main-thread data-layout corruption the version-compliance rule exists to prevent. Dev mode *cannot* reach this state, because `clean.mjs` deletes nested copies as a matter of course. Moving `@epicurrents/core` and the three shared utilities to `peerDependencies`, plus an assertion that `npm ls @epicurrents/core` resolves to exactly one version, is the prerequisite that matters most.
- **Phantom dependencies.** Workspace hoisting puts everything in one root `node_modules`, so a package can resolve an import it never declared. A real install gives it only what it declares. The traffic runs both ways: `edf-reader` currently declares `dotenv` and `stream-browserify` as runtime dependencies, which every consumer would install.
- **Publish coverage.** Only what `files` and `exports` cover reaches the tarball. Core's coverage is already good — `dist/*`, `umd/*.js` and `tsconfig.base.json` all ship — but only the root export carries a `types` condition. Subpaths are bare strings, so `import { inlineWorker } from '@epicurrents/core/util'`, which is what `setup/workers/core.ts` does, gets no types from an installed package. `pdf-reader`'s `files` also has `"umd/*js"`, missing the dot.

### Prerequisites

1. `peerDependencies` for `@epicurrents/core`, `asymmetric-io-mutex`, `scoped-event-bus`, `scoped-event-log` in every package.
2. `types` conditions on the subpath exports, not just the root.
3. Fix the `pdf-reader` `files` glob.
4. Decide whether the three utilities are republished under the `@epicurrents` scope. They are currently unscoped and come from a personal account, so publishing scoped packages that depend on them ties the org's release integrity to a personal namespace — and it is a one-way door once versions are out.

### What this does to the manifest

The manifest survives with different content per mode, and records which mode produced it: commit pins for a dev edition, resolved package versions plus a lockfile hash for a release. Dev editions stay out of GitHub Releases entirely — workflow artifacts, or a `-dev.<sha>` suffix — so "authoritative" keeps its meaning.


Centralise the `__EPICURRENTS__` declaration in core
----------------------------------------------------

🟢 **Priority: green** — small, overdue, and pays for itself immediately.

All 17 packages carry their own `globals.d.ts` declaring the shape of `window.__EPICURRENTS__`, and they have already drifted: 21 lines in `acc-module`, 34 in most readers, 42 in `wav-reader` and `ncs-module`, 59 in `pyodide-service`. Seventeen subtly different opinions about one runtime object, none of which the compiler can reconcile.

Core cannot be the source of truth today for a mechanical reason: `EpicurrentsGlobal` is a bare `type` — not exported — declared inside a `.d.ts` that tsc consumes as ambient input and never emits. Nothing reaches `dist`, and no `declare global` ships at all. That is presumably why every package hand-rolls it.

The work:

1. Export the type from core and actually ship it — move it into an emitted module, or add the declaration file to the emit.
2. Have core ship the `declare global` itself. Ambient declarations propagate to every consumer, so one copy types the whole graph and the packages delete their `globals.d.ts` outright rather than importing the type and re-declaring the window.
3. Decide the field's optionality deliberately. A non-optional `__EPICURRENTS__` lies about the window before the app boots; making it optional forces `?.` or `!` at every use site, and the codebase is currently inconsistent about that anyway. The next item changes the answer — if the global object is created at module-evaluation time, the field is genuinely always present and only its *contents* are lifecycle-dependent.

Type-only imports erase, so none of this adds a byte to any bundle. It is also the prerequisite for the plugin API below.


Consolidate build outputs — `dist` in the interface, lib in the builder
-----------------------------------------------------------------------

🟢 **Priority: green — largely done.** The lib is consolidated; the app is deliberately kept in the interface.

The interface's three artifact roles were spread across four Vite configs:

- **`dist/` — build-time consumable.** The per-module package (deps externalised, un-minified, multi-entry) a bundler composes from — the builder's input and the only form a downstream app imports.
- **`build/lib/` — runtime consumable.** A single inlined, minified UMD for a `<script>` drop-in.
- **`build/app/` — standalone.** The deployable web app (index.html + service worker).

**Done (the lib).** The interface's default `build` now produces `dist/` (`vite.config.dist.ts`); `vite.config.lib.ts` and the interface/builder `build:lib` scripts are gone. The builder produces the runtime-consumable lib via `build:edition` (per profile, from the interface's `dist/`), and the platform's `build:viewer` consumes the `full` edition (`dist/full/`) into `viewer-dist/` instead of building the interface lib. The SPA loads the edition's `.umd.js`; the per-project public viewers keep `.umd.cjs` from the platform's own `build:base`. The per-package `build` override is gone (the interface defaults to `dist`); the `pkg.build || …` fallback in `setup.mjs`/`build.mjs` stays as a general escape hatch.

**Kept in the interface (by decision).** `build:app` / `vite.config.app.ts` — the standalone PWA, wired into the builder's `build:dev` (with OHIF). Moving it would need a dev-edition path in the builder; not worth it now.

**Remaining.** The platform's *per-project* viewers (`viewer-dist/<project>/`, e.g. `prehos`) are still built by the platform's own `build:base` overlay, not by builder editions. Folding those into editions — so every viewer artifact comes from the builder — is the last step, if wanted. A cosmetic follow-up: the flat `viewer-dist/` copy now also carries the edition's `index.html`/`.mjs` (harmless extras the SPA ignores); the copy could exclude them.


Plugin API via the runtime global
---------------------------------

🟡 **Priority: yellow** — deferred, but tractable in a way the previous framing was not.

The goal is that a developer takes a prebuilt edition — say the `eeg` release — and plugs in an additional file reader or study module without rebuilding it.

The seam already exists and was designed for this. Core's own declaration explains why the runtime lives on `window`: it is "a workaround for cases, where different modules may implement different versions of the core package and thus the imported `SETTINGS` may not point to the same object." Assets read `window.__EPICURRENTS__.APP` and `.EVENT_BUS`; the services read `RUNTIME.SETTINGS` and `RUNTIME.WORKERS`. Import maps and module federation are heavier machinery for a problem this codebase already solves its own way.

### What has to be added

**Constructors on the global.** Runtime state is not the blocker — class identity is. Every plugin-shaped class extends a core base class (`EdfReader extends GenericSignalReader`, `EegRecording extends GenericBiosignalResource`, `EdfWorkerSubstitute extends ServiceWorkerSubstitute`, and so on). `extends` uses the name in a *value* position, so a plugin needs the constructor at runtime. If it bundles its own copy there are two `GenericBiosignalResource` classes and every host-side `instanceof` fails on plugin instances. Exposing the base classes on the global — `__EPICURRENTS__.CLASSES` — lets a plugin destructure them at module scope and subclass normally, with no import map and no bundler coordination. This is a runtime change to core, separate from the type work above.

**A deliberate, small class surface.** Whatever goes in `CLASSES` becomes a published ABI that cannot be refactored freely. Include the base classes a plugin actually extends, not all of core.

**Creation at module-evaluation time.** The global object is currently created inside the `Epicurrents` constructor, which is why everything guards against it being undefined. Separate the two concerns: create the container (with null fields) in a leaf module evaluated for its side effect, and keep populating `APP` / `EVENT_BUS` / `RUNTIME` in the constructor. ES module evaluation is depth-first post-order, so a dependency-free leaf module runs before every module that imports it. The rule that keeps this sound is that **the classes must never import the globals module** — they read `globalThis.__EPICURRENTS__` lazily inside method bodies, while the globals module imports the classes to register them. That direction is acyclic; the reverse deadlocks on partially-initialised bindings.

**A plugin-host entry point.** Populating `CLASSES` eagerly means importing every registered class, which makes core non-tree-shakeable and fights the per-edition trimming the builder exists to do. Gate it behind a separate entry (`@epicurrents/core/plugin-host`) so editions that do not accept plugins stay trimmed.

**An ABI handshake, in two places.** The `if (typeof … === 'undefined')` guard means the first core to load wins, so a plugin always gets the host's classes — identity is safe. What is not safe is *shape*: a plugin built against an older core can call a method that no longer exists or pass the wrong argument shape. So the check belongs at plugin registration, not only in workers. Core exposes a data-layout/ABI version distinct from its npm semver, bumped only when shared buffer layouts, worker message contracts or the `CLASSES` surface change; the host refuses a mismatch loudly.

**The worker realm separately.** A worker is a different JS realm with its own globals, so none of the above reaches it. Plugin readers ship self-contained worker bundles today — `edf-reader`'s is 250 KB, which is core's worker-side code baked in — so a plugin's worker carries its own copy of the SAB layout, the commission protocol and the mutex, and nothing structural forces agreement with the host. Either the host serves its core worker bundle at a known URL for plugin workers to `importScripts`, or the worker announces its ABI version at commission handshake and the host refuses a mismatch.

**Load-time integrity.** Loading arbitrary URLs as code is a supply-chain surface. It needs an allowlist or same-origin restriction, and Subresource Integrity on manifest entries or a signed manifest, before being enabled outside a trusted deployment.

### Open question

Whether core's base classes have import-time side effects or circular dependencies that complicate a flat `CLASSES` map. Worth a spike before committing to the shape.


Make the default edition explicit
---------------------------------

🟢 **Priority: green** — small, and removes a sharp edge.

A profile with an empty `activeModules` (and a build with no profile at all) means "every registrar in `setup/modules/`". Some registrars compose packages that are not public, and rollup has to resolve a static import before it can tree-shake what the import provides — so the untrimmed build requires every package to be installed, including non-public ones. That is a maintainer-only build masquerading as the default.

Either drop the "empty means everything" rule and have every profile name its modules, or generate the registry from the module files that are actually present and resolvable. The first is simpler and more honest; the second keeps the convenience. Either way the failure should be a clear message at profile load, not a module-resolution error deep in a bundle build.


Registrars for the remaining modalities
---------------------------------------

🟢 **Priority: green** — mechanical, gated on the packages.

`setup/registry.ts` has registrars for acc, eeg, emg, htm and pdf. The `ncs` and `tab` modules have no finished study importer, so no registrar can compose them yet and they are deliberately absent from the profiles: shipping the package without a registrar clones and builds code that nothing registers. Add the registrar and the profile entry together, once each package's importer lands.


Consumer documentation
----------------------

🟡 **Priority: yellow** — worth doing once the build model settles.

A clinician or researcher, not necessarily a programmer, should be able to produce a viewer build with exactly the modules they need — working with an AI assistant pointed at the documentation. That needs:

- A setup guide at a stable, linkable location a web-based assistant can read remotely: prerequisites, defining a profile, building an edition, embedding the result.
- A module catalogue derived from the registrars rather than maintained by hand, so the catalogue and the code cannot drift: modality, what it enables, the file formats it opens, the packages it pulls in.
- Copy-paste examples for the common cases — a single modality, a modality plus the analysis service, the full edition.


Tests and CI
------------

🟡 **Priority: yellow** — nothing currently gates a change to this repository.

`.github/workflows/` has only the release workflow. There is no check on a pull request, and the builder has no tests of its own even though its scripts encode non-obvious rules — profile resolution, the public/non-public split, scope parsing, manifest pinning.

- **Profile and argument tests.** The public-profile guard and the scope/option parsing are exactly the kind of logic that fails silently: a mis-parsed option once made `--profile <name>` select nothing and exit successfully.
- **An edition smoke test.** Build an edition in CI and assert the output shape — the lib, the stylesheet, `index.html`, the worker chunks — and that a trimmed edition really does exclude the modules it did not select.
- **A pull-request workflow** running those plus `npm run typecheck`.
