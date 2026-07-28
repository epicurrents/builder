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
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

import fs from 'fs'
import { spawnSync } from 'child_process'
import { packages, rootDir } from './env.mjs'
import { getScopeComponents, sep } from './util.mjs'

const tsc = [rootDir, 'node_modules', '.bin', 'tsc'].join(sep)
if (!fs.existsSync(tsc)) {
    // Without this the spawn fails per package with an empty message, which reads as every package
    // having type errors rather than as a missing compiler.
    console.error(
        `TypeScript not found at ${tsc}. Run \`npm install\` in the workspace root ` +
        `(or \`npm run setup\` if the packages have not been cloned yet).`
    )
    process.exit(1)
}

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
    if (result.error) {
        // The compiler could not be run at all — report that rather than blaming the package.
        throw new Error(`Could not run ${tsc} in ${target.dir}: ${result.error.message}`)
    }
    if (result.status === 0) {
        console.info(`✓ ${label}`)
    } else {
        failed++
        console.error(`✗ ${label}`)
        const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
        const lines = output.split('\n')
        console.error(lines.slice(0, 6).join('\n'))
        if (lines.length > 6) {
            console.error(`  … ${lines.length - 6} more line(s); run \`npx tsc --noEmit\` in ${target.dir}.`)
        }
    }
}

console.info(`\nType-checked ${checked} package(s): ${checked - failed} passed, ${failed} failed.`)
process.exit(failed ? 1 : 0)
