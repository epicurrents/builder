/**
 * A polysomnography opened in the PSG edition: the study loads, gets its own montage, and reads correctly across the
 * night under the rolling cache, drawing the view before the rest of the cache window has loaded. An interrupted file
 * is refused.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import { expect, test } from '@playwright/test'
import { STUDY_SECONDS } from '../global-setup'
import { c4m1Wave, spo2Wave } from '../fixtures/edf'
import {
    attachWarnings,
    collectProblems,
    openStudy,
    openStudyFromUrl,
    settledState,
    unexpectedFailures,
    withRecording,
} from './helpers'

/** Samples of one channel read back from the recording, in physical units. */
type Samples = { rate: number, data: number[] } | null

/**
 * The PSG montage's order for the fixture: role groups in the order a scorer reads a study, each group in the order the
 * file has it.
 */
const SCORER_ORDER = [
    'O2-M1', 'C4-M1', 'C3-M2', 'F4-M1', 'LOC-M2', 'ROC-M1', 'EMG/Chin', 'EMG/LegL', 'EMG/LegR', 'ECG',
    'Thorax', 'Abdomen', 'Resp nasal', 'SpO2', 'Position',
]

test.describe('a continuous study', () => {
    test('opens with every channel and its full duration', async ({ page }) => {
        const problems = collectProblems(page)
        const item = await openStudy(page, 'psg-continuous.edf')
        await expect(item).toContainText('20:00')
        const { state, errorReason } = await settledState(page)
        expect(state, errorReason).toBe('ready')
        const info = await withRecording(page, r => ({
            ctor: r.constructor.name,
            duration: r.dataDuration,
            continuous: r.isContinuous,
            labels: r.channels.map((c: { label: string }) => c.label)
                              .filter((label: string) => label !== 'EDF Annotations'),
        }))
        expect(info.ctor).toBe('PsgRecording')
        expect(info.duration).toBe(STUDY_SECONDS)
        expect(info.continuous).toBe(true)
        expect([...info.labels].sort()).toEqual([...SCORER_ORDER].sort())
        await page.screenshot({ path: test.info().outputPath('opened.png') })
        await attachWarnings(problems)
        expect(unexpectedFailures(problems)).toEqual([])
    })

    test('finishes montage setup on the study\'s own montage, in the scorer\'s order', async ({ page }) => {
        await openStudy(page, 'psg-continuous.edf')
        expect((await settledState(page)).state).toBe('ready')
        await expect(page.getByText('Please wait...')).toBeHidden({ timeout: 15_000 })
        const montage = await withRecording(page, r => ({
            label: r.activeMontage?.label,
            channels: r.activeMontage?.channels.map((c: { label: string }) => c.label),
        }))
        expect(montage.label).toBe('As recorded')
        expect(montage.channels).toEqual(SCORER_ORDER)
    })

    test('switches montages from the montage control and draws every channel', async ({ page }) => {
        const problems = collectProblems(page)
        await openStudy(page, 'psg-continuous.edf')
        expect((await settledState(page)).state).toBe('ready')
        await expect(page.getByText('Please wait...')).toBeHidden({ timeout: 15_000 })
        // The select's label is a property, not an attribute, so the control is found by an option only it has.
        const select = page.locator('wa-select').filter({ has: page.locator('wa-option[value="raw-signals"]') })
        // Away to the raw signals and back: the PSG montage has channels of modalities (oximetry, position) that the
        // EEG trace settings name no colour for, and drawing them must not depend on one.
        for (const label of ['Raw signals', 'As recorded']) {
            await select.click()
            await select.locator('wa-option', { hasText: label }).click()
            await expect.poll(() => withRecording(page, r => r.activeMontage?.label ?? 'Raw signals')).toBe(label)
            await page.waitForTimeout(500)
        }
        await page.screenshot({ path: test.info().outputPath('as-recorded.png') })
        await attachWarnings(problems)
        expect(unexpectedFailures(problems)).toEqual([])
    })
})

test.describe('the rolling cache', () => {
    test('pages through the night and reads every block from its own place', async ({ page }) => {
        test.setTimeout(180_000)
        const problems = collectProblems(page)
        // 4 MB holds about a third of the 12 MB study, so the reader has to roll blocks in and out.
        await openStudy(page, 'psg-continuous.edf', 'memory=4')
        expect((await settledState(page)).state).toBe('ready')
        // Page from the start to the last minutes, crossing every block boundary on the way. Each press has to move
        // the view, or the loop would spin on a viewer that has stopped responding.
        const target = STUDY_SECONDS - 4 * 60
        const viewStartOf = () => withRecording(page, r => r.viewStart as number)
        let viewStart = await viewStartOf()
        while (viewStart < target) {
            const before = viewStart
            await page.keyboard.press('PageDown')
            await expect.poll(viewStartOf, { message: `paging from ${before} s`, timeout: 5_000 })
                        .toBeGreaterThan(before)
            viewStart = await viewStartOf()
        }
        expect(viewStart).toBeGreaterThanOrEqual(target)
        await page.screenshot({ path: test.info().outputPath('late-in-the-night.png') })
        // Read back two windows, one early and one late, and compare them with the waveforms written into the file.
        for (const start of [37, viewStart]) {
            const read: { c4m1: Samples, spo2: Samples } = await withRecording(page, async (r, { start }) => {
                const range = [start, start + 10]
                await r.ensureViewCached(range)
                const labels = r.channels.map((c: { label: string }) => c.label)
                const pick = async (label: string): Promise<Samples> => {
                    const response = await r.getAllRawSignals(range, { include: [labels.indexOf(label)] })
                    const part = response?.signals?.[0]
                    return part ? { rate: part.samplingRate, data: Array.from(part.data as Float32Array) } : null
                }
                return { c4m1: await pick('C4-M1'), spo2: await pick('SpO2') }
            }, { start })
            expect(read.c4m1, `C4-M1 at ${start} s`).not.toBeNull()
            expect(read.spo2, `SpO2 at ${start} s`).not.toBeNull()
            const c4 = read.c4m1!
            const expected = c4.data.map((_, i) => c4m1Wave(start + i / c4.rate))
            expect(correlation(c4.data, expected), `C4-M1 shape at ${start} s`).toBeGreaterThan(0.99)
            const spo2 = read.spo2!
            spo2.data.forEach((value, i) => {
                const t = start + i / spo2.rate
                expect(value, `SpO2 at ${t} s`).toBeCloseTo(spo2Wave(STUDY_SECONDS)(t), 1)
            })
        }
        await attachWarnings(problems)
        expect(unexpectedFailures(problems)).toEqual([])
        expect(problems.filter(p => /Reading signals failed/.test(p))).toEqual([])
    })
})

test.describe('a slow read under long blocks', () => {
    test('draws the view before the rest of the cache window has loaded', async ({ page }) => {
        test.setTimeout(120_000)
        // Under a 100 MB cache the 4-hour study rolls in blocks of about 25 minutes, read in parts, and the throttled
        // route makes each part slow to arrive. The plot has to draw once the part holding the view is in: a plot
        // waiting for the window stays blank for as long as the whole window takes to read.
        const problems = collectProblems(page)
        const firstDraw: { cacheEnd: number }[] = []
        await page.exposeFunction('reportMontageData', (cacheEnd: number) => {
            firstDraw.push({ cacheEnd })
        })
        const origin = new URL(test.info().project.use.baseURL!).origin
        await openStudyFromUrl(page, `${origin}/slow-fixtures/psg-4h.edf`, 'memory=100')
        // Watch the montage the plot reads through, and report how much was cached when it first returned data.
        await page.waitForFunction(() => {
            const r = (window as any).__EPICURRENTS__.APP?.runtime?.APP?.activeDataset?.activeResources?.[0]
            const montage = r?.activeMontage
            if (!montage) {
                return false
            }
            if (!montage.__watched) {
                montage.__watched = true
                const read = montage.getAllSignals.bind(montage)
                montage.getAllSignals = async (...args: unknown[]) => {
                    const response = await read(...args)
                    if (response?.signals?.some((s: { data?: Float32Array }) => s?.data?.length)) {
                        ;(window as any).reportMontageData(r.signalCacheStatus[1])
                    }
                    return response
                }
            }
            return true
        }, undefined, { polling: 'raf', timeout: 30_000 })
        await expect.poll(() => firstDraw.length, { timeout: 30_000 }).toBeGreaterThan(0)
        const cacheWindowEnd = () => withRecording(page, r => r.signalCacheStatus[1] as number)
        // The window keeps loading well past what was cached when the view was drawn.
        await expect.poll(cacheWindowEnd, { timeout: 60_000 }).toBeGreaterThanOrEqual(3600)
        expect(firstDraw[0].cacheEnd, 'cached seconds when the view was first drawn').toBeLessThanOrEqual(1200)
        await attachWarnings(problems)
        expect(unexpectedFailures(problems)).toEqual([])
    })
})

test.describe('an interrupted file', () => {
    test('is refused as a polysomnography', async ({ page }) => {
        test.fail(
            true,
            'PsgRecording.isContinuous reads header interruptions, which are empty when the loader checks it'
        )
        await openStudy(page, 'psg-interrupted.edf')
        const { state, errorReason } = await settledState(page)
        expect(state).toBe('error')
        expect(errorReason).toMatch(/continuous/)
        await page.screenshot({ path: test.info().outputPath('refused.png') })
    })
})

/** Pearson correlation of two equally long series. */
const correlation = (a: number[], b: number[]) => {
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    const ma = mean(a)
    const mb = mean(b)
    let num = 0
    let da = 0
    let db = 0
    for (let i = 0; i < a.length; i++) {
        num += (a[i] - ma) * (b[i] - mb)
        da += (a[i] - ma) ** 2
        db += (b[i] - mb) ** 2
    }
    return num / Math.sqrt(da * db)
}
