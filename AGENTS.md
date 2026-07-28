# Epicurrents builder — instructions and architecture notes for AI coding assistants

This repository is the **builder**. It does not contain signal-processing or UI code: it decides *which* independently-versioned `@epicurrents/*` packages are combined into an *edition*, and *how* that edition is assembled into a release. Every package lives in its own repository, is cloned into a git-ignored subdirectory by the setup script, and carries its own `AGENTS.md` with its internals.

Read [README.md](README.md) first for the user-facing workflow. This file covers the conventions and design a change to the builder has to respect.

## Getting started

```bash
git clone https://github.com/epicurrents/builder.git && cd builder
npm run setup                          # clone + build every public package
npm run build:edition -- --profile eeg # build the EEG edition → dist/eeg/
```

`build:edition` produces a trimmed, embeddable **lib** (`epicurrents-lib.*`) plus a self-contained **standalone** folder (`index.html` + lib + workers) under `dist/<edition>/`.

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
| ts-loader | `^9.5.1` |
| webpack | `^5.73.0` |
| tsconfig base | `epicurrents/core/tsconfig.base.json` (core extends it locally; siblings extend `@epicurrents/core/tsconfig.base.json` so it resolves standalone too) |

**Rules:**

1. **Never pin a package-specific TypeScript version** that differs from the table. A single divergent package produces structurally incompatible `.d.ts` files that type-check but corrupt data at runtime.
2. **Never override `tsconfig.base.json` options per-package** without a comment explaining why.
3. **After any toolchain bump or shared-code change**, run the sweep:
   ```bash
   npm run typecheck                   # every present util/* and epicurrents/* package
   npm run typecheck epicurrents/core  # scope to one package
   ```
   `scripts/typecheck.mjs` runs `tsc --noEmit` per package, prints ✓/✗, and exits non-zero if any failed. All packages type-check clean, so any error is a regression.
4. **Both build outputs must be regenerated together** after a change to shared code. The UMD worker bundle and the TSC `dist/` output are separate artifacts; rebuilding only one leaves a stale mismatch that the type system cannot see.

### Duplicate nested copies

Every package declares `@epicurrents/core` and the shared utilities as dependencies, so installing a package on its own puts a private copy inside its `node_modules`. Left in place, a worker and the main thread can be built against different versions of the same shared code. `npm run clean` deletes those nested copies; `setup` performs the same deletions per package as it goes.

If a package suddenly reports `TS2339` for methods that exist on a core base class, the cause is almost always a stale nested `@epicurrents/core` shadowing the workspace symlink — run `node scripts/clean.mjs`.

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
    workers/          one worker-factory module per package that ships workers
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

### Bundle trimming, and why registrar imports matter

`setup/registry.ts` statically imports every registrar so the un-trimmed file stays type-safe. When a profile names `activeModules`, the `epi-trim-registry` plugin in `vite.config.lib.ts` replaces that file's contents with a registry importing only the active registrars, and rollup drops the rest — along with their modules, readers and workers.

This is why **a registrar must import only what its own modality needs**, and why worker factories live in one module per package under `setup/workers/`. Rollup has to resolve a static import before it can tree-shake what the import provides, so a single shared module importing every reader's worker would make every edition depend on every reader package being installed — trimming cannot save it. That was a real failure: the EEG edition could not build without the CSV reader.

The corollary: **an empty `activeModules` means "every registrar"**, so it requires every package, including non-public ones. That is a maintainer-only build. Public profiles name their modules explicitly.

### Adding a modality

1. Add the package(s) to the registry in `scripts/env.mjs`, with `public: false` if the repository is not published.
2. Add `setup/workers/<pkg>.ts` for each package that ships a worker, importing only that package.
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

This pins **sources, not the whole dependency graph**: setup installs each package with `npm i` against its own lockfile, so third-party resolution is pinned only as far as those lockfiles pin it. Don't describe it as byte-for-byte reproducible.

The builder's own root `package-lock.json` is git-ignored deliberately. The workspaces are cloned rather than committed, so a root lockfile can never describe a checkout anyone else has: `npm ci` cannot resolve its `link: true` entries, and a profile-scoped setup clones a different subset each time.

Tagging `<edition>-v<major>.<minor>.<patch>` on `main` triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds the edition and attaches it plus its manifest to a GitHub release. The workflow clones from public repositories with no credentials — it must never authenticate against a private one.

---

## Testing

The packages use **Vitest**, each with its own `vitest.config.ts` and `tests/` directory; `npm run test` runs every package's suite via workspaces. The builder itself has no tests yet — see [ROADMAP.md](ROADMAP.md).

When changing the scripts, the things worth verifying by hand are the ones that fail silently rather than loudly:

- `--profile <name>` and `--profile=<name>` both select the same packages, and an unknown scope is an error rather than an empty success.
- A public profile naming a non-public package throws at load.
- A trimmed edition really does exclude the packages it did not select — grep the built bundle for the worker factory names.
- An edition builds with the non-public packages absent (temporarily moving the `node_modules/@epicurrents/*` links aside is enough to prove it).
