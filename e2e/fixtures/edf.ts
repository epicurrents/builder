/**
 * Synthetic EDF+ writer for browser tests.
 *
 * Writes a study whose every sample is a known function of time, so a test can open it without carrying a real
 * recording and can tell which channel it is looking at. The identification fields are the blanks a de-identified
 * file carries.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */

/** One signal of a synthetic study. */
export type SyntheticSignal = {
    label: string
    transducer?: string
    unit: string
    /** Physical range, which also scales the waveform. */
    physical: [number, number]
    /** Samples per data record. */
    samplesPerRecord: number
    prefilter?: string
    /** Physical value at `t` seconds from the start of the study. */
    wave: (t: number) => number
}

/** An annotation written into the study's annotation signal. */
export type SyntheticAnnotation = {
    onset: number
    duration: number
    text: string
}

export type SyntheticStudy = {
    signals: SyntheticSignal[]
    /** Number of data records. */
    records: number
    /** Duration of one data record in seconds. */
    recordDuration: number
    annotations?: SyntheticAnnotation[]
    /** Onset of each data record in seconds; a gap makes the file EDF+D. Defaults to contiguous records. */
    recordOnsets?: number[]
}

/** Samples per record given to the annotation signal; 2 bytes each. */
const ANNOTATION_SAMPLES = 64

const field = (value: string | number, width: number) => {
    const text = String(value)
    if (text.length > width) {
        throw new Error(`'${text}' does not fit a ${width}-byte EDF field.`)
    }
    return text.padEnd(width, ' ')
}

/** Format a number for an 8-byte EDF field. */
const num = (value: number) => {
    const text = Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(7)))
    return field(text.slice(0, 8), 8)
}

/** Encode one data record's annotation signal: the timekeeping TAL, then any annotations starting in it. */
const annotationRecord = (onset: number, duration: number, annotations: SyntheticAnnotation[]) => {
    let text = `+${onset}\x14\x14\x00`
    for (const a of annotations) {
        if (a.onset >= onset && a.onset < onset + duration) {
            text += `+${a.onset}\x15${a.duration}\x14${a.text}\x14\x00`
        }
    }
    const bytes = new Uint8Array(ANNOTATION_SAMPLES * 2)
    const encoded = new TextEncoder().encode(text)
    if (encoded.length > bytes.length) {
        throw new Error(`Annotations at ${onset} s exceed one record's annotation signal.`)
    }
    bytes.set(encoded)
    return bytes
}

/** Write a synthetic study as EDF+C, or as EDF+D when its record onsets have a gap. */
export const writeEdf = (study: SyntheticStudy): Uint8Array => {
    const { signals, records, recordDuration } = study
    const annotations = study.annotations ?? []
    const onsets = study.recordOnsets ?? Array.from({ length: records }, (_, i) => i * recordDuration)
    const contiguous = onsets.every((o, i) => i === 0 || o === onsets[i - 1] + recordDuration)
    const ns = signals.length + 1
    const all = [
        ...signals.map(s => ({
            label: s.label,
            transducer: s.transducer ?? '',
            unit: s.unit,
            physMin: s.physical[0],
            physMax: s.physical[1],
            digMin: -32768,
            digMax: 32767,
            prefilter: s.prefilter ?? '',
            samples: s.samplesPerRecord,
        })),
        {
            label: 'EDF Annotations',
            transducer: '',
            unit: '',
            physMin: -1,
            physMax: 1,
            digMin: -32768,
            digMax: 32767,
            prefilter: '',
            samples: ANNOTATION_SAMPLES,
        },
    ]
    const header =
        field('0', 8)
        + field('X X X X', 80)
        + field('Startdate X X X X', 80)
        + '01.01.85' + '00.00.00'
        + field(256 + 256 * ns, 8)
        + field(contiguous ? 'EDF+C' : 'EDF+D', 44)
        + field(records, 8)
        + num(recordDuration)
        + field(ns, 4)
        + all.map(s => field(s.label, 16)).join('')
        + all.map(s => field(s.transducer, 80)).join('')
        + all.map(s => field(s.unit, 8)).join('')
        + all.map(s => num(s.physMin)).join('')
        + all.map(s => num(s.physMax)).join('')
        + all.map(s => num(s.digMin)).join('')
        + all.map(s => num(s.digMax)).join('')
        + all.map(s => field(s.prefilter, 80)).join('')
        + all.map(s => field(s.samples, 8)).join('')
        + all.map(() => field('', 32)).join('')
    const recordBytes = all.reduce((sum, s) => sum + s.samples * 2, 0)
    const out = new Uint8Array(header.length + recordBytes * records)
    out.set(new TextEncoder().encode(header))
    const view = new DataView(out.buffer)
    let pos = header.length
    for (let r = 0; r < records; r++) {
        const onset = onsets[r]
        for (const s of signals) {
            const [lo, hi] = s.physical
            for (let i = 0; i < s.samplesPerRecord; i++) {
                const t = onset + (i / s.samplesPerRecord) * recordDuration
                const clamped = Math.min(hi, Math.max(lo, s.wave(t)))
                const digital = Math.round(-32768 + ((clamped - lo) / (hi - lo)) * 65535)
                view.setInt16(pos, digital, true)
                pos += 2
            }
        }
        out.set(annotationRecord(onset, recordDuration, annotations), pos)
        pos += ANNOTATION_SAMPLES * 2
    }
    return out
}

const sine = (hz: number, amplitude: number, phase = 0) =>
    (t: number) => amplitude * Math.sin(2 * Math.PI * hz * t + phase)
const sum = (...waves: ((t: number) => number)[]) => (t: number) => waves.reduce((acc, w) => acc + w(t), 0)

/** The C4-M1 waveform: alpha over a slow wave whose period is no whole number of seconds. */
export const c4m1Wave = sum(sine(10, 30), sine(0.37, 40))

/** The SpO2 waveform: a ramp over the night, so a sample read from the wrong time has the wrong value. */
export const spo2Wave = (seconds: number) => (t: number) => 90 + 8 * (t / seconds)

/**
 * The signals of a typical overnight study, under the names the platform stores them by: EEG derivations, eye and
 * muscle channels, ECG, respiration and oximetry. Each channel has its own frequency so a rendering mix-up shows.
 *
 * They are in no reading order, as acquisition templates often are not, so the order a montage shows them in is the
 * montage's own. C4-M1 and SpO2 are aperiodic over a data block, so a read from the wrong block shows in their values.
 */
export const psgSignals = (seconds: number): SyntheticSignal[] => [
    { label: 'SpO2', unit: '%', physical: [0, 100], samplesPerRecord: 1, wave: spo2Wave(seconds) },
    // A DC offset the study's 0.5 Hz high-pass removes and a notch-only ECG would keep.
    { label: 'ECG', unit: 'uV', physical: [-2000, 2000], samplesPerRecord: 256, wave: sum(sine(1.1, 800), () => 300) },
    { label: 'Thorax', unit: 'uV', physical: [-1000, 1000], samplesPerRecord: 32, wave: sine(0.25, 400) },
    { label: 'Abdomen', unit: 'uV', physical: [-1000, 1000], samplesPerRecord: 32, wave: sine(0.25, 400, 0.3) },
    { label: 'Resp nasal', unit: 'cmH2O', physical: [-10, 10], samplesPerRecord: 32, wave: sine(0.25, 5) },
    { label: 'EMG/Chin', unit: 'uV', physical: [-250, 250], samplesPerRecord: 256, wave: sine(60, 15) },
    { label: 'EMG/LegL', unit: 'uV', physical: [-250, 250], samplesPerRecord: 256, wave: sine(45, 10) },
    { label: 'EMG/LegR', unit: 'uV', physical: [-250, 250], samplesPerRecord: 256, wave: sine(50, 10) },
    { label: 'LOC-M2', unit: 'uV', physical: [-1000, 1000], samplesPerRecord: 256, wave: sine(0.3, 150) },
    { label: 'ROC-M1', unit: 'uV', physical: [-1000, 1000], samplesPerRecord: 256, wave: sine(0.3, 150, Math.PI) },
    {
        label: 'O2-M1', unit: 'uV', physical: [-500, 500], samplesPerRecord: 256,
        wave: sum(sine(11, 40), sine(0.8, 30)),
    },
    { label: 'C4-M1', unit: 'uV', physical: [-500, 500], samplesPerRecord: 256, wave: c4m1Wave },
    { label: 'C3-M2', unit: 'uV', physical: [-500, 500], samplesPerRecord: 256, wave: sum(sine(9, 30), sine(1.2, 40)) },
    { label: 'F4-M1', unit: 'uV', physical: [-500, 500], samplesPerRecord: 256, wave: sum(sine(6, 25), sine(1.5, 35)) },
    { label: 'Position', unit: '', physical: [0, 5], samplesPerRecord: 1, wave: () => 2 },
    { label: 'Snore', unit: 'uV', physical: [-500, 500], samplesPerRecord: 256, wave: sine(80, 60) },
]

/** One sleep stage per 30-second epoch, cycling through the stages so every one appears. */
export const stageAnnotations = (epochs: number): SyntheticAnnotation[] => {
    const stages = ['W', 'N1', 'N2', 'N3', 'N2', 'R']
    return Array.from({ length: epochs }, (_, i) => ({
        onset: i * 30,
        duration: 30,
        text: `Sleep stage ${stages[i % stages.length]}`,
    }))
}
