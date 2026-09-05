/**
 * Pyodide analysis service registrar.
 *
 * Registers the Python interpreter the EEG analysis tools (power spectrum, source
 * localization, topomaps) run their scripts in. Activated per session by the
 * `?services=pyodide` / `?advanced` URL flag, which the framework resolves into
 * `setup.usePyodide` before this runs; an edition never registers it unasked.
 *
 * **The signal path stays in JavaScript.** The service is registered under
 * `pyodide` and nothing else — in particular the `montage` and `eeg-montage`
 * worker overrides are left alone, so montage derivation and filtering keep
 * running in core's own inlined montage worker. Pointing those at the interpreter
 * (as `setups/full.example.ts` does under shared memory) moves filtering into
 * scipy and makes every recording wait for Pyodide, its packages and the
 * biosignal script before a single trace can be drawn — tens of seconds for a
 * capability most sessions never open. The tools await the service themselves, so
 * activating it here costs a background download and nothing on the open path.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import { PyodideService } from '@epicurrents/pyodide-service'
import { pyodideWorker } from '../workers/pyodide'

/** Register the Pyodide interpreter service and start loading it in the background. */
export const registerPyodide = ({ app, setup }: SetupContext) => {
    app.setWorkerOverride('pyodide', pyodideWorker)
    const service = new PyodideService()
    app.registerService('pyodide', service)
    // `indexURL` is passed only when the deployment self-hosts a distribution, because it also
    // selects how packages are resolved: with it, everything must come from that folder's
    // `pyodide-lock.json` (which a self-hosted deployment extends with mne); without it, the
    // service falls back to its own pinned upstream distribution and micropip-installs the extras
    // that upstream no longer bundles. Handing it an upstream CDN path takes the first branch
    // against a lock that has no mne, and package loading fails.
    service.setupWorker({
        ...(setup.pyodideAssetPath ? { indexURL: setup.pyodideAssetPath } : {}),
        packages: ['matplotlib', 'mne'],
    })
}
