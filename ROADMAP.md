Epicurrents builder roadmap
===========================

Planned and deferred work for the **builder** — the repository that assembles the `@epicurrents/*` packages into per-edition releases. Architecture and conventions are in [AGENTS.md](AGENTS.md); how to build an edition is in [README.md](README.md).

Scope: how editions are defined, resolved, built, pinned and published. Work on signal processing, readers, modules or the interface belongs in the roadmap of the package that owns it — each package is its own repository.


Worker and library builds no longer need their current order
------------------------------------------------------------

🔵 **Priority: blue** — diagnosability, not correctness; a one-line change in nine packages.

Every package that ships a worker runs `npm run build:workers && npm run build:tsc`. The order is a relic: when declarations were emitted through path-replacement rather than by `epicurrents-build-types`, running the type build first could disturb the worker bundle. Neither half depends on the other now. Both read only `src/`, they write to separate directories, and the worker build sets `emptyOutDir: false`, so neither can clobber the other — running them reversed in core produces byte-identical `dist/` and `umd/`.

What the order costs is the ability to answer "is this built?" from timestamps. `build:workers` running first means `umd/` is always older than `dist/` after a *successful* build, so the obvious staleness check reports every package as stale, permanently, and the genuine case — a sibling's worker bundle predating a core change, which inlining makes invisible otherwise — cannot be distinguished from the normal one. Building the library first makes the artifact timestamps monotonic and the check mean what it looks like it means.

Two ways to take it, and they trade against each other:

- **Reverse the order.** Conservative, keeps the sequence explicit, and buys the timestamp property.
- **Run the two concurrently**, with `npm-run-all -p` or equivalent. They are provably independent, so this is sound and cuts build time across a nine-package sweep — but concurrent writes give up the monotonic timestamps again, which is the thing worth having.

The one ordering that must survive either way is `build:lib` before `build:types` inside `build:tsc`: the library build sets `emptyOutDir: true` on `dist/`, so running it second deletes the declarations `tsc` just emitted. That constraint is probably what the current order was protecting in its original form.

Worth folding into each package as the audit sweep opens it, rather than as a nine-package commit of its own. Changing one package and not the rest is worse than changing none, since the whole value is being able to trust the check everywhere.


Non-public packages fall out of the maintenance scripts
-------------------------------------------------------

🟠 **Priority: amber** — two defects in the same mechanism, both silent.

`clean.mjs` resolves what to operate on through `resolveSelection`, the same profile-aware helper the build uses, and that helper drops non-public packages unless `--include-private` is given. So `npm run clean` cleans every public package and silently leaves the nested `@epicurrents/core` copies inside `api-reader`, `nic-reader`, `natus-reader` and `onnx-models`.

That matters because cleaning is the documented remedy for a whole class of failure — [AGENTS.md](AGENTS.md) states that a package reporting missing core methods almost always has a stale nested copy, and says to run `clean`. A maintainer with the private packages checked out runs it, watches the type-check still fail on exactly those four, and has no reason to suspect the remedy skipped them. Either the default should include private packages (cleaning is maintenance, not distribution, so the public/private split buys nothing here), or the script should report what it skipped.

The second defect is in the registry data the same split reads, and it is three sources disagreeing about `acc-module` and `csv-reader`. `scripts/env.mjs` marks both public. `setup/registry.ts` names both as examples of non-public packages a registrar composes, and `profiles/full.mjs` — "every modality the builder can register, from public packages only" — excludes acc accordingly.

The history says which way it drifted. Both were marked non-public *because unpublished*, and the comment and the profile were written against that state; the flags were flipped back a few days later on the grounds that both are now published to npm. Neither is: both sit at `0.0.0` and neither resolves on the registry, alongside `api-reader`, which kept its flag. So the two sources that were not updated happen to describe the situation, and the flag that was updated does not.

Worth settling the criterion at the same time, because it is what produced the mismatch: `public` decides whether the release workflow can `git clone` a repository with no credentials, which is a question about repository visibility rather than npm publication. A package can be public on GitHub and unpublished, or the reverse. Per this file's own scope note the flag is what makes "only public editions are ever released" true, and one wrongly marked public fails at `git clone` in CI rather than at the guard.


Dev editions and npm releases
-----------------------------

🟢 **Priority: green** — the change that settles what a release means.

The builder is a development tool. Another developer running the same configuration is not expected to land on a byte-identical workspace, and paying for that would buy nothing. But the artifacts cut from it are the authoritative versions of the software, and those do need to be pinned. Splitting the two resolves the tension:

- **Dev editions** are built from the cloned package repositories. Fast to iterate, reproducible only as far as the commit pins go, and never published as releases.
- **Releases** are built from published npm packages, where the registry versions and a lockfile do the pinning.

**This is one mechanism with two provenances, not two build models.** The builder already consumes *built* packages: setup builds each repository with Vite and the lib build resolves `@epicurrents/*` through their `exports` maps to `dist`/`umd`, exactly as an installed package would. A workspace symlink and an installed directory resolve the same way, and `preserveSymlinks` in the lib config makes the dev layout behave like the flat one. So the mode is a source setting (`--source git|npm`), not a separate pipeline.

### Release mode is a validation gate

The reason to run the npm mode continuously in CI is not parity — it is that release mode is strictly *stricter*, and surfaces three classes of defect the workspace structurally hides:

- **Duplicate core copies.** Every package declares `@epicurrents/core` as a regular `dependency` with a `^` range, and no package declares peer dependencies. Today the ranges agree so npm would install one copy; the moment one diverges, npm installs two and nests one — which is the worker/main-thread data-layout corruption the version-compliance rule exists to prevent. Dev mode *cannot* reach this state, because `clean.mjs` deletes nested copies as a matter of course. Moving `@epicurrents/core` and the three shared utilities to `peerDependencies`, plus an assertion that `npm ls @epicurrents/core` resolves to exactly one version, is the prerequisite that matters most.
- **Phantom dependencies.** Workspace hoisting puts everything in one root `node_modules`, so a package can resolve an import it never declared. A real install gives it only what it declares. The traffic runs both ways: `edf-reader` declared `stream-browserify` as a runtime dependency that nothing in it imported, which every consumer would have installed — dropped in its audit, and worth looking for in the packages the sweep has not reached.
- **Publish coverage.** Only what `files` and `exports` cover reaches the tarball. Core's coverage is already good — `dist/*`, `umd/*.js` and `tsconfig.base.json` all ship — but only the root export carries a `types` condition. Subpaths are bare strings, so `import { inlineWorker } from '@epicurrents/core/util'`, which is what `setup/workers/core.ts` does, gets no types from an installed package. A missing dot in `pdf-reader`'s `"umd/*js"` was the same class of defect one package down, and its audit corrected it.

### Prerequisites

1. `peerDependencies` for `@epicurrents/core`, `asymmetric-io-mutex`, `scoped-event-bus`, `scoped-event-log` in every package.
2. `types` conditions on the subpath exports, not just the root.
3. Decide whether the three utilities are republished under the `@epicurrents` scope. They are currently unscoped and come from a personal account, so publishing scoped packages that depend on them ties the org's release integrity to a personal namespace — and it is a one-way door once versions are out.

### What this does to the manifest

The manifest survives with different content per mode, and records which mode produced it: commit pins for a dev edition, resolved package versions plus a lockfile hash for a release. Dev editions stay out of GitHub Releases entirely — workflow artifacts, or a `-dev.<sha>` suffix — so "authoritative" keeps its meaning.


Centralise the `__EPICURRENTS__` declaration in core
----------------------------------------------------

🟢 **Priority: green** — small, overdue, and pays for itself immediately.

The per-package `globals.d.ts` files that each declared the shape of `window.__EPICURRENTS__` are gone: measured 2026-10-02, no `epicurrents/*` package declares the global any more, and the `shims.d.ts` files that replaced them run 7 to 25 lines and declare other things. The two remaining declarations are both the interface's, in `globals.ambient.d.ts` and `core-global-augment.d.ts`.

So the drift this item was opened for has been absorbed by the sweep, one package at a time. What is left is the reason the drift was possible: core cannot be the source of truth today, because `EpicurrentsGlobal` is a bare `type` — not exported — declared inside a `.d.ts` that tsc consumes as ambient input and never emits. Nothing reaches `dist`, and no `declare global` ships at all. That is why each package hand-rolled its own, and why the interface still does.

The work:

1. Export the type from core and actually ship it — move it into an emitted module, or add the declaration file to the emit.
2. Have core ship the `declare global` itself. Ambient declarations propagate to every consumer, so one copy types the whole graph and a consumer needs no declaration of its own rather than importing the type and re-declaring the window.
3. Fold the interface's two declarations into it, which is the part still outstanding.
4. Decide the field's optionality deliberately. A non-optional `__EPICURRENTS__` lies about the window before the app boots; making it optional forces `?.` or `!` at every use site, and the codebase is currently inconsistent about that anyway. The next item changes the answer — if the global object is created at module-evaluation time, the field is genuinely always present and only its *contents* are lifecycle-dependent.

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

**The worker realm separately.** A worker is a different JS realm with its own globals, so none of the above reaches it. Plugin readers ship self-contained worker bundles today — `edf-reader`'s is 585 KiB, which is core's worker-side code baked in — so a plugin's worker carries its own copy of the SAB layout, the commission protocol and the mutex, and nothing structural forces agreement with the host. Either the host serves its core worker bundle at a known URL for plugin workers to `importScripts`, or the worker announces its ABI version at commission handshake and the host refuses a mismatch.

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

`tab`'s audit measured which piece is actually missing, and it is narrower than "the importer". The package has a loader and the interface already carries a `tab` UI module with a viewer, controls and a store module, so both halves of the modality exist. What is missing is a worker, which the package deliberately does not ship: the service drives one the consumer registers with its study importer under the key `tab-tab`, and the commission protocol it has to answer is now in the package's README. A registrar built before that worker exists would compose a modality whose resource cannot load, so the order is the worker, then the registrar, then the profile entry.


Consumer documentation
----------------------

🟡 **Priority: yellow** — worth doing once the build model settles.

A clinician or researcher, not necessarily a programmer, should be able to produce a viewer build with exactly the modules they need — working with an AI assistant pointed at the documentation. That needs:

- A setup guide at a stable, linkable location a web-based assistant can read remotely: prerequisites, defining a profile, building an edition, embedding the result.
- A module catalogue derived from the registrars rather than maintained by hand, so the catalogue and the code cannot drift: modality, what it enables, the file formats it opens, the packages it pulls in.
- Copy-paste examples for the common cases — a single modality, a modality plus the analysis service, the full edition.

The published docs have their own drift, found while refreshing them during `tab-module`'s pass. The Testing section of `development.md` describes the alias mechanism as core's `package.json` `imports` field mapping `#*` to `src/`, which the move to `epicurrents-build-types` removed, and it describes `eeg-module` redirecting `@epicurrents/core` to a mock as the way a package stays isolated, which is the practice two audits since have argued against. The per-package suite counts in the same section were corrected in that pass; the two mechanism paragraphs need someone to state what the arrangement is now rather than a count.


The release workflow sets up more than the edition needs
-------------------------------------------------------

🟡 **Priority: yellow** — the release works; it builds about nineteen packages to ship four.

[.github/workflows/release.yml](.github/workflows/release.yml) runs `npm run setup` with no profile, so every public package is cloned and built before an edition is bundled from a handful of them. The reason is the interface: `npm run build` there type-checks the whole source tree, so a clone restricted to one edition leaves the other module directories importing packages that were never fetched, and `vue-tsc` fails with a page of unresolved modules before the bundle step is reached. The first release attempt failed exactly that way.

The interface already has the mechanism for this. `INCLUDE_MODULES` is an allowlist that [interface/scripts/typecheck.mjs](interface/scripts/typecheck.mjs) and both of its vite configs honour: a non-empty value excludes every module directory not named, plus the all-in reference setup and the standalone entry that imports it. Its docstring describes this exact failure. Nothing in the builder sets it.

Wiring it is a small change with one question to answer first. A profile's `setup.activeModules` is the obvious source, `['eeg']` for the EEG edition, but a profile names packages as well as modules, and whether a reader implies a module directory has to be decided rather than assumed: the EEG edition carries `dicom-reader`, which registers DICOM studies through an `EegStudyLoader` rather than through the interface's radiology module, so `eeg` alone is right for that edition and would be wrong for one presenting radiology.

The other half is that `INCLUDE_MODULES` trims the bundle as well as the type-check. That is what it is for, but it means setting it changes the artifact, so the change wants verifying against a built edition rather than riding along with a release.

Worth more than the build time it saves: it is also what would make a manifest reproduce an edition exactly. A manifest pins the packages its edition names, so a setup narrowed to those pins everything it clones, while the wider selection a full type-check needs leaves the rest at a branch head. Reproduction is only as exact as the narrowest selection that can be built.


Tests and CI
------------

🟡 **Priority: yellow** — nothing currently gates a change to this repository.

`.github/workflows/` has only the release workflow. There is no check on a pull request, and the builder has no tests of its own even though its scripts encode non-obvious rules — profile resolution, the public/non-public split, scope parsing, manifest pinning.

- **Profile and argument tests.** The public-profile guard and the scope/option parsing are exactly the kind of logic that fails silently: a mis-parsed option once made `--profile <name>` select nothing and exit successfully.
- **An edition smoke test.** Build an edition in CI and assert the output shape — the lib, the stylesheet, `index.html` — and that a trimmed edition really does exclude the modules it did not select.
- **A pull-request workflow** running those plus `npm run typecheck`.


The workspace test sweep cannot be green
----------------------------------------

✅ **Closed 2026-10-03** — `wav-reader` gained a suite in its audit, which is the third of the three ways out below and the only one that closes the gap rather than hiding or declaring it.

`npm run test` runs `npm run test --workspaces --if-present`, and one of the twenty-three workspaces — `wav-reader` — had a `test` script and no test files. Vitest exits 1 on "No test files found", so it failed the sweep whatever the rest of the family did. `--if-present` does not help: the script is present, it just had nothing to run.

The effect was that the sweep's exit code carried no information, and a real failure had to be read out of the scrollback rather than out of the result. The one failure in the sweep was of that kind, which is the part worth knowing: there were no failing assertions anywhere in the family.

Two ways out were available without writing tests, and they say different things. `passWithNoTests` in the empty package's vitest config makes the sweep green and the gap invisible. Removing the `test` script makes `--if-present` skip it, so the sweep is green and the gap is visible in the manifest. Neither was taken: the package had a reader nothing had ever exercised, and what the suite found is in [its own roadmap](epicurrents/wav-reader/ROADMAP.md).


One signal reader's worker substitute answers a subset of the commission vocabulary
-----------------------------------------------------------------------------------

🟠 **Priority: amber** — the failure is a study that cannot be closed, on the no-SharedArrayBuffer path.

Core added `SignalReaderWorkerSubstitute` precisely to stop a package hand-writing this. It runs the worker's own handlers on the main thread, so the vocabulary cannot drift from the worker's; a substitute built on `ServiceWorkerSubstitute` instead answers the actions its author enumerated and fails every other with *"Action X is not implemented"*. That is not a degraded fallback. `GenericService.shutdown` and `unload` both await a commission before tearing anything down and a failed commission rejects, so a missing handler does not slow a study — it leaves it impossible to close.

Measured against the twelve `SignalReaderWorker` answers, one package is left:

| Package | Base | Hand-written cases | Missing |
|---|---|---|---|
| `edf-reader` | `ServiceWorkerSubstitute` | 10 | `release-signal-arrays`, `reset-network`, `set-buffer-range` |

`wav-reader` was the other, and the one done first: it was missing seven, `shutdown` among them — the handler whose absence produces the unclosable study — and it was the one package with no test files, so nothing would have reported it. Its migration confirmed the warning below rather than disproving it: adopting the shared base made it start answering `set-interruptions`, which a continuous span of PCM samples cannot honour, so the refusal had to be stated in both its worker and its substitute. `edf-reader`'s three are narrower and none of them is `shutdown`.

The migration is small — `nic-reader`'s replaced 136 lines of `switch` with 51 and needed only `setup-worker` registered over the shared handlers — but it is not purely mechanical in one respect worth knowing before starting. Adopting the shared base makes the package *start* answering the commissions it used to refuse, and an action refused by accident can be one that should be refused on purpose: `nic-reader` serves its segments as one concatenated timeline, so an interruption table would displace every later read, and the migration had to state that refusal deliberately in both the worker and the substitute to keep the behaviour the subset had been providing by omission. Check each migrating package for a commission its reader genuinely cannot honour.

Test doubles for core drift silently
------------------------------------

🟡 **Priority: yellow** — no production risk, but it has already cost two packages' suites and will spread as the rest gain tests.

Two packages replace `@epicurrents/core` with a hand-written double rather than importing the real one. `eeg-module` aliases the whole package to `tests/mocks/epicurrents-core/` in its `vitest.config.ts`; `csv-reader` does the same for `GenericSignalReader` through `vi.mock` inside `tests/csv/CsvReader.test.ts`. Each double enumerates the members its package needed on the day it was written, and core has moved since.

`eeg-module`'s audit took step 2 of the pass below and found a second failure shape the entry had not named. Its `tsconfig.test.json` was broken and unreferenced — inheriting `rootDir: ./src` and a `typeRoots` that did not exist, so it could not run at all — and repairing it to type-check the suite **against real core** turned up assertions reading properties only the double has: an `options` bag the real annotation classes do not expose, and band getters the real trend base does not have. Those assertions passed while verifying nothing about the classes the package ships. The lesson for the rest of the family is that the check has to resolve core for real; pointing the test types at the double as well as the runtime only re-blesses whatever the double invented.

The repaired config excludes `tests/mocks` deliberately. The stubs stand in for core at runtime and are not expected to satisfy its types, and requiring them to would mean completing a stand-in for core's whole type surface. The residual hole is stated in the package's own roadmap: the check cannot tell a stub that defaults a field wrongly from one that defaults it right, which the audit also hit — the double left `_laterality` unset where core reads it from the extra properties, so a guard that defers to a stated laterality looked dead.

What makes this worth a deliberate pass is the shape of the failure: a runtime `TypeError` in whichever test first reaches the missing member, which reads as a defect in the package rather than in its stand-in.

- **`eeg-module`** — `EegRecording`'s constructor subscribes to the service's `bufferRange` and `isReady`, so a double lacking `onPropertyChange` made *constructing a recording* throw, and eight tests about montages, setups and the `isActive` setter failed with it. `EegEvent.fromTemplate` needs the `GenericBiosignalEvent.labelFromTemplate` static for the same reason. The audit had to add the trend registry, the cache-status accessors, `resolveTrendEpochLength`, `safeObjectFrom`, a `core/runtime` module and the `Log.info` level before the trend pipeline, the runtime module and the loader's budget check could be tested at all — which is why all three sat near zero coverage rather than being deliberately untested.
- **`csv-reader`** — the `GenericSignalReader` double declares a fixed list of protected fields, so a field core adds and the reader iterates reads as `undefined`. The package's own suite now names each field the reader touches, which is a per-file fix rather than a defence: the next field core adds lands the same way. Its `CsvImporter` double has the second shape of the same problem — a missing *export* on the mocked module surfaces as a parse error logged by the code under test, pointing at the production code rather than the mock.

Nothing catches it in `csv-reader` today: its `tsconfig.json` carries `include: ["./src/**/*"]`, so the double is never compiled against what it stands in for. The seam that makes a fix possible is that a vitest `resolve.alias` does not affect `tsc` — a type-only import inside a double still resolves to real core, which is the property `eeg-module`'s repaired `tsconfig.test.json` now rests on.

`emg-module`'s audit took the other route and used **no doubles for core at all**: every case either constructs a real core class or calls a prototype method against a stub carrying only the members that method reads. The package is small enough for that to be practical, and it is the shape to prefer wherever it is — there is nothing left to drift. Getting there surfaced two properties of core that any package mocking around it has to know, and that a double hides rather than removes.

- **A stub event bus silently blocks every property assignment.** `dispatchScopedEvent`'s return value is the before-phase cancellation result, so a `vi.fn()` answering `undefined` makes core's `_setPropertyValue` treat the write as prevented by a listener and return without assigning. The symptom is a resource whose fields all stay at their defaults with nothing logged, which reads as a constructor that did not run. Core re-exports `EventBus`, so a test can use the real one and the hazard is gone rather than worked around.
- **A `scoped-event-log` mock needs a default export and more than the four levels.** Core's compiled output does `import Log from 'scoped-event-log'` while every package imports it by name, so a factory returning `{ Log }` throws on the first core path that logs — and the thrown message names the mock rather than the code under test. Core also calls `Log.registerWorker` from every service constructor, plus `LEVELS`, `add` and `setPrintThreshold`. `acc-module`'s mock has the narrow shape and passes today only because no test of its own reaches a core logging path.

### The pass

Do it across the family in one go rather than per package, since the pattern spreads with every package that gains a suite (every workspace has tests today, measured 2026-10-03).

1. **Decide whether core needs doubling at all.** Neither package documents why; if the reason is import weight or worker construction rather than behaviour, importing the real classes and stubbing only the boundary is both simpler and self-maintaining.
2. **Where a double stays, typecheck the tests against real core.** `eeg-module`'s [tsconfig.test.json](epicurrents/eeg-module/tsconfig.test.json) is the worked example, wired into `npm test` as a `test:types` step ahead of the unit run. Having each mock class satisfy the core interface it replaces is the stronger form and would catch a wrongly-defaulted field too, but it costs a complete stand-in for core's type surface; the weaker form catches the assertions that verify nothing, which is the failure that had already happened.
3. **Watch what the no-op stubs cost.** A stub that swallows a registration makes the behaviour behind it un-exercisable — `eeg-module`'s `onPropertyChange` stubs mean nothing can fire the `isReady` → `signalCacheStatus` reset that `6f4282d` added, so that fix now has no test and would fail silently.


Three defects behind the scoped-event-bus suite
-----------------------------------------------

🟡 **Priority: yellow** — all three are in the library, and all three were found by making its suite assert.

The suite deferred almost every assertion into a bare `setTimeout` callback. Nothing awaited the timer, so each test function returned and the runner recorded a pass before the callback ran; the assertions were reached, if at all, while some later test was running. `dispatchScopedEvent` is synchronous, so there was never anything to wait for. Rewriting the suite to assert in the test body took it from 13 cases at 43% statement coverage to 34 at 85%, and five of the original expectations turned out to be wrong about the library rather than about the timing: a `Map` iterator compared to an array, a scope-keyed map read by event name, a `removeEventListener` call with no options object (which reaches `EventTarget` and cannot touch the scoped-subscriber registry it was asserted to shrink), and two dispatches that omitted the scope and so could reach neither a scoped subscriber nor a pattern. A scan of the family found no other suite with that shape.

Three defects it uncovered, none fixed:

- **`removeAllScopedEventListeners` empties the wrong map.** The pattern branch ends with `this._subscribers.delete(scope)` where it means `this._patterns.delete(scope)`, so removing a subscriber's last pattern listener leaves an empty array in `_patterns` and deletes whatever event key happens to share the scope's name. The scoped-listener branch above it deletes from the right map, which is what makes the line read as correct.
- **A pattern listener registered without a scope is discarded in silence.** `addScopedEventListener` stores a `RegExp` only under `else if (scope)`, and the call still returns an unsubscribe function, so a caller that forgets the scope gets every sign of having subscribed and no events.
- **A scoped dispatch reaches the debug callback twice.** `dispatchScopedEvent` relays the event and then calls `dispatchEvent`, which relays again. The second payload is `{ ...event, detail: { phase: 'after' } }`, and spreading an `Event` copies no own properties, so what the debug listener receives names neither the event nor its scope. The suite pins the current behaviour rather than endorsing it.

All three belong in the package's own roadmap once the alphabetical sweep reaches `util/`.


Settle one Vite version across the family
-----------------------------------------

🟡 **Priority: yellow** — no symptom today, and the version-compliance rule exists because this class of drift has no symptom until it corrupts data.

`@epicurrents/core` builds with Vite `^7.3.1`, matching this repository. The platform consuming the built editions is on `^8.2.1`, and the two are not the same bundler: 7 is Rollup, 8 is Rolldown, and their handling of `import.meta` in non-ESM output is what put core's worker fallback in the state described below.

Nothing forces a choice while resolution stays inside each package — that is the point of the fix, and a package built with 7 works fine when consumed by 8. What does not survive drift is the shared toolchain assumption: the [version compliance](AGENTS.md#version-compliance--high-priority) rule holds because every package is built the same way, and a family where some packages are on 7 and some on 8 has quietly stopped being that. Every package pins `^7.3.1` today, so the decision is one bump, made in one place and recorded in the canonical-versions table.

The decision is which bundler the family builds on, not whether to allow both. Bump this repository and the packages together.


Finish the worker-resolution fix in the builder
-----------------------------------------------

🟠 **Priority: orange** — every package now resolves its own worker; what remains keeps a regression from reaching a release.

Every reader and service resolves its worker the same way: use the factory registered in `RUNTIME.WORKERS`, or fall back to constructing one from a package-relative URL.

```js
worker = getOverrideWorker ? getOverrideWorker()
                           : new Worker(new URL(`../workers/edf.worker`, import.meta.url), { type: 'module' })
```

Published untransformed, that construct reaches the consumer unresolved and whichever bundler runs last decides what it means. They do not agree. Rollup rewrites it to an emitted chunk; Rolldown — which Vite 8 uses — substitutes `{}` for `import.meta`, and whether the result works then depends on whether it resolved the specifier first. When it does, the argument is an absolute `data:` URL and the empty base is harmless. When it does not, the argument stays relative and `new URL('../workers/edf.worker', undefined)` throws `Invalid URL`. That is the state core's two workers shipped in, and the `EMPTY_IMPORT_META` warning that flags it scrolls past in a successful build.

Every package now builds with Vite and imports its worker through `?worker&inline`, so `dist/` carries it bundled and constructs it from a Blob, with the standalone `umd/` bundle kept as the escape hatch for a consumer whose content security policy forbids `blob:` workers. Two depart from that shape for a reason: `onnx-service` keeps its two workers separate files, because the ONNX runtime fetches its WebAssembly at run time from a host-supplied path and inlining would bake 24 MB of base64 into each bundle; and `pdf-reader` publishes pdf.js's own worker, which pdf.js takes as a URL rather than constructing. `pyodide-service` inlines like the readers do but constructs its worker as an ES module, because it loads the Pyodide runtime through a dynamic import only a module worker can perform — a difference in the worker's type, not in how it is carried. Check the family for a relapse with `grep -rn "import.meta.url" epicurrents/*/dist/`.

Two things belong to the builder rather than the packages:

- **Fail the edition build on `EMPTY_IMPORT_META`** rather than warning, so a package reintroducing the pattern cannot reach a release.
- **Drop each package's worker registrar from `setup/workers/`.** Registering a factory that duplicates the package's own inlined worker ships the same bundle twice — core's entry and the `eeg-montage` override are already gone for that reason.

The list that decides which worker bundles are copied names mostly packages that do not need it. `workerPackages` in [scripts/env.mjs](scripts/env.mjs) now names twelve, and ten of them inline their workers and so have no bundle to copy; only `pdf-reader` and `onnx-models` do. `onnx-models` was added when it was split out, because it is the package a consumer actually registers a model service from and it does not inline its worker. `onnx-service` is deliberately absent: it ships a worker of its own, but a model package supplies its own factory, so the generic worker is reached only by a direct subclass of `GenericOnnxService` and nothing has one.

Nothing fails today, since no registrar registers any of this. The hazard is the list being maintained by hand beside a registry that already knows which packages exist, with no check that it agrees with which of them emit a `umd/` bundle. Deriving it from that would remove the question.


A worker importing the core barrel no longer carries 460 kB of it
-----------------------------------------------------------------

✅ **Closed 2026-10-02** — core declares `"sideEffects": false`, which is the second of the two routes below and the one that fixes every consumer at once.

A worker bundle is self-contained: it cannot resolve a bare specifier, so its dependencies are bundled in, and since the Vite migration it is also inlined into `dist/` as a source string. Its size is therefore paid by every consumer of the package, on load, whether or not the worker is ever constructed. Importing one symbol from the `@epicurrents/core` barrel used to cost about 460 kB of that budget, measured in a worker bundle with the same rollup and `treeshake: true` throughout:

| Import | Bundle |
|---|---|
| `import { SETTINGS } from '@epicurrents/core'` | 472.5 kB |
| `import { validateCommissionProps } from '@epicurrents/core/util'` | 43.1 kB |
| `import { SETTINGS } from '@epicurrents/core/config'` | 14.3 kB |

Two things combined to produce it. Core declared no `sideEffects`, so a bundler had to assume every module in the graph might have top-level side effects and could not drop one merely because nothing referenced its exports — it still removed unused declarations, which is why the figure was 472 kB rather than all of core. And `dist/index.js` re-exports every subtree, so importing anything from the root put `assets`, `config`, `errors`, `events`, `runtime`, `util` and `workers` into the graph for rule one to keep.

The declaration was the route that had to be earned, because if any core module registered something by being imported, claiming purity would let a bundler drop it and the failure would be a missing registration at runtime rather than a build error. The audit that demanded found the module-scope statements were value construction — the vocabulary JSON is a value import and `SETTINGS` is a value — rather than registration, and the three worker entries were split out of their class modules so that nothing in the package binds `onmessage` by being imported. Core's own [AGENTS.md](epicurrents/core/AGENTS.md) carries the obligation that keeps the assertion true.

Every standalone worker bundle in the family after it, against the 478.6 kB and 571–586 kB the seven barrel importers measured before:

| Worker | Before | After |
|---|---|---|
| `api-reader` restapi | 478.6 kB | 36.7 kB |
| `csv-reader` csv | 571–586 kB | 165.9 kB |
| `edf-reader` edf | 571–586 kB | 180.5 kB |
| `natus-reader` natus | 571–586 kB | 176.2 kB |
| `nic-reader` nic | 571–586 kB | 181.9 kB |
| `wav-reader` wav | 571–586 kB | 174.0 kB |
| `dicom-reader` dicom | — | 1223.0 kB |

`dicom-reader` is dominated by its own dependencies rather than by core. `htm-reader`, which had already dropped the barrel import during its audit, fell further still — 47 kB to 12.0 and 179 kB to 135.8 — because the declaration also lets a bundler drop from the subpath graphs.

**The subpath route is no longer worth taking for size.** Measured on `natus-reader`'s worker on 2026-10-02, moving `SETTINGS` to `@epicurrents/core/config` and `GenericSignalReader` to `@epicurrents/core/assets` changed the bundle by six bytes. A subpath import is still the clearer statement of what a module depends on, and a worker holding a value nothing in it reads is still worth removing, but neither is a bundle-size argument now.


Imported files leak a blob URL each
-----------------------------------

🔵 **Priority: blue** — a session-length leak of every imported file, bounded by how many a user opens.

`URL.createObjectURL` is called for every imported file and `revokeObjectURL` is called for none of them. Core does it in eight places, `GenericStudyImporter` and `GenericStudyLoader` among them, and the readers follow — so each imported file stays reachable, and its bytes unreclaimable, until the page is closed. For a study of EDF recordings that is the whole recording per file.

The three revocation sites that do exist are all in export paths, where the URL is created and consumed in the same function. The import path has no owner for the URL's lifetime, which is the actual gap: the study file carries it, the study outlives the import, and nothing is positioned to decide when it is finished with.

Fixing it means giving that lifetime an owner in core — most naturally the study context, revoking on destroy — rather than patching the readers, since a reader does not know when the study is done. Worth noting that some readers prefer the `File` over the URL when both are present, so for those the URL is created, never read and never freed.


A service backed by a worker substitute cannot be shut down
-----------------------------------------------------------

✅ **Closed 2026-10-03** in core's release pass — `ServiceWorkerSubstitute` answers `shutdown` itself, so every substitute that registers no case of its own inherits it, and `edf-reader`'s own case had its reply order corrected.

`GenericService.shutdown` commissions `shutdown` and terminates its worker only `if (await response.promise)`, and the commission resolves with the reply's `success`. `ServiceWorkerSubstitute.postMessage` answers an action it does not implement with a failure, so a substitute that implemented no `shutdown` case resolved it `false`: the worker was never terminated, the commissions and waiters never cleared, `isWorkerSetup` stayed true and `isReady` never changed. Whatever the substitute held — a parsed document, a decoded recording — was held for the life of the page.

Measured 2026-10-03: eleven substitutes answer commissions through `ServiceWorkerSubstitute`. Five answer `shutdown` by inheritance, having adopted `SignalReaderWorkerSubstitute` in their audits so that the handlers they run are the worker's own — `csv-reader`, `dicom-reader`, `natus-reader`, `nic-reader` and `wav-reader`. Three implement a case of their own: `pdf-reader`'s was added in its audit, `edf-reader`'s was already there, and core's `MontageWorkerSubstitute` answers it through `MontageWorker`'s action map, which an earlier count here had wrong. The three that answered nothing were `api-reader`'s and `htm-reader`'s two document substitutes, so the gap was a document and REST-API one rather than a signal-reader one by the time it was closed.

`edf-reader`'s was the second half: it called `super.shutdown()` before `returnSuccess`, and the base method clears the listener list and `onmessage` both, so the reply it then sent reached nobody and the service's `shutdown()` promise never settled at all. The order was the whole fix — answer, then clear — and the base class now does the same thing in the same order. Neither of the two substitutes that gained the inherited answer needed an override to go with it: both hold a processor with no teardown method of its own, so dropping the reference is the whole release. A substitute that does hold something releasable overrides `shutdown` to release it first, as `pdf-reader`'s and `edf-reader`'s do.

**A commission in flight when a service shuts down never settled**, which was the same teardown area and the same silence. `shutdown` cleared `_commissions` once the worker had answered, and clearing the map drops each entry's resolve and reject closures without calling either, so a call awaiting a reply at that moment waited for the life of the page. Found while auditing `pyodide-service`, where it was the one remaining way a caller of that service could wait forever, and it belonged to every service equally. Both `shutdown` and `destroy` now reject through `_rejectAllCommissions`, which is what the worker-error paths already used.

Core type declarations no implementation answers
------------------------------------------------

🟡 **Priority: yellow** — one of the three is left; it cannot produce a wrong value, but it makes a consumer either cast or be wrong, and the cast is what hides the next change.

✅ **The reply field was closed 2026-10-03**, and the item as recorded had it in the wrong place. `TaskResponse.error` is declared an `Error` and is correct as declared: a connector puts a caught exception there, and `TaskResponse` never crosses a thread boundary. The field every service was reading through `as string` is `error` on `WorkerResponse['data']`, which was not declared at all — `_failure`, `returnFailure` and `validateCommissionProps` have always posted it, and the index signature typed it `unknown`, so eight call sites asserted the string it always is. It is declared now, `_failure` narrowed from `string|string[]` to the string each of its call sites passes, and the assertions are gone. Narrowing it also found a latent one: `TrendService` rejected a trend computation with `data.error` unguarded, so a reply that named no cause rejected with `undefined`.

The two `Log.error` calls that read it were wrong in a second way, which the assertion hid. They passed the cause as the third argument, which takes an `Error`, so the failure was logged with no cause attached and an `Error` field holding a string. The cause goes in the message now.

✅ **`getMainProperties` was closed in the same pass.** It was declared to return `Map<string, string|number|null>`, and no implementation answered it — core's own `GenericResource` and `ResourceCollection` both put a parameter object in the value, because the map is read as message-to-parameters: the key is the string to translate and the value interpolates into it. [NavigatorItem.vue](interface/src/app/navigator/NavigatorItem.vue) cast through `unknown` to read what it was given, and said so in a comment. The new `MainProperty` names the union, and typing the map in `GenericResource` to it rather than leaving it to infer `Map<any, any>` is what found the fourth member: `ResourceCollection` sets a `Date` under the key `'date'`, which the declaration never admitted and the navigator has no branch for, so it renders as the untranslated word. That last part is a display defect in the collection, left for whichever pass opens it. The same declaration would have caught `tab-module` keying its entries by their own counts — the defect its audit found, where the navigator rendered a bare number for "2 tables" and dropped one of two entries whenever the counts matched.

The third is the one still open, found in `wav-reader`'s audit and the one that had actually cost something. `SignalDataDecoder.decodeData` declares seven parameters, and `GenericSignalReader` calls it with all seven: the header, a chunk of the data region, the byte offset the samples start at *within that chunk*, the starting record, the range, the prior interruption time and a raw flag. TypeScript lets an implementation declare fewer, so a decoder written as `decodeData(header, buffer)` satisfies the interface while silently discarding the other five — including the offset, without which it has no way to know that the buffer it was handed is a part of the file rather than the file. `wav-reader`'s did exactly that, re-applied the header's own whole-file offset to every chunk, and returned samples shifted 44 bytes past where the chunk begins with NaN for the overrun. Nothing in the chain could see it: the implementation type-checks, the caller type-checks, and the result is an array of numbers of the right length.

`dicom-reader`'s decoder has the same two-parameter shape and does not reach that call site — its reader overrides `cacheSignals` to decode the whole waveform in one pass, though `getSignals` is inherited and does reach it, so what keeps it safe is which of the two the reader is driven through rather than the shape of either. `edf-reader`'s is the only one in the family that spells out all seven.

**The correction recorded here — making the parameters the caller always passes required — does not work, tried 2026-10-03.** `FileDecoder.decodeData`, which `SignalDataDecoder` extends, declares `buffer` optional, and TypeScript forbids a required parameter after an optional one; making `buffer` required in the derived interface instead fails as an incompatible extension. Either `FileDecoder` changes with it, which reaches the decoders that are not signal decoders, or the positional tail becomes one options object — which is the honest shape anyway, since five of the seven arguments describe where in the file the chunk sits. That is an API change for three reader packages, so it wants its own pass rather than a slot in a release.

Nothing type-checks the builder's own setup directory
-----------------------------------------------------

🔵 **Priority: blue** — no symptom today; the files are small, and Vite resolves at build time what TypeScript never reads.

[setup/](setup/) is the builder's own source — the registrars, the worker factories, the edition entry — and no type-check program includes it. [scripts/typecheck.mjs](scripts/typecheck.mjs) walks the cloned packages; the interface's `tsconfig.json` includes `./src/**/*` only, and nothing under its `src/` imports `#workspace/setup/`; [vite.config.lib.ts](vite.config.lib.ts) takes [setup/index.ts](setup/index.ts) as a build entry, and a Vite build does not type-check. So the one directory this repository actually owns is the one nothing vets.

It surfaced while auditing `pdf-reader`, which carried an ambient `declare module '*?raw'` its own sources never used. Seven files under [setup/workers/](setup/workers/) import a worker bundle with `?raw`, so the declaration looked load-bearing for them — and is not, because those files are never in a program that would need it.

No installed package would supply one either. `pyodide-service` was recorded here as the one that still published such a declaration, and it never has: the file holding it is not copied into `dist`, which `npm pack` confirms. So a type-check of [setup/](setup/) would have to declare the suffixes itself — `vite/client` in the program's own `types` — rather than inherit them from whatever a dependency happens to publish, which is the better arrangement in any case.

A `tsconfig.json` at the builder root including [setup/](setup/) and [profiles/](profiles/), with `vite/client` in `types` for the `?raw` and `?worker` suffixes, is the whole of it — plus a `typecheck:setup` script, so the gap cannot reopen quietly.

The declared core ranges and the lockfiles disagree with the core that will be published
----------------------------------------------------------------------------------------

🟠 **Priority: amber** — invisible in the workspace, and only the workspace is ever tested.

All eighteen dependent packages name `@epicurrents/core: ^2.0.0` as of 2026-10-03, in both `devDependencies` and `peerDependencies`: the sixteen the sweep has opened, plus `onnx-service` and `onnx-models`, which it opened and split. `wav-reader` was the last on `^1.0.0` and moved with its audit.

**The interface was the nineteenth, and nobody had looked.** It is a workspace member rather than one of `epicurrents/*`, so it fell outside every count in this section, and it named `^0.3.0 || ^1.0.0` in both blocks until its own pass on 2026-10-03 — a range admitting neither the installed core nor either release, two majors behind the siblings. It is now `^2.0.0`, and it does not join the nine below: it reaches none of the surface core's next release adds, which a scan for `applySnapshot`, `SignalReaderWorkerSubstitute` and the three `BaseWorker` members confirms. Being private is what kept the range both invisible and harmless — nothing installs the interface from a registry — but it is the manifest a host application reads when the package is consumed as a dependency.

Nothing failed while one was behind, because nothing resolves through the range. The workspace symlinks core from the checkout, so every build, type-check and test in this repository runs against the checkout whatever the manifest asks for — which is also why the two problems left in this section are both invisible here.

**Until a nested copy exists, at which point the range stops being invisible and starts breaking the workspace.** Observed 2026-10-02, when eight still named `^1.0.0`: all eight carried their own `node_modules/@epicurrents/core` at 1.0.3, and a build of the family failed in exactly those eight — `natus-reader`, `nic-reader` and `wav-reader` outright, on exports core 1.x does not have, and the other five in `build:types` on `Cannot find module '@epicurrents/core/types'`, a subpath 1.x does not export. The interface had one too, and its 1.0.3 against the checkout's 2.0.0 gave every resource type two identities, which is what a dozen `not assignable to` errors in unrelated Vue components turned out to be. Deleting the eight nested directories fixed all of it with the ranges left at `^1.0.0`, which is the proof that the range is not what any of it was about. So the order matters: a nested copy is the thing to look for first, and bumping a range in response to these symptoms treats a cause that is not operating.

What puts a copy there is a root `npm install`, which resolves each member's declared range from the registry rather than linking the sibling; it is worth avoiding in this workspace for that reason alone.

**The per-package lockfiles are the same problem one layer down, and they outrank the range.** Six packages commit a `package-lock.json`, and three still pin a core that predates 1.0 — `0.3.0-2` in `eeg-module` and `emg-module`, `0.2.0-1` in `onnx-service` — resolved from the registry rather than linked. `setup` installs each package with `npm i` against its own lockfile, so a fresh clone gets that version whatever the range says, and the packages whose audits corrected the range to `^2.0.0` have it undone by their own lock. `htm-reader`'s, `pdf-reader`'s and `pyodide-service`'s were regenerated during their passes and are the three that agree with their manifests; `onnx-service`'s was not, so its range and its lock disagree today.

Regenerating a lock has to happen outside the workspace to work at all: the packages are workspace members, so `npm install --package-lock-only` run inside one walks up to the root and leaves the package's own lock untouched, reporting success. Copying the manifest to a scratch directory and generating there is what produces a lock that describes the standalone install `setup` actually performs.

The other three packages that carry no lockfile at all — `acc-module`, `edf-reader` and the rest — are a separate question this does not settle: whether a package published to a registry and also built inside a workspace should commit one. Whichever way it goes, the six should agree. The range only becomes load-bearing for a consumer installing the packages from the registry, which is the one configuration never exercised here. That makes it the same shape as the version-compliance hazard in [AGENTS.md](AGENTS.md): a mismatch that type-checks locally and can only be observed by whoever installs the published artifact.

Fold the bump into each package as the sweep opens it, rather than as an eighteen-package commit, so the range moves together with the code that was actually verified against the new core. What the sweep must not do is bump a range to a core version that is not yet published — core holds its release until the sweep finishes, so a package published in the meantime would name a version the registry does not have.

The target is `^2.1.0` for any package that touches any of it, not `^2.0.0`. Core's next release is a minor because repairing the settings relay added `AppSettings.applySnapshot`, and because closing the worker-substitute vocabulary gap added `SignalReaderWorkerSubstitute` together with the three members on `BaseWorker` that made it possible — `_validate`, `_postMessage` and `_close` — and the same three lifted onto `ServiceWorkerSubstitute` in core's release pass, where `_validate`, `_failure` and `_success` are now inherited rather than restated. All of it is published surface, and `^2.0.0` admits a core with none of it: 2.0.0 went to the registry on 2026-09-20 at 07:32Z and that commit landed thirteen hours later the same day, which unpacking the published tarball confirms — its `dist/workers/base.worker.d.ts` declares none of the three.

Every package bumped so far names `^2.0.0`, and nine of them use that surface and need revisiting at release. `api-reader` calls the settings method; `natus-reader` extends the substitute class; `csv-reader`, `dicom-reader`, `edf-reader`, `nic-reader` and `wav-reader` extend it or validate through the base class in their workers; `onnx-service` does both and validates through the base class; and `pyodide-service` validates through the base class in its worker layer. For those nine the range is not merely untidy but wrong, and it stays wrong until there is a 2.1.0 to name. The test suites widen it further: a loopback that drives the real worker class on the test thread overrides `_postMessage` and `_close`, so a package testing that way does not compile against the published core either, whatever its source does. `acc-module`, `doc-module`, `eeg-module`, `emg-module`, `htm-reader`, `ncs-module`, `onnx-models`, `pdf-reader` and `tab-module` use none of it, so `^2.0.0` states what they were verified against: `eeg-module` has no worker of its own and snapshots the app settings into its own `setup-worker` commission, `onnx-models` reaches neither surface in its own code — its worker extends one from `@epicurrents/onnx-service`, so whatever core version that package needs is carried by the range it declares rather than by this one — and `pdf-reader`'s substitute extends `ServiceWorkerSubstitute` directly and lets the base class answer the settings snapshot, so it calls the new method nowhere — it validates through a wrapper of its own, over the utility the published core does export, which is what keeps it out of the list above.

`edf-reader`'s worker was the last one validating through the exported utility, and was converted in core's release pass rather than with the others: it had been the only signal reader whose `^2.0.0` stated the truth, so converting it earlier would have moved it into the set above to buy nothing observable, where doing it alongside the release costs nothing. The hazard the base class's method removes is a reply sent to whatever `postMessage` resolves to at the call site rather than through the worker's own transport, which matters when the handler is run anywhere but a dedicated worker thread — so it is latent for every worker here and live for none. What the conversion did fix in each of the three workers is a dead second reply: the handler reported the refusal again after the validator had already answered the commission, and the service releases the commission on the first reply.

`natus-reader`'s worker is a separate question, still open: its `setup-worker` validates nothing at all, casting each of the four source properties and leaving `setupStudy` to refuse, which is defensible while every one of them is optional but makes it the only worker of the six with no validation step.

**Two packages need the bump for a fix rather than for a symbol, which is a distinction the range cannot express.** `api-reader`'s substitute and `htm-reader`'s two both compile against `^2.0.0` and always will, because what they gained is `ServiceWorkerSubstitute` answering `shutdown` on their behalf — inherited behaviour, not a member they name. Against a published 2.0.0 they still refuse the commission and still cannot be shut down. So their ranges are honest and their installs are not, and only the release fixes them.


Every package's lint script has at some point been unable to run
----------------------------------------------------------------

✅ **Closed 2026-10-03** — all eighteen dependent packages carry the family's flat `eslint.config.mjs` and report against it; `wav-reader` was the last of the five shapes below, and the last package of any shape.

The failure reads as a configuration problem rather than a missing or absent file, which is what let it survive being looked at. `wav-reader` had a `lint` script and an `.eslintrc.cjs`, the ESLint 8 format, which ESLint 9 will not read — and a stale ESLint 8 under its own `node_modules` that did read it, so the script ran, reported nothing worth acting on against a rule set of two rules, and exited zero. The family set reports three on the same sources.

`nic-reader` was the one package with no configuration file at all, and it failed in a third way worth recording because the message names nothing relevant. It pinned ESLint 8, under which `eslint src` lints `.js` by default, so the run exited 2 with *"No files matching the pattern src were found. Please check for typing mistakes in the pattern."* — a complaint about the argument, from a tool that had found no config and would not have read one. A package reporting that is not misconfigured in its script; it has never linted a line.

`emg-module` and `ncs-module` each had the configuration under a leading dot, where ESLint never looks for it, and the fix was the rename plus the two `@stylistic` plugins the family rule set references; `htm-reader` was one of the eslintrc five and needed the same plugins plus `typescript-eslint` and `@eslint/js`. `natus-reader` had neither a configuration nor the `eslint` dependency its `lint` script called, and needed the config plus five devDependencies; `nic-reader` had no configuration and a pinned ESLint 8 whose packages shadowed the hoisted 9, so the stale `eslint`, `@eslint` and `@typescript-eslint` directories under its own `node_modules` had to go before the config could be read. `onnx-service` was the two failures at once — an `.eslintrc.cjs` ESLint 9 will not read *and* a local ESLint 8 shadowing the hoisted 9 — so moving the stale directories aside was what made the exit code change at all, from a complaint about the pattern to a report of findings. `pdf-reader` is the fourth shape, and the one that looks healthiest from outside: a flat config ESLint 9 loads, carrying a single hand-written `quotes` rule above the recommended set it then spread, so the run reported eight errors of which five were template literals the family rule set allows as house style. A package whose lint exits non-zero on its own convention is one nobody runs, and the two findings underneath — an empty interface and two `async` methods with no `await` — were what the noise was hiding. `pyodide-service` is the fifth, and the one most likely to be mistaken for healthy: an `.eslintrc.cjs` *and* a local ESLint 8 that could read it, so `npm run lint` ran, reported twelve problems and exited 1 — a working lint by every outward sign, measured against a configuration whose only two rules turn the unused-variable checks off. Under the family set the same sources reported 87, and most of them had one cause: the Python interpreter was reached through `(self as any).pyodide` at every site, which switches type checking off for everything the bridge returns. Expect the first successful run in a package to report in the tens or hundreds, because the rule set is core's and nothing has ever been linted against it; budget the triage separately from the rename. The spread so far is wide and worth knowing before planning one: `natus-reader` reported ten, `nic-reader` thirteen, `onnx-service` fourteen, `ncs-module` twenty-two and `pyodide-service` eighty-seven, where core reports 613. `tab-module` is the fifth shape again, and the clearest measurement of what the shape costs: an `.eslintrc.cjs` whose whole rule set is the recommended pair with both unused-variable checks turned off, read by a local ESLint 8, so `npm run lint` ran and reported two problems — both of them one `Map<any, any>` annotation. The family set reports 49 on the same sources, and the two the old configuration found were the annotation holding a return type that disagrees with core's declaration. Size predicts it better than age does, and an untyped escape hatch repeated across a file predicts it better still.

What makes this a family-level item rather than five package-level ones is that `npm run lint --workspaces` cannot distinguish a package with no findings from one whose configuration was never read. Both are silent, and the silence is the same.


Package manifests carry leftovers from the webpack era
------------------------------------------------------

🔵 **Priority: blue** — no symptom; the value is that the next reader is not misled.

Thirteen packages committed a `.env.example`, and one still does: `core`, declaring `ASSET_PATH=` and `ROOT_PATH=`. Those names appear nowhere else in the repository — no build config, no script and no source reads either, and the Vite migration removed whatever did. `pdf-reader`'s declared `MODULE_PATH` instead, with an absolute Windows path as the example value, and that name was read in no file either.

A committed example file is an instruction: it tells a new contributor these variables have to be set, and none of them do. The twelve that have gone — `api-reader`, `doc-module`, `edf-reader`, `eeg-module`, `emg-module`, `htm-reader`, `ncs-module`, `onnx-service`, `pdf-reader`, `pyodide-service`, `tab-module` and `wav-reader` — went with their audits; `ncs-module` was the one still carrying a `dotenv` devDependency for them, and that went with it. Core's should go the same way, in its own pass.

A smaller one of the same kind: every package's `vitest.config.ts` starts straight at its import, with no module docstring and none of the `@package` / `@copyright` / `@license` header that [AGENTS.md](AGENTS.md) asks of every TypeScript file. Measured 2026-10-02 across all eighteen, it is uniform, and the sibling `.mjs` build configs all carry one — so either the rule means package source rather than build configuration, or eighteen files are missing a header. Worth settling in one pass rather than in whichever package is open; changing one of the eighteen makes it the odd one out.

A stray directory worth knowing about before counting anything under `epicurrents/`: there is an `epicurrents/interface/` holding four type files and no manifest, while the real interface is the sibling `interface/` that the workspace and the registry both point at. Nothing references the stray copy, and being inside a git-ignored directory it is tracked by nothing, so it costs only confusion — but two of its four files are named in this document's own account of where the `__EPICURRENTS__` declarations live, so a grep looking for them finds a copy that is not the one being described.

The related manifest question is `"type"`. Every package emits ESM into `dist/` and declares an `exports` map whose `import` condition points at a `.js` file, but exactly one — `natus-reader` — declares `"type": "module"`. The rest depend on Node's module-syntax detection to read those files as ESM, which works from Node 22 onward and is a fallback rather than a declaration. Bundler consumers never reach the question. Declaring it makes the family consistent and the intent explicit; doing it needs a check that nothing in a package's own tooling relies on a `.js` file being CommonJS.


`build:assets` can report success without building a package
------------------------------------------------------------

🟠 **Priority: amber** — a silent skip in the command every other verification depends on.

[scripts/build.mjs](scripts/build.mjs) refuses to build a package that carries its own `node_modules/@epicurrents`, which is the right refusal: a nested core gives every resource type two identities, and the section on the declared ranges above records what that cost once already. But the guard tests whether the directory exists, not whether anything is in it, and the refusal is a `console.error` followed by `return` — the run continues, the other packages build, and the command exits 0.

Both halves were live between 2026-10-02 and 2026-10-03. Clearing the interface's nested copy removed the package inside it and left `interface/node_modules/@epicurrents/` standing empty, so every `build:assets` from then on skipped the interface and said so in one line of a long log while still reporting success. Nothing downstream noticed, because the interface is also built directly by `build:dev` and by its own `npm run build`. Removing the empty directory restored it.

Two changes, and the second matters more than the first: test the directory's contents rather than its existence, and make a refusal fail the run. A build that cannot build a package has not succeeded, and the one place this is most likely to be relied on is a check that nothing was left stale.


The interface has no lint, and switching it on has a backlog behind it
---------------------------------------------------------------------

🟢 **Priority: green** — worth having, with the honest caveat that it may never be worth the fixes.

The interface declared `lint` and `lint:src` scripts, no ESLint configuration, and no ESLint dependency; the binary resolved only because a sibling's devDependency hoists it into the workspace, which is why running it reported a missing config rather than a missing command. The scripts were removed in the package's pass on 2026-10-03 rather than left pointing at nothing.

Adding it is not a copy of a sibling's config. The interface is the only package in the family with single-file components — 110 of them against 80 TypeScript files — so it needs `eslint-plugin-vue` and `vue-eslint-parser`, neither of which is installed anywhere in the workspace, and `eslint src` would have to be told to cover `.vue` at all. The rule set would also want the pruning core's config documents: some two thousand two hundred warnings there came from stylistic rules that disagreed with how the project writes code, and this package is two and a half times core's size in a file type nothing has ever linted.

The reason to want it anyway is that `no-floating-promises` is what finds the defect class the package's own pass found by hand. The reason it may stay unbuilt is the size of the first run, which nobody has measured and which has to be triaged before the rule set means anything.


Interface hygiene the 2026-10-03 pass did not finish
----------------------------------------------------

🟡 **Priority: yellow** — cosmetic, except where it is not; recorded so the remainder is not rediscovered.

The pass took the line-length cap from 150 lines over to 42, and the 42 are three kinds. Eight are `@param` lines, which [AGENTS.md](AGENTS.md) exempts. Four are template tags carrying nothing but `v-for` and `:key`, or `v-else-if`, which the Vue style rules require on the opening tag line — at the indentation a nested table reaches, the two rules cannot both be satisfied and the structural one wins. The remaining thirty are long because they hold an expression, and the fix for those is the rule against inline expressions in templates rather than the one about line length: the expression moves to a method or a computed, and in that last one of them is an `@click` handler, which that rule forbids outright. They are concentrated in [SettingsDialog.vue](interface/src/app/settings/SettingsDialog.vue), [ExamineTool.vue](interface/src/app/views/biosignal/tools/ExamineTool.vue) and [TabViewer.vue](interface/src/app/modules/tab/components/TabViewer.vue), all of which have no component tests, which is why the pass measured them and stopped.

Two more it measured and left. Every TypeScript file now carries the `@package` header; 108 of the 110 single-file components do not, and the two that do arrived in the last three months. Adding them is a change to nearly every file in the package, so it is the same question the `vitest.config.ts` headers above pose — whether the rule means package source or every file — and worth settling once rather than per package. And the casts went from 59 to 41: the eleven asserting members `BiosignalResource` already declares are gone, as are the browser-API ones, and what remains is two clusters the Vuex to Pinia migration dissolves by itself — eight reads of `(store.state as any).INTERFACE` and five passes of a module runtime as `Record<string, unknown>` — plus the global's missing `registerIconLibrary`, which is a core type change rather than an interface one.

Two defects found while measuring and deliberately not touched, both in components with no tests. [AnnotationLabels.vue](interface/src/app/views/biosignal/overlays/AnnotationLabels.vue) computes `otherLabelStart + (...)?.offsetWidth || 0`, which groups as `(a + b) || 0`, so a missing `offsetWidth` yields `0` rather than the start it was defending — the `|| 0` reads as a default for the width and is not one. And [src/i18n/index.ts](interface/src/i18n/index.ts) registers `dateTimeFormats` under `en-US` and `fi-FI` while the locale it is created with is `en` or `fi`, so the formats resolve for no locale; nothing calls `$d` either, which is why it has never shown. The date rendering added in this pass deliberately goes through the `date` and `datetime` message keys instead, which do resolve.

The util packages were last, and the sentinel was the trap
----------------------------------------------------------

🟠 **Priority: amber** — recorded because the shape repeats, not because anything is left open here.

The three packages under [util/](util/) were swept on 2026-10-03, after the nineteen in the `@epicurrents` namespace, on the reasoning that nothing in them depends on that namespace so nothing was blocked behind them. That is true of their dependency graph and false of their consequence: all three are dependencies of core, so every defect in them was reachable from every package that had already been looked at. Eight were found, and the two worth remembering are the ones that no test could have caught by being more thorough, because both were agreements between two places that neither place names.

The first is the mutex's field positions. [asymmetric-io-mutex](util/asymmetric-io-mutex/src/index.ts) publishes `UNASSIGNED_VALUE` as the way a field asks to be laid out, and `setDataFields` honours it; `setMetaFields` did not, so a meta field declared the same way kept the sentinel, `-1`, as its position. A position is an offset from the start of the meta region, and the slot one before that region is the lock. Initialization writes the empty-field value into every meta field, so declaring a meta field the documented way wrote `-16777215` over the write lock, after which every lock attempt spun for five seconds and failed with `Maximum retries of locking operation reached` — a message that names the lock and not the field. Nothing had hit it because every existing caller passes explicit positions, which is what the package's own tests do and what the README's example does without saying why.

The second is the log's worker relay. A worker posts its events as `{ action, level, message, scope, context }` and the parent read `data.extra` — a key that message has never carried. The whole context was therefore dropped on every relayed event, and the field that matters is `sensitive`: it is what makes `LogEvent.message` redact itself, so a message a worker withheld from its own console was printed in full on the main thread. `announce` and the error and stack a worker-side `Log.error` captured went the same way. The README is the likely source: it described `Log.add`'s fourth argument as `extra` rather than as the context that holds it, so the reading side was written against the documentation and the posting side against the type. Both were corrected together.

A third instance turned up in the clean-slate pass, in the mutex again and from the same missing term. A field's address is the mutex's start plus the start of its region plus the field's offset, and the two sides of the update handshake each dropped a different part of it: the setters called `Atomics.notify` without the mutex's start, and `waitForFieldUpdate` called `Atomics.wait` with the start but, for a meta field, without the start of the meta region. For data fields they disagreed only where a mutex did not sit at the start of its buffer. For meta fields they disagreed everywhere, by exactly one slot, which is the lock -- so waiting for a meta field to update meant waiting on the lock cell, woken by lock traffic and never by the write it was waiting for. All four sites now call one helper, which is the thing that was missing: the address existed in four copies and in no single place.

The pattern in all three is a contract held in two places with no third place naming it, and in each the fix came with a test whose only job is to fail when the two stop agreeing.


The log inspector does not follow its own package
-------------------------------------------------

🟡 **Priority: yellow** — a whole-file reformat, worth doing when the file is next opened for a real reason.

[LogInspector.ts](util/scoped-event-log/src/LogInspector.ts) is indented with two spaces where the rest of the package uses four, and carries the only eight lines in [util/](util/) still over the 120-column cap. The eight are inline SVG icon definitions, from 179 to 532 characters, and their length is path data rather than code: a `d` attribute tolerates line breaks, so they could be wrapped, but wrapping opaque coordinate lists produces a diff nobody can review for a readability the result does not gain. The indentation and the icons are one item because they are one file, and a reformat that leaves the SVG alone would still be the whole file.

Two defects in the same file were fixed in the pass rather than recorded, both in how it renders an event's payload. It printed `event.extra` directly, which for the `{ error, stack }` shape that `Log.error` always produces renders `[object Object]` — so the inspector was least useful exactly when an error had been logged. The package already had the answer in `Log.formatExtra`, which the console path uses and which was private; it is now public and the inspector calls it. Its `repeat` directive also keyed every line of a payload identically, so Lit could not tell them apart.


Removing events in bulk notifies for a scope but not for the log
----------------------------------------------------------------

🟢 **Priority: green** — small, and the asymmetry is the whole of it.

`Log.clear`, `removeScopeEventsAtLevel` and `removeScopeEventsBelowLevel` each dispatch a `__clear` event to their listeners after removing events, so a consumer showing the log refreshes. `removeEventsAtLevel` and `removeEventsBelowLevel` remove events across every scope and dispatch nothing, so a listener that cleared its view on `__clear` keeps showing events the log no longer holds. The pass left it alone because the fix changes what listeners are told rather than what the log holds, and a consumer that had worked around the silence would then be told twice.


The mutex does not export the types its own methods take
---------------------------------------------------------

🟢 **Priority: green** — an addition, with one question to settle first.

`setData` takes `TypedNumberArray`, `setDataArrays` takes `TypedNumberArrayConstructor` and the input arrays are `ReadonlyTypedArray`, and none of the three is exported from [asymmetric-io-mutex](util/asymmetric-io-mutex/src/index.ts)'s root — the barrel lists ten names and stops short of these. A consumer therefore cannot name the argument types of the public API, and core did the available thing: it declares its own `TypedNumberArray` and `TypedNumberArrayConstructor` in [types/util.ts](epicurrents/core/src/types/util.ts), over a wider set that includes 64-bit and sub-32-bit arrays. Exporting the mutex's own would put two same-named, differently-shaped types in reach of the same import, which is the question to settle before adding them: whether core's are the general ones and the mutex's are the constrained subset, or whether core should narrow to the mutex's where it is talking to the mutex.

The barrel also lists its type names in a value `export` block rather than an `export type` one, which compiles today and would not under `verbatimModuleSyntax`.

Two smaller things the pass measured in the same package. `setDataFields` opens with `if (!this._outputMeta)`, which the constructor makes unreachable — the property is assigned there and is not nullable — so the message behind it has never been printed, and what the intended precondition was is not recoverable from the code: a mutex with no meta fields is legitimate, so the obvious reading of the message would be wrong to enforce. And the top-level declarations are not in the alphabetical order [AGENTS.md](AGENTS.md) asks of a type-only file, because they are in dependency order instead: `ArrayBufferPart` comes before the two types that extend it, and sorting by name puts it after both.


Lint does not reach the util tests, and one package has none
-------------------------------------------------------------

🟢 **Priority: green** — the cheap half of the lint question above.

[scoped-event-bus](util/scoped-event-bus) and [scoped-event-log](util/scoped-event-log) both lint, both pass clean, and both run `eslint src` — so neither package's tests are linted, which is where an unawaited promise is most likely to be written and least likely to be noticed. [asymmetric-io-mutex](util/asymmetric-io-mutex) has no lint script and no configuration at all, and it is the package whose pass found an unawaited write that made `setDataFieldValue` report success for writes that had all failed; `no-floating-promises` names that defect directly. Unlike the interface, these three are small, already have working configurations to copy between them, and have no single-file components, so the first run is a measurable job rather than an open-ended one.


The mutex lock path uses promise executors it does not need
------------------------------------------------------------

🟡 **Priority: yellow** — latent, and the shape invites the defect that was just fixed in it.

`lock` wraps its body in `new Promise(async (resolve) => ...)`. An async executor swallows anything it throws: the rejection has nowhere to go once the promise is the executor's own, so a throw inside the retry loop leaves the promise pending for good. That is the same failure the pass fixed one line into the same function, where an early `return false` — a value a promise executor discards — left every caller of an uninitialized mutex awaiting a promise nothing would settle. The remaining cases are harder to reach but the construction is what makes them possible, and the function needs no executor: it is already `async`, so the retry loop can return directly.

`onceAvailable` has the matching shape from the other side: a `while (true)` loop around a synchronous `Atomics.wait` inside a non-async executor. In a worker that blocks the thread as intended; on a main thread `Atomics.wait` is not permitted, so the method is unusable there, and nothing in the signature or the docstring says which scope it belongs to.

The two older util suites depend on the order they run in
---------------------------------------------------------

🟡 **Priority: yellow** — green in CI, and silently weaker than it reads.

[IOMutex.test.ts](util/asymmetric-io-mutex/tests/IOMutex.test.ts) and [Log.test.ts](util/scoped-event-log/tests/Log.test.ts) both fail under a shuffled run: four of nineteen cases in the first, eight of twenty-five in the second, varying with the seed. Both were measured with the files added in the 2026-10-03 pass removed, and the counts were identical, so the dependence is entirely in the older files and the new ones are order-independent.

The two causes are different and both are structural. The mutex suite threads a module-level `BUFFER_POS` cursor through its `TestMutex` constructor, so each case carves the next region out of one shared two-kilobyte buffer and a case that runs early gets a different region than it asserts against. The log suite asserts on static state earlier cases change -- `Default print threshold is INFO` holds only while nothing has set it, and the event list and listener registry are global to the class with no per-case reset.

Neither is a one-line fix: the first wants a buffer per case, which is a rewrite of the helper every case uses, and the second wants a reset in `beforeEach`, which several assertions are written against the absence of. The cost of leaving them is that a case which stops testing what it claims cannot be told from one that still does, since the order that makes them pass is the order they are always run in.

natus-reader is still on vitest 3 and survives it by not measuring coverage
---------------------------------------------------------------------------

🟢 **Priority: green** — one line, and the package it would have broken is already fixed.

Every package in the workspace declares `vitest` at `^4.1.5` except two, which declared `^3.0.0`. The workspace cannot satisfy that, so an install nests a private vitest 3.2.7 in each — and the nested `@vitest` it brings carries `expect`, `runner`, `snapshot`, `spy` and `utils` but no `coverage-v8`.

That gap is what turns a stale range into a broken suite, and the reason is a convention rather than an oversight: nineteen of the twenty-two packages that run `--coverage` do not declare `@vitest/coverage-v8` at all, resolving it from the root instead, and only the three util packages name it. So the provider is always the hoisted one. A package whose `vitest` range admits the hoisted version gets a matched pair; a package that pins an older one gets its runner nested and its provider hoisted, and vitest refuses the pair outright: *Running mixed versions is not supported*. The invariant to keep, then, is not that every package declare the provider — it is that no package pin a `vitest` the root cannot satisfy, because the provider will not follow it down.

[nic-reader](epicurrents/nic-reader) ran `vitest run --coverage` and so crashed outright, taking its 101 cases out of the workspace run with no failing assertion anywhere to point at it; it is now on `^4.1.5` with its nested copies removed and its suite passing unchanged. [natus-reader](epicurrents/natus-reader) has carried the same nested 3.2.7 since 2026-09-17 and passes, because its `test:unit` is a bare `vitest run` and nothing ever asks for the provider. It is the only package in the workspace whose unit run does not measure coverage, so the day that is corrected is the day it breaks the same way, and the message will name vitest rather than the change that was actually made.

The skew is also what makes this hard to see coming: the nesting appears at install time, not at edit time, so a package can declare an unsatisfiable range for weeks and only break when something unrelated triggers an install.

Twenty-two declarations the workspace cannot satisfy, and no way to see them
----------------------------------------------------------------------------

🟡 **Priority: yellow** — mostly harmless duplication, with the measurement being the point.

Publishing [scoped-event-bus](util/scoped-event-bus) 0.4.0 on 2026-10-03 left core and the interface declaring `^0.3.0`, which stops at `0.4.0`, and the install that followed fetched the superseded version into each of them, where it shadowed the root symlink and both built against the release the bump existed to supersede. That is the hazard [AGENTS.md](AGENTS.md) describes, and the clean removed them; what was missing was any way to ask which declarations will nest next. Comparing every declared range against the version actually hoisted at the root answers it, and on 2026-10-03 it answered twenty-two.

Thirteen are `esbuild`, declared `^0.28.2` across the readers, the modules and the services against a root holding 0.27.3, with natus-reader asking for `^0.25.0` instead. Each gets its own nested build tool, which is duplication rather than a split, since nothing imports esbuild as a library. Six are babel packages under the OHIF trees, two of them pinned to an exact version. One is the mutex pinning `typescript` to `5.6` exactly, which is deliberate and documented in the file that needs it: the 5.7 declarations are what the `@ts-expect-error` above `TypedNumberArrayConstructor` exists for, so a 5.6 pin and a 5.7 root are the two halves of one decision rather than a drift.

The one worth a second look is `@stdlib/constants-float32`, where core declares `^0.2.1` and [asymmetric-io-mutex](util/asymmetric-io-mutex) declares `^0.0.6` — two majors apart, with core carrying a nested 0.2.1 and the mutex reading the root 0.0.6. Both import `EPS` and each defines its own `floatsAreEqual` over it, so the two float comparisons in the signal path are made against constants from different packages. They agree: `EPS` is `1.1920928955078125e-7` and `MAX_SAFE_INTEGER` is `16777215` in both, which is what a float32 epsilon has to be, so nothing is wrong today. What is wrong is that nobody chose this, and the next install is free to resolve it differently.
