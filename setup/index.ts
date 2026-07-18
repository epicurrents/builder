/**
 * Builder-owned, config-driven setup — the official build entry.
 *
 * This is the production consumer of the framework (`createEpicurrentsApp` from
 * `@epicurrents/interface`). It replaces the interface's own `setups/standalone.ts`
 * as the build entry: the official build now originates from the builder (this
 * repo), not from the interface. `standalone.ts` is retained in the interface as
 * an example only.
 *
 * Registration is a consumer-scope composition. It spans the core packages (the
 * modality module, the readers, their study importers and workers — registered on
 * `ctx.app`) and the interface layer (the Vue UI module, registered via
 * `ctx.registerInterfaceModule`). A core-layer package cannot own the interface
 * step without depending on the interface and inverting the layering, so the
 * whole composition lives here, in the one place that legitimately sees both
 * layers. The per-modality registrars are in setup/modules/, keyed in
 * setup/registry.ts.
 *
 * The active edition is chosen by profile: the builder's vite config injects the
 * profile's SETUP (including `activeModules`) as `__EPI_SETUP__`, and the register
 * callback runs the registrars named in `activeModules` — or every registered
 * modality when `activeModules` is empty (the full edition).
 */
import {
    createEpicurrentsApp as createFrameworkApp,
    type ApplicationInterfaceConfig,
    type SetupContext,
} from '@epicurrents/interface'
import { memWorker, montWorker, trendWorker } from './workers'
import { MODULE_REGISTRARS } from './registry'

// Injected at build time by the builder's vite config from the active profile's
// `setup`. Undefined in a bare (profile-less) build, in which case every
// registered modality is used.
declare const __EPI_SETUP__: Partial<ApplicationInterfaceConfig> | undefined

const profileSetup: Partial<ApplicationInterfaceConfig> =
    typeof __EPI_SETUP__ !== 'undefined' ? __EPI_SETUP__ : {}

/** Register the shared workers, then the active edition's modality registrars. */
const register = async (ctx: SetupContext) => {
    const { app, useSAB, setup } = ctx
    if (useSAB) {
        app.setWorkerOverride('memory-manager', memWorker)
        app.setWorkerOverride('montage', montWorker)
        app.setWorkerOverride('trend', trendWorker)
    }
    const active = setup.activeModules?.length ? setup.activeModules : Object.keys(MODULE_REGISTRARS)
    for (const name of active) {
        const registrar = MODULE_REGISTRARS[name]
        if (!registrar) {
            console.warn(`No registrar for module '${name}'; skipping.`)
            continue
        }
        await registrar(ctx)
    }
}

/** Create the Epicurrents application for the active edition. */
export const createEpicurrentsApp = (config?: ApplicationInterfaceConfig) =>
    createFrameworkApp({ ...profileSetup, ...config }, register)
