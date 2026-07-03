/**
 * Type-check the workspace TypeScript library packages with `tsc --noEmit` and print a ✓/✗
 * summary.
 *
 * Catches cross-package type regressions after a change to a shared package — core in
 * particular, where a divergent emitted `.d.ts` can type-check locally while breaking a
 * dependent. Exits non-zero if any package fails, so it can gate CI or a pre-commit hook.
 *
 * Covers `util/*` and `epicurrents/*`. The `epicurrents/*` packages all depend on
 * `@epicurrents/core`; the `util/*` packages are external, standalone utilities that core
 * depends on (never the reverse) so a core change cannot break them, but they can be swept
 * as cheap extra coverage. The `interface` package is Vue and is type-checked by its own
 * `vue-tsc` build; external packages (e.g. ohif) are skipped.
 *
 * Usage:
 *   node scripts/typecheck.mjs                  # every library package
 *   node scripts/typecheck.mjs epicurrents      # one namespace
 *   node scripts/typecheck.mjs epicurrents/core # one package
 */

import fs from 'fs'
import { spawnSync } from 'child_process'
import { packages, rootDir } from './env.mjs'
import { getScopeComponents, sep } from './util.mjs'

const tsc = [rootDir, 'node_modules', '.bin', 'tsc'].join(sep)

// Flatten the package map into { namespace, name, dir } entries. The interface is Vue
// (checked by vue-tsc in its own build) and ohif is external, so neither is tsc-swept here.
const targets = []
for (const [namespace, group] of packages) {
    if (group.external || namespace === 'interface') {
        continue
    }
    for (const member of group.packages ?? [{ name: group.name }]) {
        targets.push({
            namespace: namespace,
            name: member.name,
            dir: [rootDir, namespace, member.name].join(sep),
        })
    }
}

// Optional scope argument: `<namespace>` or `<namespace>/<package>`.
const [scopeNamespace, scopePackage] = getScopeComponents(process.argv[2] || '')[0]
const selected = targets.filter(target =>
    !scopeNamespace ||
    (target.namespace === scopeNamespace && (!scopePackage || target.name === scopePackage))
)

let checked = 0
let failed = 0
for (const target of selected) {
    // Only packages with their own tsconfig can be type-checked in isolation.
    if (!fs.existsSync([target.dir, 'tsconfig.json'].join(sep))) {
        continue
    }
    checked++
    const label = `${target.namespace}/${target.name}`
    const result = spawnSync(tsc, ['--noEmit'], { cwd: target.dir, encoding: 'utf8' })
    if (result.status === 0) {
        console.info(`✓ ${label}`)
    } else {
        failed++
        console.error(`✗ ${label}`)
        const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
        console.error(output.split('\n').slice(0, 6).join('\n'))
    }
}

console.info(`\nType-checked ${checked} package(s): ${checked - failed} passed, ${failed} failed.`)
process.exit(failed ? 1 : 0)
