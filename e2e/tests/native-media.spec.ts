/**
 * Native media in an edition that registers it (the full edition): an image or a sound opened from a file or a URL
 * appears in the dataset and is rendered by the browser's own element, with nothing read by the viewer.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import path from 'path'
import { expect, test, type Page } from '@playwright/test'
import { FIXTURE_DIR, IMAGE_SIZE, SOUND_SECONDS } from '../global-setup'
import { attachWarnings, collectProblems, unexpectedFailures } from './helpers'

const VIEWER = '[data-component="native-media-viewer"]'

/**
 * Load the edition, accept the disclaimer and open the File menu's submenu for one native media modality.
 * @param page - The page to drive.
 * @param modality - The modality whose importer to open, as its menu label names it: `image`, `audio` or `video`.
 */
const openImporter = async (page: Page, modality: string) => {
    // The native picker opens an OS dialog no test can drive; without it the interface falls back to the file input.
    await page.addInitScript(() => {
        delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    })
    await page.goto('/')
    await page.locator('#accept-disclaimer-basic-button').click()
    const registered = await page.evaluate(
        (key) => (window as any).__EPICURRENTS__.APP.runtime.APP.studyImporters.has(key),
        `media/${modality}-file`,
    )
    test.skip(!registered, `The edition does not register ${modality}; run these against the full edition.`)
    await page.locator('.epicv-menubar wa-button', { hasText: 'File' }).click()
    const importer = page.locator('wa-dropdown-item', { hasText: `Open ${modality}` })
    await importer.hover()
    return importer
}

/**
 * Open a fixture through File → Open <modality> → From file and select it in the dataset list.
 * @param page - The page to drive.
 * @param modality - The modality to open the fixture as.
 * @param fixture - File name under the fixture directory.
 */
const openFile = async (page: Page, modality: string, fixture: string) => {
    const importer = await openImporter(page, modality)
    const chooser = page.waitForEvent('filechooser')
    await importer.locator('wa-dropdown-item', { hasText: 'From file' }).click()
    await (await chooser).setFiles(path.join(FIXTURE_DIR, fixture))
    // The dataset list names a study without its extension.
    await page.locator('[data-component="navigator-item"]', { hasText: fixture.replace(/\.[^.]+$/, '') }).click()
}

/**
 * Open a fixture through File → Open <modality> → From URL and select it in the dataset list.
 * @param page - The page to drive.
 * @param modality - The modality to open the fixture as.
 * @param fixture - File name under the server's `/fixtures/`.
 */
const openUrl = async (page: Page, modality: string, fixture: string) => {
    const importer = await openImporter(page, modality)
    await importer.locator('wa-dropdown-item', { hasText: 'From URL' }).click()
    await page.locator('wa-dialog[open] wa-input').first().click()
    await page.keyboard.type(`/fixtures/${fixture}`)
    await page.locator('wa-dialog[open] wa-button', { hasText: /open|load/i }).last().click()
    await page.locator('[data-component="navigator-item"]').first().click()
}

/** Resolve once the image in the viewer has decoded, returning its natural size. */
const decodedImageSize = async (page: Page) => {
    const image = page.locator(`${VIEWER} img`)
    await expect(image).toBeVisible()
    await page.waitForFunction(
        (selector) => {
            const host = document.querySelector('#epicurrents-viewer')
            const root = host?.shadowRoot ?? document
            const img = root.querySelector(`${selector} img`) as HTMLImageElement | null
            return !!img && img.complete && img.naturalWidth > 0
        },
        VIEWER,
    )
    return image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])
}

test('an image opened from a file is shown at its own size', async ({ page }) => {
    const problems = collectProblems(page)
    await openFile(page, 'image', 'gradient.png')
    expect(await decodedImageSize(page)).toEqual([...IMAGE_SIZE])
    await page.screenshot({ path: test.info().outputPath('image.png') })
    await attachWarnings(problems)
    expect(unexpectedFailures(problems)).toEqual([])
})

test('an image opened from a URL is shown', async ({ page }) => {
    const problems = collectProblems(page)
    await openUrl(page, 'image', 'gradient.png')
    expect(await decodedImageSize(page)).toEqual([...IMAGE_SIZE])
    await attachWarnings(problems)
    expect(unexpectedFailures(problems)).toEqual([])
})

test('a sound opened from a file plays in a player that knows its length', async ({ page }) => {
    const problems = collectProblems(page)
    await openFile(page, 'audio', 'tone.wav')
    const audio = page.locator(`${VIEWER} audio`)
    await expect(audio).toBeVisible()
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration)).toBeCloseTo(SOUND_SECONDS, 1)
    await attachWarnings(problems)
    expect(unexpectedFailures(problems)).toEqual([])
})

test('a file the browser cannot decode says so instead of rendering a broken element', async ({ page }) => {
    const problems = collectProblems(page)
    // A sound is not an image; the viewer reads nothing, so only the element finds out.
    await openFile(page, 'image', 'tone.wav')
    await expect(page.locator(VIEWER)).toContainText('could not be opened')
    await attachWarnings(problems)
    expect(unexpectedFailures(problems)).toEqual([])
})
