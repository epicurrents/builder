/**
 * Write the synthetic studies the browser tests open into `.fixtures/`.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { psgSignals, stageAnnotations, writeEdf } from './fixtures/edf.ts'

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.fixtures')

/** Length of the continuous study in seconds: long enough that the viewer cannot hold it in one page. */
export const STUDY_SECONDS = 20 * 60

/**
 * Length of the long study in seconds. Under a small cache its rolling-cache blocks run to tens of minutes, so a block
 * is read in several parts and a slow read leaves most of the window still loading when the view could be drawn.
 */
export const LONG_STUDY_SECONDS = 4 * 3600

export default function globalSetup () {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true })
    const long = path.join(FIXTURE_DIR, 'psg-4h.edf')
    if (!fs.existsSync(long)) {
        // The file is the same every time and takes seconds to write, so a run keeps the last one.
        fs.writeFileSync(long, writeEdf({
            signals: psgSignals(LONG_STUDY_SECONDS),
            records: LONG_STUDY_SECONDS,
            recordDuration: 1,
        }))
    }
    fs.writeFileSync(
        path.join(FIXTURE_DIR, 'psg-continuous.edf'),
        writeEdf({
            signals: psgSignals(STUDY_SECONDS),
            records: STUDY_SECONDS,
            recordDuration: 1,
            annotations: stageAnnotations(STUDY_SECONDS / 30),
        })
    )
    // Ten minutes, a minute's gap, ten minutes: the continuity check has to refuse it.
    const half = STUDY_SECONDS / 2
    fs.writeFileSync(
        path.join(FIXTURE_DIR, 'psg-interrupted.edf'),
        writeEdf({
            signals: psgSignals(STUDY_SECONDS),
            records: STUDY_SECONDS,
            recordDuration: 1,
            recordOnsets: Array.from({ length: STUDY_SECONDS }, (_, i) => (i < half ? i : i + 60)),
        })
    )
}
