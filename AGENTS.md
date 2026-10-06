# Epicurrents builder — instructions and architecture notes for AI coding assistants

This repository is the **builder**. It does not contain signal-processing or UI code: it decides *which* independently-versioned `@epicurrents/*` packages are combined into an *edition*, and *how* that edition is assembled into a release. Every package lives in its own repository, is cloned into a git-ignored subdirectory by the setup script, and carries its own `AGENTS.md` with its internals.

Read [README.md](README.md) first for the user-facing workflow. This file covers the conventions and design a change to the builder has to respect.

## Getting started

```bash
git clone https://github.com/epicurrents/builder.git && cd builder
npm run setup                          # clone + build every public package
npm run build:edition -- --profile eeg # build the EEG edition → dist/eeg/
```

`build:edition` produces a trimmed, embeddable **lib** (`epicurrents-lib.*`) under `dist/<edition>/`, alongside an `index.html` that makes the same directory servable as a standalone viewer. Workers are carried inside the lib as inlined bundles, so there is no `workers/` directory to deploy beside it.

## Where the package internals are documented

Do not document a package's internals here — that is what made this file unmaintainable. Each package repository carries its own notes:

| Package | Covers |
|---|---|
| `epicurrents/core/AGENTS.md` | Runtime state, assets, the biosignal signal path, the SAB cache lifecycle, worker commissions, the event bus contract, trend architecture |
| `epicurrents/edf-reader/AGENTS.md` | The reader pattern every `*-reader` package follows |
| `epicurrents/eeg-module/AGENTS.md` | The study-module pattern every `*-module` package follows |
| `epicurrents/pyodide-service/AGENTS.md` | The service pattern every `*-service` package follows |
| `interface/AGENTS.md` | The Vue 3 application: store, plugin, settings, rendering, module system |

Those directories are git-ignored here and only exist after `npm run setup`. A change that spans the builder and a package needs a commit in each repository.

---

## Version compliance — HIGH PRIORITY

All packages under `epicurrents/` share a single toolchain. Version drift between packages is a documented cause of **silent runtime corruption**: the worker bundle and main-thread code can disagree on data layouts or API shapes while every type-check passes locally.

**Canonical versions:**

| Tool | Version |
|---|---|
| TypeScript | `^5.7.0` |
| Vite | `^7.3.1` |
| tsconfig base | `epicurrents/core/tsconfig.base.json` (core extends it locally; siblings extend `@epicurrents/core/tsconfig.base.json` so it resolves standalone too) |

Every package builds with Vite and emits its declarations with `epicurrents-build-types`, the tool core publishes as a bin.

**Rules:**

1. **Never pin a package-specific TypeScript version** that differs from the table. A single divergent package produces structurally incompatible `.d.ts` files that type-check but corrupt data at runtime.
2. **Never override `tsconfig.base.json` options per-package** without a comment explaining why.
3. **After any toolchain bump or shared-code change**, run the sweep:
   ```bash
   npm run typecheck                   # every present util/* and epicurrents/* package
   npm run typecheck epicurrents/core  # scope to one package
   ```
   `scripts/typecheck.mjs` runs `tsc --noEmit` per package, prints ✓/✗, and exits non-zero if any failed. All packages type-check clean, so any error is a regression.
4. **Both build outputs must be regenerated together** after a change to shared code. A package with a worker builds two artifacts — the standalone bundle in `umd/` and the `dist/` output carrying the same worker inlined — and rebuilding one leaves a stale mismatch that the type system cannot see. `npm run build` in the package does both.

### Duplicate nested copies

Every package declares `@epicurrents/core` and the shared utilities as dependencies, so installing a package on its own puts a private copy inside its `node_modules`. Left in place, a worker and the main thread can be built against different versions of the same shared code. `npm run clean` deletes those nested copies; `setup` performs the same deletions per package as it goes.

If a package suddenly reports `TS2339` for methods that exist on a core base class, the cause is almost always a stale nested `@epicurrents/core` shadowing the workspace symlink — run `node scripts/clean.mjs`.

**A root `npm install` recreates them, so treat one as a step that has to be followed by a clean.** Installing at the root is not neutral: a package whose declared range does not admit the version checked out in the workspace gets a registry copy installed inside its own `node_modules`. The committed lock records that copy as an entry resolving to the registry rather than a link, so a lock diff naming one is the signal that a range has gone stale. While any package still declares a range the workspace cannot satisfy, a plain `npm install` is enough to break the workspace.

**The range that does this is any workspace dependency's, not only core's.** Releasing a util package is the case to watch, because one bump makes every consumer's range stale at once, and for a package below 1.0 it does so on a *minor*: `^0.3.0` means `>=0.3.0 <0.4.0`, so publishing `0.4.0` leaves every `^0.3.0` consumer unsatisfiable and the next install nests a registry copy of the old version in each. The fix is the same clean, but the range has to be corrected first or the copies come straight back.

The symptom is not the `TS2339` above but `TS2307`, and it names the copy it found: *Cannot find module `@epicurrents/core/types` … There are types at `epicurrents/<pkg>/node_modules/@epicurrents/core/dist/types/index.d.ts`, but this result could not be resolved under your current `moduleResolution` setting.* A `moduleResolution` suggestion in a package that has never had a resolution problem is the tell; the fix is the clean, not the setting.

**`npm run clean` honours the public/non-public split, so on a maintainer's full tree it is not enough on its own.** With no scope it cleans only the packages a default setup would install, leaving the nested copies of every `public: false` package in place and the typecheck still failing for them. Pass `--include-private` to reach those, and check that none is left — for the utilities as well as core, and under [interface/](interface/) as well as the packages. A `ls` over a brace expansion is the wrong tool here: zsh aborts the whole command on the first pattern that matches nothing, which is the usual case, so it reports a glob failure rather than a clean tree. `find` prints nothing and exits zero instead, and `-type d` passes over the root symlinks, which are what the packages are supposed to resolve through:

```sh
find epicurrents interface -type d \
    \( -path "*/node_modules/@epicurrents" \
    -o -path "*/node_modules/scoped-event-*" \
    -o -path "*/node_modules/asymmetric-io-mutex" \)
```

### A floor that admits too much

The range above is the case where a declared range admits too little. The mirror of it is a range that admits the on-disk version and is still wrong, and it is the one a release leaves behind rather than the one a release creates.

A caret on a 1.x or later admits every later minor, so `^2.0.0` keeps resolving once core reaches 2.1.0 and nothing in the workspace reacts: no nested copy, no stale range, a green typecheck. It equally admits core 2.0.0, which is what a consumer installing the package from the registry is free to get. Where the package imports something core gained in 2.1.0, that consumer builds against a core without it — `TS2305` against the published declarations, or `undefined` for a value import at runtime — and no version complaint anywhere, because the range was satisfied.

So a floor is set by the API a package uses, not by the newest release. After a core release the question per package is whether anything it imports postdates the floor it declares, which is answered by resolving its imports against core's barrels **at the floor's own commit** rather than against the working tree — a name present in the checkout says nothing, since the checkout is ahead of the floor by construction. Only the packages that fail move; a package whose imports all predate its floor declares it truthfully, and raising it anyway asserts a dependency it does not have.

Raise the floor after the release is on the registry, never before. A floor naming a version that does not exist yet is unsatisfiable, which is the nested-copy trap above, so the two mistakes sit one on each side of the publish.

---

## Code comment conventions

Comments and docstrings describe the code's **current contract** — what it does and the invariants it upholds, for a reader who has never seen an earlier version.

- **No change history or anecdotes.** Don't narrate what the code used to do, what a change replaced, or why it was added ("previously…", "now dispatches…", "added for…"). That belongs in the commit message, where `git blame` surfaces it; in the file it rots as soon as the change lands. State the invariant, and where a non-obvious constraint exists, say what breaks if it is violated.
- **Describe the layer's own contract, not its consumers.** Don't name a specific downstream caller — state the guarantee the layer makes, so it holds regardless of who calls it.
- **Keep the `@package` / `@copyright` / `@license` header** on every package source file.
- **Wrap TypeScript source at a 120-column soft cap** — code, docstrings and comments alike. The one exception: `@param` docstrings stay on a single line regardless of length, because wrapping them renders poorly in the VS Code hover. Do **not** hard-wrap Markdown prose: one line per paragraph, since docs are read as rendered output at varying widths.

---

## Repository layout

```
builder/
  scripts/            build / install / clone / copy / update / profile / manifest helpers
  setup/              config-driven consumer setup — the edition build entry
    index.ts          creates the app and runs the active edition's registrars
    registry.ts       modality key → registrar
    modules/          one registrar per modality
    workers/          one worker-factory module per package that does not resolve its own workers
  profiles/           edition definitions; profiles/local/ is git-ignored
  vite.config.lib.ts  per-edition library build, including registry trimming
  .github/workflows/  the release workflow
  epicurrents/        cloned @epicurrents/* packages (git-ignored)
  interface/          cloned Vue 3 interface application (git-ignored)
  util/               cloned standalone utility packages (git-ignored)
  ohif/               cloned OHIF radiology viewer integration (git-ignored)
```

---

## Editions

An **edition** is a named package subset plus the viewer setup it ships with. Three pieces define one:

1. **The registry** (`scripts/env.mjs`) — every package the builder knows about, its repository, branch, and whether it is public.
2. **A profile** (`profiles/<name>.mjs`) — which of those packages the edition includes, and its `setup` config.
3. **The registrars** (`setup/`) — what actually gets registered on the application at runtime.

`profiles/README.md` documents the profile format; `scripts/README.md` documents the registry fields.

### The public / non-public split

Some packages are not published. The rule that keeps public editions buildable by anyone rests on the `public` flag in `scripts/env.mjs`:

- A profile in `profiles/` may name only public packages — `loadProfile` throws otherwise.
- A profile that needs a non-public package lives in the git-ignored `profiles/local/`.
- The default setup (no profile) skips non-public packages, so a fresh clone works without access to any private repository. `--include-private` opts back in for a maintainer's full tree.

**Keep the flags in step with the repositories' actual visibility.** The guard is only as good as its data: the release workflow's "only public editions are ever released" guarantee is enforced entirely by this flag, and a package wrongly marked public fails at `git clone` in CI rather than at the guard.

The same split applies one level down, to a **reader** added to a modality that already exists. A non-public reader may not be named in `setup/modules/<key>.ts`, because any public profile activating that modality then has to resolve an import for a package it does not install — the trimming that would have removed it runs too late, exactly as for the worker factories below. Nor may it be named in the interface's `setups/full.example.ts`, which every external developer builds. Its home is a git-ignored `*.local.ts` setup in the interface's `src/setups/`, which `setups/standalone.ts` launches in preference to the example; `registerAllModules` is exported so such a setup adds to the example's registrations rather than restating them. A reader that reaches a released edition is one that has been published first.

### Bundle trimming, and why registrar imports matter

`setup/registry.ts` statically imports every registrar so the un-trimmed file stays type-safe. When a profile names `activeModules`, the `epi-trim-registry` plugin in `vite.config.lib.ts` replaces that file's contents with a registry importing only the active registrars, and rollup drops the rest — along with their modules, readers and workers.

This is why **a registrar must import only what its own modality needs**, and why worker factories live in one module per package under `setup/workers/`. Rollup has to resolve a static import before it can tree-shake what the import provides, so a single shared module importing every reader's worker would make every edition depend on every reader package being installed — trimming cannot save it. That was a real failure: the EEG edition could not build without the CSV reader.

The corollary: **an empty `activeModules` means "every registrar"**, so it requires every package, including non-public ones. That is a maintainer-only build. Public profiles name their modules explicitly.

### Adding a modality

1. Add the package(s) to the registry in `scripts/env.mjs`, with `public: false` if the repository is not published.
2. Add `setup/workers/<pkg>.ts` for each package that ships a worker **and does not resolve it itself**, importing only that package. A migrated package (`@epicurrents/core` and `@epicurrents/natus-reader` today) inlines its own workers, and registering a factory for one of those ships the same bundle a second time. Such a package needs no `workerPaths` entry in `scripts/env.mjs` either, since there is no bundle to copy.
3. Add `setup/modules/<key>.ts` composing the core module, its study importers and the interface UI module.
4. Register the key in `setup/registry.ts`.
5. Add the package and the `activeModules` entry to whichever profiles should ship it — together. A package in a profile with no registrar is cloned and built but registers nothing.

---

## Command arguments

Every workspace script takes positional **scopes** (`epicurrents`, `epicurrents/core`) and named **options** (`--profile <name>`, `--manifest <file>`, `--include-private`). Both `--opt value` and `--opt=value` are accepted.

Parse them with `parseArgs` / `resolveSelection` (`scripts/util.mjs`, `scripts/profile.mjs`) rather than reading `process.argv` directly. Options that take a value consume the next argument, so a value is never mistaken for a scope — hand-rolled parsing is what once let `--profile <name>` match no package group and exit successfully, having done nothing.

`run()` in `scripts/util.mjs` wraps `execSync` so a failure names the command. Note that `execSync` takes **no callback**: an error handler passed as a third argument is never called, and the command throws instead.

---

## Releases

`scripts/manifest.mjs` records each package's exact commit for an edition into `dist/<edition>/manifest.json`, and `npm run setup -- --manifest <file>` checks those commits back out.

A manifest pins **sources, not the dependency graph**, so it is not reproducibility by itself. The root `package-lock.json` pins the rest, which is why it is committed, and a manifest records the builder's own commit because the lock that built an edition lives in that commit. A release build is reproducible byte for byte from those two together; a manifest reproduction on its own is not, since a selection wider than the manifest leaves every package it does not name at a branch head.

The lock binds only because setup clones every selected package before installing once, at the root. Its workspace entries are links into those checkouts and resolve only where the directories already exist, and an install run inside each package instead prunes the entries of packages not yet cloned and re-resolves them on arrival, leaving the lock pinning whatever the last install happened to need.

`--frozen-lockfile` installs with `npm ci` and the release workflow passes it. Two things follow. **The committed lock describes every public package and nothing else**, so regenerate it in a checkout holding exactly those — a clean clone and `npm run setup` — and never commit the rewrite that an install in a tree carrying private packages produces. And a release fails in `npm ci` once a public package changes its dependencies after the lock was written; that failure is the point of the flag, so answer it by regenerating the lock rather than by dropping the flag.

Tagging `<edition>-v<major>.<minor>.<patch>` on `main` triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds the edition and attaches it plus its manifest to a GitHub release. The workflow clones from public repositories with no credentials — it must never authenticate against a private one.

---

## Testing

The packages use **Vitest**, each with its own `vitest.config.ts` and `tests/` directory; `npm run test` runs every package's suite via workspaces. The builder itself has no tests yet — see [ROADMAP.md](ROADMAP.md).

When changing the scripts, the things worth verifying by hand are the ones that fail silently rather than loudly:

- `--profile <name>` and `--profile=<name>` both select the same packages, and an unknown scope is an error rather than an empty success.
- A public profile naming a non-public package throws at load.
- A trimmed edition really does exclude the packages it did not select — grep the built bundle for the worker factory names.
- An edition builds with the non-public packages absent (temporarily moving the `node_modules/@epicurrents/*` links aside is enough to prove it).
