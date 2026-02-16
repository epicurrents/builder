# Scripts

This folder contains utilities for setting up and managing a local development environment with the latest versions of Epicurrents packages from their GitHub repositories.

## Purpose

The scripts in this folder enable you to:

- **Setup** (`setup.mjs`): Clone packages from GitHub repositories into your local workspace
- **Install** (`install.mjs`): Install NPM dependencies for all packages
- **Clean** (`clean.mjs`): Remove duplicate dependencies to ensure version consistency
- **Build** (`build.mjs`): Build all packages from source
- **Update** (`update.mjs`): Pull the latest changes from GitHub for existing packages

Additionally:
- **Copy** (`copy.mjs`): Copy built assets to the interface public directory
- **Convert** (`convert.mjs`): Convert assets for production use

## Configuration

### The `dependencies` Map

The packages to set up are defined in [util.mjs](util.mjs) as a `Map` structure. Each entry represents a group of related packages:

```javascript
export const dependencies = new Map([
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
            { name: 'core' },
            { name: 'doc-module' },
            { name: 'edf-reader', branch: 'encoder' },
            // ... more packages
        ],
        repository: 'https://github.com/epicurrents',
    }],
    // ... more groups
])
```

### Package Configuration Options

Each package entry can have the following properties:

- **`name`** (required): Name of the package/folder
- **`branch`**: Git branch to check out (defaults to 'main')
- **`repository`**: Custom repository URL (overrides the group default)
- **`prebuild`**: Array of commands to run before building the package
- **`rename`**: Boolean flag to rename the cloned folder to match the `name` property
- **`external`**: Boolean flag marking packages that require manual installation/building

### Customizing the Package List

To adjust which packages are set up:

1. Open [util.mjs](util.mjs)
2. Locate the `dependencies` Map (around line 75)
3. Add, remove, or modify package entries as needed
4. For packages on a specific branch, add the `branch` property
5. For packages from a different repository, add the full `repository` URL

**Example**: Adding a new package to the epicurrents group:

```javascript
['epicurrents', {
    packages: [
        { name: 'core' },
        { name: 'my-new-module' },  // Add your package here
        { name: 'special-reader', branch: 'develop' },  // On a specific branch
    ],
    repository: 'https://github.com/epicurrents',
}],
```

## Running the Scripts

All scripts are executed via npm commands defined in the root [package.json](../package.json):

### Full Setup Workflow

For a complete setup of a fresh development environment, run these commands in order:

```bash
npm run setup    # Clone packages from GitHub
npm run instl    # Install dependencies
npm run clean    # Clean duplicate dependencies
npm run build:assets  # Build all packages
```

### Individual Commands

#### Setup (Clone Repositories)
```bash
npm run setup [scope]
```
Clones packages from their Git repositories. Optionally specify a scope (e.g., `util`, `epicurrents`, `interface`) to set up only that group.

#### Install Dependencies
```bash
npm run instl [scope]
```
Installs NPM packages for all dependencies. Optionally specify a scope to install only that group's packages.

#### Clean Dependencies
```bash
npm run clean [scope]
```
Removes duplicate `@epicurrents` packages and event bus/log packages from submodules to ensure version consistency across the application. This should be run after any NPM install operations.

#### Build from Source
```bash
npm run build:assets [scope]
```
Builds all packages from source. Optionally specify a scope to build only that group's packages.

#### Update from Repository
```bash
npm run update [scope]
```
Pulls the latest changes from GitHub for existing packages. Optionally specify a scope to update only that group.

## Important Notes

- **Order matters**: For initial setup, always run in the order: `setup` → `instl` → `clean` → `build:assets`
- **Cleaning is critical**: Run `npm run clean` after installing new dependencies to prevent version conflicts
- **Utilities first**: The `util` packages must be set up before `epicurrents` packages
- **Core first**: Within the `epicurrents` group, the `core` package must be built before other modules
- **External packages**: Packages marked with `external: true` (like OHIF) require manual setup

## File Descriptions

- **`util.mjs`**: Shared utilities and the `dependencies` configuration Map
- **`setup.mjs`**: Clones packages from Git repositories
- **`install.mjs`**: Installs NPM dependencies
- **`clean.mjs`**: Removes duplicate dependencies
- **`build.mjs`**: Builds packages from source
- **`update.mjs`**: Updates packages from their Git remotes
- **`copy.mjs`**: Copies built assets to the interface
- **`convert.mjs`**: Converts assets for production
- **`index.mjs`**: Exports utility functions for programmatic use
