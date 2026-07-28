# Scripts

The builder's Node.js tooling: it clones the `@epicurrents/*` packages from their repositories, builds them in dependency order, and assembles a chosen edition. The user-facing command reference is in the [root README](../README.md); this file covers per-script detail and the configuration they share.

## Configuration — `env.mjs`

`env.mjs` holds the package registry and the paths everything else derives from. The registry is a `Map` whose key is both a logical group and the directory that group is cloned into:

```javascript
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
            { name: 'core' },                    // must be first — everything depends on it
            { name: 'eeg-module' },
            { name: 'edf-reader' },
            // ...
        ],
        repository: 'https://github.com/epicurrents',
    }],
])
```

A group either carries a `packages` array (each entry a package descriptor) or is a single package itself. `repository` may be set per group and overridden per package.

### Package descriptor fields

| Field | Type | Meaning |
|---|---|---|
| `name` | string (required) | Folder / package name to clone. |
| `branch` | string | Git branch to check out. Defaults to `main`. |
| `repository` | string | Override the group's base repository URL for this package. |
| `prebuild` | string[] | Commands run inside the package folder before building it. |
| `rename` | boolean | Rename the cloned folder to the map key, for when the repository name differs. |
| `external` | boolean | Not part of the workspace — cloned into the repository root, with install and build left to you (OHIF, which uses yarn). |
| `public` | boolean | Whether the package is published from a public source. Defaults to true. |

**The `public` flag is load-bearing.** A public profile may not name a `public: false` package, and the default setup skips them so a fresh clone builds without access to any private repository. Keep it in step with the repositories' actual visibility — the public/local profile split and the release workflow's "only public editions" guarantee both rest on it.

Ordering matters. `util` is built before `epicurrents`, and within `epicurrents`, `core` must come first.

`env.mjs` also exports `rootDir`, `interfaceDir` and `workerPaths` (the compiled `umd/` worker directories `copy.mjs` gathers into the interface).

## Arguments

Every workspace script takes the same two kinds of argument, parsed by `parseArgs` in `util.mjs`:

- **Positional scopes** — a group (`epicurrents`) or a single package (`epicurrents/core`).
- **Named options** — `--profile <name>` or `--profile=<name>`, `--manifest <file>`, `--include-private`.

Both forms of an option are accepted. Options that take a value consume the next argument, so the value is never mistaken for a scope — parsing this by hand is what once made `--profile <name>` select nothing and exit successfully.

`profile.mjs`'s `resolveSelection()` turns those arguments into the active profile, the scopes and a package filter, so every script selects packages the same way.

## The scripts

| Script | What it does |
|---|---|
| `setup.mjs` | Clone (or fetch) each selected package, check out its branch or a manifest's pinned commit, install it, strip duplicated shared packages, build it, then link everything into the workspace. |
| `install.mjs` | `npm i` in each already-cloned package. |
| `clean.mjs` | Remove duplicated shared packages nested inside each package's `node_modules`. |
| `build.mjs` | Build already-cloned packages from source. |
| `update.mjs` | `git pull` each package and re-check out its pinned branch. |
| `edition.mjs` | Build an edition end to end: the lib bundle, the standalone `index.html`, and with `--release` the manifest. Resolves the profile once and passes it to each step. |
| `standalone.mjs` | Write the standalone `index.html` into an edition's lib output. Normally invoked by `edition.mjs`. |
| `manifest.mjs` | Record every package's exact commit for an edition into `dist/<edition>/manifest.json`. |
| `profile.mjs` | Load and validate a profile, and resolve arguments into a package selection. Enforces the public/non-public rule. |
| `typecheck.mjs` | `tsc --noEmit` over every present `util/*` and `epicurrents/*` package, with a ✓/✗ summary. |
| `copy.mjs` | Copy compiled worker bundles and OHIF assets into the interface. Also does explicit `--from`/`--to` copies for `prebuild` steps. |
| `convert.mjs` | Convert assets for production use. |
| `env.mjs` | The package registry and shared paths. |
| `util.mjs` | Filesystem helpers, argument parsing, and the `run()` command wrapper. |

`run()` exists because `execSync` takes no callback: a trailing error handler passed to it is never called, and a failing command throws instead. `run()` turns that throw into a message naming the command, which callers annotate with what they were attempting.

## Notes

- **Cleaning matters.** Each package installs its own copy of `@epicurrents/core` and the shared utilities. Left in place, the worker bundle and the main thread can be built against different versions of the same shared code — which type-checks and then corrupts data at runtime. See [Why cleaning matters](../README.md#why-cleaning-matters).
- **Setup cleans as it goes.** It performs the same deletions as `clean.mjs` per package, between installing and building. Run `clean` separately after installing or removing packages inside a checkout later.
- If you change `workerPaths`, make sure the referenced `umd/` folders exist in the built packages so the copy step succeeds.
