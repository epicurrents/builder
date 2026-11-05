/**
 * Shared steps for driving an edition: opening a study the way a user does and reaching the recording it opened.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import path from 'path'
import { test, type Page } from '@playwright/test'
import { FIXTURE_DIR } from '../global-setup'

/**
 * What a page reports going wrong, each entry prefixed with its kind: `warning:` and `error:` for console messages,
 * `uncaught:` for exceptions and `http:` for failed requests. Chromium's own console line for a failed request names
 * no URL, so it is left to the `http:` entry, which does.
 */
export const collectProblems = (page: Page) => {
    const problems: string[] = []
    page.on('console', m => {
        const text = m.text().split('\n')[0]
        if ((m.type() === 'warning' || m.type() === 'error') && !text.startsWith('Failed to load resource')) {
            problems.push(`${m.type()}: ${text}`)
        }
    })
    page.on('pageerror', e => problems.push(`uncaught: ${e.message}`))
    page.on('response', r => {
        if (r.status() >= 400) {
            problems.push(`http: ${r.status()} ${new URL(r.url()).pathname}`)
        }
    })
    return problems
}

/**
 * Failures every page of an edition reports today, which a test about something else should not fail on. Each one is
 * a defect of its own; remove its entry once it is fixed, so a return is noticed.
 */
export const KNOWN_PROBLEMS = [
    // The edition ships no report schema, so the report form looks for one and logs its absence.
    /^http: 404 \/report\/setup\.yaml$/,
    /^error: .*Loading schema setup failed/,
]

/** The errors, uncaught exceptions and failed requests among `problems` that are not known. */
export const unexpectedFailures = (problems: string[]) =>
    problems.filter(p => !p.startsWith('warning:') && !KNOWN_PROBLEMS.some(known => known.test(p)))

/** Attach the warnings among `problems` to the test's report, where they are read rather than asserted on. */
export const attachWarnings = async (problems: string[]) => {
    const warnings = problems.filter(p => p.startsWith('warning:'))
    if (warnings.length) {
        await test.info().attach('warnings', { body: warnings.join('\n'), contentType: 'text/plain' })
    }
}

/**
 * Load the edition, accept the disclaimer and open a fixture through File → Open polysomnography → From file, then
 * select it in the dataset list.
 * @param page - The page to drive.
 * @param fixture - File name under the fixture directory.
 * @param query - Query string for the edition, e.g. `memory=4` to force the rolling cache.
 */
export const openStudy = async (page: Page, fixture: string, query = '') => {
    // The native picker opens an OS dialog no test can drive; without it the interface falls back to the file input.
    await page.addInitScript(() => {
        delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    })
    await page.goto(query ? `/?${query}` : '/')
    await page.locator('#accept-disclaimer-basic-button').click()
    await page.locator('.epicv-menubar wa-button', { hasText: 'File' }).click()
    const importer = page.locator('wa-dropdown-item', { hasText: 'Open polysomnography' })
    await importer.hover()
    const chooser = page.waitForEvent('filechooser')
    await importer.locator('wa-dropdown-item', { hasText: 'From file' }).click()
    await (await chooser).setFiles(path.join(FIXTURE_DIR, fixture))
    const item = page.locator('[data-component="navigator-item"]', { hasText: fixture.replace(/\.edf$/, '') })
    await item.click()
    return item
}

/**
 * Load the edition, accept the disclaimer and open `url` through File → Open polysomnography → From URL, then select
 * the study in the dataset list.
 * @param page - The page to drive.
 * @param url - Address of the study, e.g. under the server's `/slow-fixtures/`.
 * @param query - Query string for the edition.
 */
export const openStudyFromUrl = async (page: Page, url: string, query = '') => {
    await page.goto(query ? `/?${query}` : '/')
    await page.locator('#accept-disclaimer-basic-button').click()
    await page.locator('.epicv-menubar wa-button', { hasText: 'File' }).click()
    const importer = page.locator('wa-dropdown-item', { hasText: 'Open polysomnography' })
    await importer.hover()
    await importer.locator('wa-dropdown-item', { hasText: 'From URL' }).click()
    await page.locator('wa-dialog[open] wa-input').first().click()
    await page.keyboard.type(url)
    await page.locator('wa-dialog[open] wa-button', { hasText: /open|load/i }).last().click()
    const item = page.locator('[data-component="navigator-item"]').first()
    await item.click()
    return item
}

/** Evaluate `fn` against the active recording, which must exist. */
export const withRecording = <T, A>(page: Page, fn: (recording: any, arg: A) => T | Promise<T>, arg?: A) =>
    page.evaluate(async ({ source, arg }) => {
        const app = (window as any).__EPICURRENTS__.APP
        const recording = app.runtime.APP.activeDataset?.activeResources?.[0]
        if (!recording) {
            throw new Error('No active recording.')
        }
        // eslint-disable-next-line no-new-func
        return await new Function('recording', 'arg', `return (${source})(recording, arg)`)(recording, arg)
    }, { source: fn.toString(), arg })

/** Resolve once the active recording is ready or has failed, returning its state. */
export const settledState = async (page: Page, timeout = 30_000) => {
    await page.waitForFunction(() => {
        const recording = (window as any).__EPICURRENTS__.APP?.runtime?.APP?.activeDataset?.activeResources?.[0]
        return recording && (recording.state === 'ready' || recording.state === 'error')
    }, undefined, { timeout })
    return withRecording(page, r => ({ state: r.state as string, errorReason: r.errorReason as string }))
}
