Epicurrents monorepo workspace
==============================

This repository contains the Epicurrents application and helper scripts used to assemble a development
workspace from the individual Epicurrents packages. The core orchestration is implemented in
`scripts/util.mjs` — edit that file to select which packages are cloned, built, and prepared for local
development.

Contents
 - `scripts/util.mjs` — dependency map and helper utilities (copy/delete, worker paths).
 - `scripts/setup.mjs` — clones and initializes packages listed in `util.mjs`.
 - `scripts/build.mjs` — builds already-cloned dependency packages.

Quick overview
--------------

- To prepare a local development workspace, edit `scripts/util.mjs` to select which packages you want
	to clone and build.
- Use `npm run setup` to clone and initialize the chosen packages.
- Use `npm run build:assets` or `npm run build:dev` to build dependent packages and assemble assets.
- Use `npm run build:app` to build the standalone interface app or `npm run build:lib` to build the
	interface as a consumable library.

Modifying `scripts/util.mjs`
---------------------------

Open `scripts/util.mjs`. The important exported values are:

- `dependencies` (Map): the package list organized by logical groups (e.g. `epicurrents`, `interface`).
	Each map entry contains information used by `scripts/setup.mjs` and `scripts/build.mjs`:

	- `packages`: array of package descriptors. Each descriptor may include:
		- `name` (string): package folder / package name to clone.
		- `branch` (string, optional): git branch to check out after cloning.
		- `prebuild` (string[], optional): shell commands run before building the package.
		- `rename` (boolean, optional): whether to rename the cloned folder to the map key.
		- `external` (boolean, optional): if true, the script will not attempt to build/install the package.
	- `repository` (string): base repository URL used for cloning.

- `workerPaths` (array): worker/UMD copy source paths used by `copy` utilities — adjust if you add new
	packages that ship UMD worker artifacts.
- `interfaceDir` (string): name of the `interface` package folder.
- `rootDir` (string): computed repository root used by the scripts.

Examples
--------

1) Add a package to the `epicurrents` group

In `scripts/util.mjs` locate the `epicurrents` packages array and add an entry:

```js
{ name: 'foo-module' },
```

After saving, run the setup for just that package:

```bash
npm run setup -- epicurrents/foo-module
```

The script will clone `https://github.com/epicurrents/foo-module` into `epicurrents/foo-module`, install
its dependencies and run `npm run build` inside it.

2) Add a `prebuild` command (example: copy PDF.js to reader)

In the `pdf-reader` descriptor you may add a `prebuild` step:

```js
{ name: 'pdf-reader', prebuild: [ 'cp -r node_modules/pdfjs-dist node_modules/@epicurrents/pdf-reader/node_modules/pdfjs-dist' ] }
```

The `prebuild` commands are executed inside the package folder before running its build.

3) Mark a package as external

If a package must be managed manually (e.g. large third-party repo), set `external: true`. The scripts
will skip automatic installation and build for that package and print an informational message.

Common workflows and npm commands
---------------------------------

- Prepare and clone selected packages (clones everything by default):

```bash
npm run setup
```

To scope the setup to a specific group or package, pass arguments after `--`:

```bash
npm run setup -- epicurrents
npm run setup -- epicurrents/edf-reader
npm run setup -- util
```

- Install already-cloned dependencies (run inside workspace root):

```bash
npm run instl
```

- Build dependency assets (uses `scripts/build.mjs`):

```bash
npm run build:assets
```

- Build the standalone interface application into the `interface` build directory (uses `interface/vite.config.app.ts`):

```bash
npm run build:app
```

- Build the interface as a library into the `interface` build directory (for consumption by other packages):

```bash
npm run build:lib
```

- Build a full development stack into the `interface` build directory (assets, optional OHIF viewer, copy assets, build app):

```bash
npm run build:dev
```

- Run the dev server for local development (copies workers then launches interface dev server):

```bash
npm run start
```

- Copy worker UMD assets to `public/`:

```bash
npm run copy:workers
```

Notes and tips
--------------

- The `scripts/setup.mjs` script will remove bundled local copies of utility packages (`@epicurrents/core`, `asymmetric-io-mutex`, `scoped-event-bus`, `scoped-event-log`) from each package before building to ensure a consistent shared version is used across the workspace.
- If you change `workerPaths` in `scripts/util.mjs`, ensure any referenced `umd` folders exist in the installed packages (generated during build) so the copy commands succeed.
- For local Pyodide testing, make sure the interface `SETUP.pyodideAssetPath` (see `interface/src/setups/standalone.ts`) points to a hosted static path (serving WASM over `file://` will not work).

Example developer flow
----------------------

1. Edit `scripts/util.mjs` to include the packages you need.
2. Run:

```bash
npm run setup
npm run build:assets
npm run copy:workers
npm run build:app
```

3. Serve or deploy the contents of the `interface/build` (or `public`) folder as needed.
