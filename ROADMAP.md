Epicurrents viewer roadmap
==========================

Planned and deferred work for the viewer workspace. Implementation-level
detail and current architecture live in `CLAUDE.md` and `README.md`.

Framework setup + NPM publish
-----------------------------

The lean, registration-driven framework setup (`setups/index.ts`), the renamed
all-in `setups/standalone.ts`, and a splittable package build
(`vite.config.dist.ts` + `package.json` `exports`) have shipped. The framework
imports no modules itself; a consumer passes a `register(ctx)` callback and
imports only the packages it needs. The as-built design is documented in the
`setups/index.ts` header and in `CLAUDE.md`. What remains:

### NPM publish (the headline — ship first)

Publishing the framework build as a prebuilt, versioned package is the
high-leverage, platform-facing piece: a consumer installs a versioned package
instead of running `scripts/setup.mjs` (which clones each module from its own git
repo and builds in dependency order — fine locally, non-hermetic for a clean-room
or CI build). The package is still `private: true`, version `0.0.0`. Open
questions: scope / name (`@epicurrents/viewer`?), which artifacts ship (the UMD
lib + worker bundles + the new `dist/` split build), versioning against the
platform, and whether the module packages publish separately so a consumer can
add them from npm.

### `.d.ts` pipeline

The package build emits JS only; the module `exports` have no `types` conditions
yet. Needs a `vue-tsc` declaration emit + `tsconfig-replace-paths` (to rewrite
`#`-aliases for external consumers) wired to the `exports` map. The interface
type-check is green, so the prerequisite is met.

### Consumer documentation

In keeping with the project's AI-assistant-friendly philosophy — a clinician or
researcher, not necessarily a programmer, should be able to drive setup with an
AI assistant — the framework needs consumer-facing documentation good enough that
an assistant can walk a non-developer through building and embedding a viewer:

- **A setup guide** at a stable, linkable location (a `docs/` page or README
  section) the way the platform's `docs/getting-started.md` is, so a web-based
  assistant can read it remotely. Covers: installing the package, the `register`
  callback, a bare zero-module build, a typical build (e.g. EEG + PDF), and how
  to embed the result.
- **A documented module catalogue** derived from the `setups/index.ts` header
  (spec → what it enables → file formats → packages), so the catalogue and the
  code cannot drift.
- **Copy-paste examples** for the common cases (bare shell, single modality,
  modality plus analysis service).

The bar: someone who cannot read TypeScript, paired with an AI assistant pointed
at this documentation, can produce a working viewer build with exactly the
modules they need.

### Other follow-ups

- **CSS delivery.** A single `dist/style.css` is emitted and exposed via the
  `./style.css` export; the consumer imports it manually — no auto-injection.
- **Setup tests.** A bare-shell smoke test plus one asserting that only the
  registered modules load (and unknown specs warn rather than throw).
- **Platform migration.** `ViewerPlugin.extraSetup` / `rebuild-frontend.sh` still
  use the all-in build; moving the platform to a lean `register`-callback build
  is future work.

### Relationship to the platform

The platform roadmap tracks the consuming side under "Viewer — manifest-driven
setup skeleton for non-demo builds"; its interest is the NPM-published, hermetic
build. The setup design and the NPM publishing live in this repo.

BiosignalAudio refactor — synthesis/playback split + three synthesis methods
----------------------------------------------------------------------------

**Goal.** Split `BiosignalAudio` into (a) a playback engine and (b) pluggable
*synthesis methods* that each turn a signal into an `AudioBuffer`, rendered with
`OfflineAudioContext`. Add three methods: direct playback (EMG's current
behaviour), brain-stethoscope carrier modulation (ACC entrainment audio), and a
spectral constant-tone. EMG keeps working via the direct method; ACC gains
audio. All in `@epicurrents/core` — no new package, no worker service.

### Current state

`core/src/assets/media/BiosignalAudio.ts` conflates synthesis and playback.
`setSignals(length, sampleRate, ...signals)` stores raw data; `loadBuffer()`
normalises it into an `AudioBuffer` (against `sampleMaxAbsValue`); and
`play(position, gain)` / `pause` / `stop` / `setGain` + `currentTime` +
play-ended/started callbacks drive playback through
`AudioContext → AudioBufferSourceNode → gain → DynamicsCompressor`. The sole
consumer is `EmgRecording` (`new BiosignalAudio` → `setSignals` → `play`). ACC
has none. Public surface to preserve: `play/pause/stop/setGain`, `currentTime`,
`duration`, `playbackRate`, `isPlaying`, the play-ended/started callbacks, and
`loadFile`.

### Target architecture

- **Player** (refactored `BiosignalAudio`, or a `BiosignalAudioPlayer`): owns the
  live `AudioContext`, source, gain, compressor. Gains `setBuffer(AudioBuffer)`;
  keeps `play/pause/stop/seek`, `currentTime`, `playbackRate`, `setGain`,
  callbacks. Plays *any* buffer — no knowledge of how it was made.
- **Synthesis** — an `AudioSynthesizer` contract:
  ```ts
  interface AudioSynthesizer {
      synthesize (signals: Float32Array[], sampleRate: number, opts?: object): Promise<AudioBuffer>
  }
  ```
  Each method renders with `OfflineAudioContext` (faster-than-real-time, off the
  UI thread, no worker). A registry maps a key → synthesizer so the recording/UI
  can pick the method.
- **Flow**: recording picks method + options → `synth.synthesize(signals, sr, opts)`
  → `player.setBuffer(buf)` → `player.play()`. EMG and ACC converge on one player.

### Synthesis methods

1. **`direct` — normalised playback + optional EQ.** Reproduces today's behaviour
   (normalise signal against `sampleMaxAbsValue` → buffer). Optional EQ is a
   `BiquadFilterNode` chain in the offline graph (HP/LP/peaking to shape the
   sound); optional playback-rate/resample to lift sub-audible content. EMG's
   path: keep `setSignals`/`loadBuffer` working by delegating to `direct` so EMG
   is unbroken.
2. **`stethoscope` — carrier modulation (Ceribell / brain-stethoscope style).**
   Time-preserving, natural-tempo. An `OscillatorNode` whose `frequency` and a
   `GainNode` whose `gain` are automated via `setValueCurveAtTime` from curves
   derived from the signal — amplitude envelope → loudness, and optionally
   instantaneous frequency/power → carrier pitch. Light main-thread DSP derives
   the curves (envelope via rectify+smooth or Hilbert; frequency via
   zero-crossing or STFT peak); `OfflineAudioContext` renders the modulated
   carrier. This is ACC's entrainment audio.
3. **`spectral-tone` — constant tone from a sample's spectrum, optional speed-up.**
   Take a low-noise window → Hann window → FFT → pick the dominant peak(s) →
   additively synthesise a steady tone at those frequencies, scaled into the
   audible band by a multiplicative speed-up factor. Renders as a sum of
   `OscillatorNode`s (or a precomputed `Float32Array`) offline. See feedback.

### Feedback on method 3 (spectral-tone)

- Useful as a **spectral signature**: turns "what's the dominant rhythm in this
  clean window" into a stable, comparable pitch — good for hearing/comparing
  tremor frequency or as a steady entrainment target.
- **Additive over single-peak.** A lone peak is a pure sine — clean but
  timbre-less. Sum the top-N magnitude peaks (small N, ~3–8) with amplitudes
  from the spectrum to keep the spectral character; more informative.
- **Mapping must be multiplicative (the "speed-up").** Scale all peak
  frequencies by one factor k so harmonic ratios are preserved (a true sped-up
  timbre). An additive shift distorts the ratios — avoid. Pick k to land the
  fundamental in a comfortable band (~200–800 Hz).
- **It is a snapshot, not dynamic** — complementary to `stethoscope` (which
  tracks change), not a replacement. Label it so users know it discards temporal
  evolution; that stability is the feature.
- **Window selection is upstream**: manual (user selects a clean span) or auto
  (lowest-variance / highest-SNR window). The synth just takes the window.
- **DSP**: Hann window before FFT; magnitude-only (phase discarded — fine for a
  steady tone); a small radix-2 FFT (or a DFT for short windows) is plenty light
  for the main thread.

### Steps

1. Extract the player: move play/pause/stop/seek/gain/callbacks/currentTime into
   it; add `setBuffer`. Split the `AudioRecording` type into `AudioPlayer` +
   `AudioSynthesizer` (or keep `AudioRecording` for the player).
2. Add the `AudioSynthesizer` interface + an `OfflineAudioContext` helper
   (build graph → `startRendering()` → `AudioBuffer`).
3. Implement `direct` (normalisation + optional EQ); make EMG's
   `setSignals`/`loadBuffer` delegate to it; verify EMG audio still plays.
4. Implement `stethoscope` (envelope + optional frequency curves → carrier
   modulation); wire ACC to it.
5. Implement `spectral-tone` (windowed FFT → additive resynthesis + speed-up).
6. Method registry + a per-method options type; expose method choice through the
   ACC (and EMG) recording/UI.
7. Tests (extend `core/tests/assets/BiosignalAudio.test.ts`): each synthesizer
   returns a finite, non-empty `AudioBuffer` of the expected length/sampleRate
   for a known input; `direct` matches the pre-refactor normalisation; player
   plays/pauses/seeks a given buffer.

### Notes

- No Web Worker / `*-service` package: synthesis is light and one-shot, and
  `OfflineAudioContext` renders off the UI thread natively. Revisit only if a
  streaming/real-time mode is ever added.
- Entirely within `@epicurrents/core` (`assets/media`); EMG and ACC consume it.
  No new package, no cross-package migration beyond EMG's internal call swap.

Module controls-bar — keyed config instead of static-index array
----------------------------------------------------------------

**Problem.** Each module's controls component (`AccControls`, `EegControls`,
`EmgControls`, `NcsControls`, `PdfControls`, `TabControls`, `HtmControls`)
builds an array of `ControlElement` descriptors, and `constructControls()`
reads and updates them by **hardcoded array index** (`accControls[5]`,
`accControls[6]`, …). Inserting, removing, or reordering a control shifts every
later index, so new controls must be appended to the end and each per-index
update branch is brittle.

**Minimum fix — done in ACC, the reference example.** `AccControls`
([interface/src/app/modules/acc/components/AccControls.vue](interface/src/app/modules/acc/components/AccControls.vue))
now keys controls by `id`: `constructControls` resolves each descriptor through
a `control(id)` helper and gates each build block with `wants(id)`, instead of
indexing `accControls[N]`. That is what let the audio + video buttons be
reordered freely (audio left of the examine/annotate block, video toggle
between) — exactly the move the old index scheme made brittle. Convert the
remaining six modules (`EegControls`, `EmgControls`, `NcsControls`,
`PdfControls`, `TabControls`, `HtmControls`) to the same pattern; copy the
`control` / `wants` shape from `AccControls`.

**Stretch.** Redesign the controls system so a control set can be declared
externally — a project plugin contributes its controls through config rather
than editing a module's `*Controls.vue`. This aligns the controls surface with
the project-plugin extension model used elsewhere.

**Scope.** The minimum fix is per-module — the `constructControls` body in each
of the seven controls components, applied independently; **ACC is converted,
six remain**. The generic `ControlsBar` is unchanged by it (it consumes the
descriptor arrays the same way regardless of how a module builds them); only
the Stretch (external/config-driven declaration) touches the shared model.


Data-unit-duration-driven signal-cache storage
----------------------------------------------

🟡 **Priority: yellow** — the right way forward, but deferred. This is a
cross-cutting change to the SAB cache layout; the viewer must stay stable for
the next couple of weeks, so do not start it inside that window.

**State.** `BiosignalMutex` was designed to store its range bounds
(`RANGE_START` / `RANGE_END` / `RANGE_ALLOCATED`, all `Int32`) as **data-unit
counts**, with a separate `DATA_UNIT_DURATION` (`Int32`, milliseconds) field
carrying the unit duration so counts convert back to time. The second half was
never wired: every `initSignalBuffers` call leaves `dataUnitDurationMs` at its
`1000` default, and callers pass `dataLength = _totalDataLength` **in seconds**.
So the cache effectively assumes a fixed 1-second unit grid and `RANGE_END`
holds whole seconds in an `Int32`.

**Consequence.** A recording's total data length must land on whole seconds or
`RANGE_END` truncates — out-of-bounds insert warnings, the last partial second
lost. The CSV reader works around it with `ceil(sampleCount / samplingRate)`;
that padded count leaking into the *reported* recording length was the
phantom-tail bug, now resolved by reporting the true `_totalRecordingLength`
while keeping the padded `_totalDataLength` for the cache. `EdfReader` has **no
equivalent guard**: an EDF whose `dataRecordCount × dataRecordDuration` isn't a
whole number of seconds (e.g. sub-second records that don't sum to an integer)
hits the same truncation. Sub-millisecond record durations are a further
casualty, since the millisecond field can't represent them — currently moot
only because the field is unused.

**Finish it.** Populate `DATA_UNIT_DURATION` with the real record duration
through `initSignalBuffers` / `setupCache`, pass range values as true data-unit
counts rather than seconds, and route every unit↔time conversion through the
stored duration. That drops the 1-second assumption, lets the CSV reader remove
its `ceil` (and the `_totalRecordingLength` decoupling band-aid), and makes EDF
correct for any record duration.

**Scope.** `BiosignalMutex`, `GenericSignalReader` (setup, cache-fill, and the
`_cacheTimeToRecordingTime` / `_recordingTimeToCacheTime` conversions),
`MontageProcessor`, and the worker substitutes — plus contract coverage for a
fractional-second EDF and a non-1 s CSV. When it lands, update the EDF docs
(edf-reader README + docs.epicurrents.io) to drop the whole-second /
sub-millisecond caveat.


Documentation restructure (AGENTS.md / CLAUDE.md split)
------------------------------------------------------

🟢 **Priority: green** — deferred until the in-flight settings-event-bus work
lands, then worth doing.

**Why.** `CLAUDE.md` is gitignored (per-developer, unshareable), yet it holds
the only written record of the workspace conventions and per-package
architecture — so edits to it never reach other developers. Mirror the
platform's split: a committed, tool-agnostic `AGENTS.md` with a gitignored
`CLAUDE.md` that just imports it (`@AGENTS.md`).

**Scope it in two tiers**, as the platform does (lean `AGENTS.md` + per-app
READMEs), so no single file grows unbounded:

- Workspace `frontend/viewer/AGENTS.md` — cross-cutting only: version
  compliance, the build / test / `npm run typecheck` workflow, dependency-
  direction invariants (util is upstream of core, never the reverse),
  worker-bundle rules, comment conventions, and the platform-integration
  event-bus notes.
- Per-package `AGENTS.md` — each significant package (`core`, `interface`,
  `edf-reader`, `eeg-module`, …) carries its own, committed in that package's
  repo, holding its architecture and gotchas.

**Mostly classify-and-relocate + prune.** Today's `CLAUDE.md` mixes durable
conventions, per-package architecture, and transient session logs ("Analysis
roadmap (sessions)", "Session N deep-dive findings"). Conventions move to the
workspace `AGENTS.md`; architecture to the owning package; the session-log
framing is dropped, keeping the durable content and cutting the stale.

**First step.** A read-only audit of `CLAUDE.md` against the package layout,
producing a proposed file-by-file split for review before anything is written —
the scoping calls (which packages warrant a file, what is stale) need sign-off.
Update this file's intro line, which currently points readers at `CLAUDE.md`,
once done.
