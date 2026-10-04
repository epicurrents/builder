/**
 * Edition-owned lead-field source for the EEG source-localisation tool.
 *
 * The interface asks for a lead field through the `LeadFieldProvider` a consumer injects at
 * `SETUP.modules.eeg.leadFieldProvider` and holds no URL of its own, so the one location an
 * edition knows about lives here: a static bundle packaged beside the page.
 *
 * The bundle is optional, and that is the whole of the configuration. A deployment that serves
 * `leadfields/` gets source localisation; one that deletes the folder gets an edition without it,
 * and neither has to declare anything. A manifest that does not answer therefore resolves to null
 * rather than raising — the tool renders that as the montage not being available, which is the
 * honest description of both cases. The one failure worth reporting is a manifest that lists a
 * blob it cannot then produce, because that is a bundle in need of regenerating rather than a
 * choice anyone made.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { LeadFieldData, LeadFieldProvider } from '@epicurrents/interface/modules/eeg'

/**
 * Location of the packaged bundle's manifest.
 *
 * Relative, and resolved against the document rather than the site root, because an edition is a
 * folder of static files that a deployment may serve from any path.
 */
const MANIFEST_PATH = 'leadfields/manifest.json'

/** One record of `manifest.json`, as the lead-field generator writes it. */
type LeadFieldManifestEntry = {
    montage_name:       string
    n_orient:           number
    grid_resolution_mm: number
    n_channels:         number
    n_sources:          number
    channel_names:      string[]
    /** Byte length of the lead-field section at the start of the blob. */
    lead_field_bytes:   number
    /** Byte length of the source-position section that follows it. */
    src_pos_bytes:      number
    /** Blob filename, content-hashed so a regenerated bundle never collides with a cached copy. */
    file:               string
    /** Blob location as the generating deployment serves it, which an edition does not share. */
    url:                string
}

type LeadFieldManifest = {
    entries:        LeadFieldManifestEntry[]
    format_version: number
}

/**
 * The parsed manifest, or null when this deployment serves no bundle.
 *
 * Memoised as the promise rather than the value, so concurrent first calls share one fetch instead
 * of racing to answer the same question.
 */
let _manifest: Promise<LeadFieldManifest | null> | null = null

const manifestUrl = () => new URL(MANIFEST_PATH, document.baseURI)

const loadManifest = (): Promise<LeadFieldManifest | null> => {
    _manifest ??= fetch(manifestUrl())
        .then(resp => (resp.ok ? resp.json() as Promise<LeadFieldManifest> : null))
        .catch(() => null)
    return _manifest
}

/**
 * Split a lead-field blob into its two float64 sections.
 *
 * Both are views into the same `ArrayBuffer`, so the split copies nothing. `lfBytes` is a whole
 * number of float64s by construction, which is what keeps the second view's offset aligned.
 */
const sliceBlob = (buffer: ArrayBuffer, lfBytes: number, nSources: number): [Float64Array, Float64Array] => {
    const expected = lfBytes + nSources*3*8
    if (buffer.byteLength < expected) {
        throw new Error(
            `Lead field blob is truncated: got ${buffer.byteLength} bytes, expected at least ${expected}.`
        )
    }
    return [
        new Float64Array(buffer, 0, lfBytes/8),
        new Float64Array(buffer, lfBytes, nSources*3),
    ]
}

/**
 * Resolve a lead field from the packaged bundle, or null when it carries none for these parameters.
 *
 * All three parameters are matched exactly. A lead field computed for a different grid spacing or
 * orientation count describes a different source space, so answering with a near miss would return
 * a result for a question nobody asked, in a shape indistinguishable from the right one.
 *
 * The blob is located by `file` against the manifest, not by the entry's `url`: that field records
 * where the deployment which generated the bundle serves it from, and an edition serves it from
 * beside its own manifest instead.
 */
export const leadFieldProvider: LeadFieldProvider = async (
    montageName: string,
    nOrient:     number,
    gridResMm:   number,
): Promise<LeadFieldData | null> => {
    const manifest = await loadManifest()
    const entry = manifest?.entries.find(
        e => e.montage_name === montageName && e.n_orient === nOrient && e.grid_resolution_mm === gridResMm
    )
    if (!entry) {
        return null
    }
    try {
        const resp = await fetch(new URL(entry.file, manifestUrl()))
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`)
        }
        const [leadField, srcPos] = sliceBlob(await resp.arrayBuffer(), entry.lead_field_bytes, entry.n_sources)
        return {
            leadField,
            srcPos,
            nChannels:    entry.n_channels,
            nSources:     entry.n_sources,
            nOrient:      entry.n_orient,
            channelNames: entry.channel_names,
        }
    } catch (e) {
        console.warn(
            `[leadFields] The bundle lists '${entry.file}' but it could not be read `
            + `(${(e as Error).message}); the bundle needs regenerating.`
        )
        return null
    }
}
