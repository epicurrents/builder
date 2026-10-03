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
- **An edition smoke test.** Build an edition in CI and assert the output shape — the lib, the stylesheet, `index.html` — and that a trimmed edition really does exclude the modules it did not select.
- **A pull-request workflow** running those plus `npm run typecheck`.


The workspace test sweep cannot be green
----------------------------------------

🟡 **Priority: yellow** — the command that reports the family's health reports failure whatever the family does.

`npm run test` runs `npm run test --workspaces --if-present`, and one of the twenty-three workspaces — `wav-reader` — has a `test` script and no test files. Vitest exits 1 on "No test files found", so it fails the sweep. `--if-present` does not help: the script is present, it just has nothing to run.

The effect is that the sweep's exit code carries no information, and a real failure has to be read out of the scrollback rather than out of the result. The one failure in the sweep today is of this kind, which is the part worth knowing: there are no failing assertions anywhere in the family, and 2975 tests pass.

Two ways out, and they say different things. `passWithNoTests` in each empty package's vitest config makes the sweep green and the gap invisible. Removing the `test` script from a package that has no tests makes `--if-present` skip it, so the sweep is green and the gap is visible in the manifest. The second is better until the packages gain suites, and neither substitutes for giving them one.


Two signal readers' worker substitutes answer a subset of the commission vocabulary
-----------------------------------------------------------------------------------

🟠 **Priority: amber** — the failure is a study that cannot be closed, on the no-SharedArrayBuffer path, and one of the two packages has no tests at all.

Core added `SignalReaderWorkerSubstitute` precisely to stop a package hand-writing this. It runs the worker's own handlers on the main thread, so the vocabulary cannot drift from the worker's; a substitute built on `ServiceWorkerSubstitute` instead answers the actions its author enumerated and fails every other with *"Action X is not implemented"*. That is not a degraded fallback. `GenericService.shutdown` and `unload` both await a commission before tearing anything down and a failed commission rejects, so a missing handler does not slow a study — it leaves it impossible to close.

Measured against the twelve `SignalReaderWorker` answers, after `csv-reader`, `dicom-reader`, `natus-reader` and `nic-reader` migrated:

| Package | Base | Hand-written cases | Missing |
|---|---|---|---|
| `edf-reader` | `ServiceWorkerSubstitute` | 10 | `release-signal-arrays`, `reset-network`, `set-buffer-range` |
| `wav-reader` | `ServiceWorkerSubstitute` | 5 | `release-cache`, `release-signal-arrays`, `request-signals`, `reset-network`, `set-buffer-range`, `set-interruptions`, `shutdown` |

`wav-reader` is the one to do first despite being the smaller package: it is missing `shutdown`, which is the handler whose absence produces the unclosable study, and it is one of the four packages with no test files, so nothing would report it. `edf-reader`'s three are narrower and none of them is `shutdown`.

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

Do it across the family in one go rather than per package, since the pattern spreads with every package that gains a suite (every workspace but `wav-reader` has tests today, measured 2026-10-03).

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

🟠 **Priority: amber** — reachable today for every format served by a substitute, and silent: nothing errors, the teardown simply does not happen.

`GenericService.shutdown` commissions `shutdown` and terminates its worker only `if (await response.promise)`, and the commission resolves with the reply's `success`. `ServiceWorkerSubstitute.postMessage` answers an action it does not implement with a failure, so a substitute that implements no `shutdown` case resolves it `false`: the worker is never terminated, the commissions and waiters are never cleared, `isWorkerSetup` stays true and `isReady` never changes. Whatever the substitute holds — a parsed document, a decoded recording — is held for the life of the page.

Measured 2026-10-02: of the fifteen substitutes in the family, two answer the action. `pdf-reader`'s was added in its audit; `edf-reader`'s was already there and has a defect of its own, which is the second half of this item. It calls `super.shutdown()` before `returnSuccess`, and the base method clears the listener list and `onmessage` both, so the reply it then sends reaches nobody and the service's `shutdown()` promise never settles at all. Demonstrated directly against core's base class: a reply sent after `shutdown()` is received by no listener. The order is the whole fix — answer, then clear.

**A commission in flight when a service shuts down never settles**, which is the same teardown area and the same silence. `shutdown` clears `_commissions` once the worker has answered, and clearing the map drops each entry's resolve and reject closures without calling either, so a call awaiting a reply at that moment waits for the life of the page. Core has the machinery already — `_rejectAllCommissions` is what the worker-error paths use — and the shutdown path should do the same before it clears. Found while auditing `pyodide-service`, where it is the one remaining way a caller of that service can wait forever, and it belongs to every service equally.

The right place for the rest is core rather than thirteen packages: the base class already special-cases `update-settings` for exactly this reason, noting that the substitutes implementing no case of their own would each answer it with a failure and a warning. `shutdown` wants the same treatment, with the base clearing its own listeners after replying, and a substitute holding a resource overriding it to release that first. Do it in core's own pass, and check the thirteen afterwards — a substitute that releases nothing needs no case once the base answers.

Nothing type-checks the builder's own setup directory
-----------------------------------------------------

🔵 **Priority: blue** — no symptom today; the files are small, and Vite resolves at build time what TypeScript never reads.

[setup/](setup/) is the builder's own source — the registrars, the worker factories, the edition entry — and no type-check program includes it. [scripts/typecheck.mjs](scripts/typecheck.mjs) walks the cloned packages; the interface's `tsconfig.json` includes `./src/**/*` only, and nothing under its `src/` imports `#workspace/setup/`; [vite.config.lib.ts](vite.config.lib.ts) takes [setup/index.ts](setup/index.ts) as a build entry, and a Vite build does not type-check. So the one directory this repository actually owns is the one nothing vets.

It surfaced while auditing `pdf-reader`, which carried an ambient `declare module '*?raw'` its own sources never used. Seven files under [setup/workers/](setup/workers/) import a worker bundle with `?raw`, so the declaration looked load-bearing for them — and is not, because those files are never in a program that would need it.

No installed package would supply one either. `pyodide-service` was recorded here as the one that still published such a declaration, and it never has: the file holding it is not copied into `dist`, which `npm pack` confirms. So a type-check of [setup/](setup/) would have to declare the suffixes itself — `vite/client` in the program's own `types` — rather than inherit them from whatever a dependency happens to publish, which is the better arrangement in any case.

A `tsconfig.json` at the builder root including [setup/](setup/) and [profiles/](profiles/), with `vite/client` in `types` for the `?raw` and `?worker` suffixes, is the whole of it — plus a `typecheck:setup` script, so the gap cannot reopen quietly.

The declared core range is a major version behind in two packages
-----------------------------------------------------------------

🟠 **Priority: amber** — invisible in the workspace, and only the workspace is ever tested.

Core is at 2.0.0. Two of the eighteen dependent packages still ask for `@epicurrents/core: ^1.0.0`, in both `devDependencies` and `peerDependencies` — `tab-module` and `wav-reader`, which are also the two the sweep has left. The other sixteen name `^2.0.0`: the fourteen the sweep has opened, plus `onnx-service` and `onnx-models`, which it opened and split.

Nothing fails, because nothing resolves through the range. The workspace symlinks core from the checkout, so every build, type-check and test in this repository runs against 2.0.0 while the manifest asks for 1.

**Until a nested copy exists, at which point the range stops being invisible and starts breaking the workspace.** Observed 2026-10-02, when eight still named `^1.0.0`: all eight carried their own `node_modules/@epicurrents/core` at 1.0.3, and a build of the family failed in exactly those eight — `natus-reader`, `nic-reader` and `wav-reader` outright, on exports core 1.x does not have, and the other five in `build:types` on `Cannot find module '@epicurrents/core/types'`, a subpath 1.x does not export. The interface had one too, and its 1.0.3 against the checkout's 2.0.0 gave every resource type two identities, which is what a dozen `not assignable to` errors in unrelated Vue components turned out to be. Deleting the eight nested directories fixed all of it with the ranges left at `^1.0.0`, which is the proof that the range is not what any of it was about. So the order matters: a nested copy is the thing to look for first, and bumping a range in response to these symptoms treats a cause that is not operating.

What puts a copy there is a root `npm install`, which resolves each member's declared range from the registry rather than linking the sibling; it is worth avoiding in this workspace for that reason alone.

**The per-package lockfiles are the same problem one layer down, and they outrank the range.** Six packages commit a `package-lock.json`, and three still pin a core that predates 1.0 — `0.3.0-2` in `eeg-module` and `emg-module`, `0.2.0-1` in `onnx-service` — resolved from the registry rather than linked. `setup` installs each package with `npm i` against its own lockfile, so a fresh clone gets that version whatever the range says, and the packages whose audits corrected the range to `^2.0.0` have it undone by their own lock. `htm-reader`'s, `pdf-reader`'s and `pyodide-service`'s were regenerated during their passes and are the three that agree with their manifests; `onnx-service`'s was not, so its range and its lock disagree today.

Regenerating a lock has to happen outside the workspace to work at all: the packages are workspace members, so `npm install --package-lock-only` run inside one walks up to the root and leaves the package's own lock untouched, reporting success. Copying the manifest to a scratch directory and generating there is what produces a lock that describes the standalone install `setup` actually performs.

The other three packages that carry no lockfile at all — `acc-module`, `edf-reader` and the rest — are a separate question this does not settle: whether a package published to a registry and also built inside a workspace should commit one. Whichever way it goes, the six should agree. The range only becomes load-bearing for a consumer installing the packages from the registry, which is the one configuration never exercised here. That makes it the same shape as the version-compliance hazard in [AGENTS.md](AGENTS.md): a mismatch that type-checks locally and can only be observed by whoever installs the published artifact.

Fold the bump into each package as the sweep opens it, rather than as an eighteen-package commit, so the range moves together with the code that was actually verified against the new core. What the sweep must not do is bump a range to a core version that is not yet published — core holds its release until the sweep finishes, so a package published in the meantime would name a version the registry does not have.

The target is `^2.1.0` for any package that touches any of it, not `^2.0.0`. Core's next release is a minor because repairing the settings relay added `AppSettings.applySnapshot`, and because closing the worker-substitute vocabulary gap added `SignalReaderWorkerSubstitute` together with the three members on `BaseWorker` that made it possible — `_validate`, `_postMessage` and `_close`. All of it is published surface, and `^2.0.0` admits a core with none of it: 2.0.0 went to the registry on 2026-09-20 at 07:32Z and that commit landed thirteen hours later the same day, which unpacking the published tarball confirms — its `dist/workers/base.worker.d.ts` declares none of the three.

Every package bumped so far names `^2.0.0`, and seven of them use that surface and need revisiting at release. `api-reader` calls the settings method; `csv-reader`, `dicom-reader`, `natus-reader` and `nic-reader` extend the substitute class; `onnx-service` does both and validates through the base class; and `pyodide-service` validates through the base class in its worker layer. For those seven the range is not merely untidy but wrong, and it stays wrong until there is a 2.1.0 to name. The test suites widen it further: a loopback that drives the real worker class on the test thread overrides `_postMessage` and `_close`, so a package testing that way does not compile against the published core either, whatever its source does. `acc-module`, `doc-module`, `edf-reader`, `eeg-module`, `emg-module`, `htm-reader`, `ncs-module`, `onnx-models` and `pdf-reader` use none of it, so `^2.0.0` states what they were verified against: `edf-reader`'s substitute extends `ServiceWorkerSubstitute` directly and its worker applies the settings snapshot with `Object.assign` rather than through the new method, `eeg-module` has no worker of its own and snapshots the app settings into its own `setup-worker` commission, `onnx-models` reaches neither surface in its own code — its worker extends one from `@epicurrents/onnx-service`, so whatever core version that package needs is carried by the range it declares rather than by this one — and `pdf-reader`'s substitute extends `ServiceWorkerSubstitute` directly and lets the base class answer the settings snapshot, so it calls the new method nowhere — it validates through a wrapper of its own, over the utility the published core does export, which is what keeps it out of the list above.


Two packages have a lint script that cannot run
-----------------------------------------------

🟠 **Priority: amber** — the failure reads as a configuration problem rather than a missing or absent file, so it survives being looked at.

Sixteen of the eighteen dependent packages carry a flat `eslint.config.mjs` that ESLint 9 loads. The remaining two — `tab-module` and `wav-reader` — have a `lint` script and an `.eslintrc.cjs`, the ESLint 8 format, which ESLint 9 will not read. It exits pointing at the flat-config migration guide, which for these two is the correct advice.

`nic-reader` was the one package with no configuration file at all, and it failed in a third way worth recording because the message names nothing relevant. It pinned ESLint 8, under which `eslint src` lints `.js` by default, so the run exited 2 with *"No files matching the pattern src were found. Please check for typing mistakes in the pattern."* — a complaint about the argument, from a tool that had found no config and would not have read one. A package reporting that is not misconfigured in its script; it has never linted a line.

`emg-module` and `ncs-module` each had the configuration under a leading dot, where ESLint never looks for it, and the fix was the rename plus the two `@stylistic` plugins the family rule set references; `htm-reader` was one of the eslintrc five and needed the same plugins plus `typescript-eslint` and `@eslint/js`. `natus-reader` had neither a configuration nor the `eslint` dependency its `lint` script called, and needed the config plus five devDependencies; `nic-reader` had no configuration and a pinned ESLint 8 whose packages shadowed the hoisted 9, so the stale `eslint`, `@eslint` and `@typescript-eslint` directories under its own `node_modules` had to go before the config could be read. `onnx-service` was the two failures at once — an `.eslintrc.cjs` ESLint 9 will not read *and* a local ESLint 8 shadowing the hoisted 9 — so moving the stale directories aside was what made the exit code change at all, from a complaint about the pattern to a report of findings. `pdf-reader` is the fourth shape, and the one that looks healthiest from outside: a flat config ESLint 9 loads, carrying a single hand-written `quotes` rule above the recommended set it then spread, so the run reported eight errors of which five were template literals the family rule set allows as house style. A package whose lint exits non-zero on its own convention is one nobody runs, and the two findings underneath — an empty interface and two `async` methods with no `await` — were what the noise was hiding. `pyodide-service` is the fifth, and the one most likely to be mistaken for healthy: an `.eslintrc.cjs` *and* a local ESLint 8 that could read it, so `npm run lint` ran, reported twelve problems and exited 1 — a working lint by every outward sign, measured against a configuration whose only two rules turn the unused-variable checks off. Under the family set the same sources reported 87, and most of them had one cause: the Python interpreter was reached through `(self as any).pyodide` at every site, which switches type checking off for everything the bridge returns. Expect the first successful run in a package to report in the tens or hundreds, because the rule set is core's and nothing has ever been linted against it; budget the triage separately from the rename. The spread so far is wide and worth knowing before planning one: `natus-reader` reported ten, `nic-reader` thirteen, `onnx-service` fourteen, `ncs-module` twenty-two and `pyodide-service` eighty-seven, where core reports 613. Size predicts it better than age does, and an untyped escape hatch repeated across a file predicts it better still.

What makes this a family-level item rather than five package-level ones is that `npm run lint --workspaces` cannot distinguish a package with no findings from one whose configuration was never read. Both are silent, and the silence is the same.


Package manifests carry leftovers from the webpack era
------------------------------------------------------

🔵 **Priority: blue** — no symptom; the value is that the next reader is not misled.

Thirteen packages committed a `.env.example`, and three still do: `core`, `tab-module` and `wav-reader`, each declaring `ASSET_PATH=` and `ROOT_PATH=`. Those names appear nowhere else in the repository — no build config, no script and no source reads either, and the Vite migration removed whatever did. `pdf-reader`'s declared `MODULE_PATH` instead, with an absolute Windows path as the example value, and that name was read in no file either.

A committed example file is an instruction: it tells a new contributor these variables have to be set, and none of them do. The ten that have gone — `api-reader`, `doc-module`, `edf-reader`, `eeg-module`, `emg-module`, `htm-reader`, `ncs-module`, `onnx-service`, `pdf-reader` and `pyodide-service` — went with their audits; `ncs-module` was the one still carrying a `dotenv` devDependency for them, and that went with it. The remaining three should go the same way.

A smaller one of the same kind: every package's `vitest.config.ts` starts straight at its import, with no module docstring and none of the `@package` / `@copyright` / `@license` header that [AGENTS.md](AGENTS.md) asks of every TypeScript file. Measured 2026-10-02 across all eighteen, it is uniform, and the sibling `.mjs` build configs all carry one — so either the rule means package source rather than build configuration, or eighteen files are missing a header. Worth settling in one pass rather than in whichever package is open; changing one of the eighteen makes it the odd one out.

A stray directory worth knowing about before counting anything under `epicurrents/`: there is an `epicurrents/interface/` holding four type files and no manifest, while the real interface is the sibling `interface/` that the workspace and the registry both point at. Nothing references the stray copy, and being inside a git-ignored directory it is tracked by nothing, so it costs only confusion — but two of its four files are named in this document's own account of where the `__EPICURRENTS__` declarations live, so a grep looking for them finds a copy that is not the one being described.

The related manifest question is `"type"`. Every package emits ESM into `dist/` and declares an `exports` map whose `import` condition points at a `.js` file, but exactly one — `natus-reader` — declares `"type": "module"`. The rest depend on Node's module-syntax detection to read those files as ESM, which works from Node 22 onward and is a fallback rather than a declaration. Bundler consumers never reach the question. Declaring it makes the family consistent and the intent explicit; doing it needs a check that nothing in a package's own tooling relies on a `.js` file being CommonJS.
