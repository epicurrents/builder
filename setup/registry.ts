/**
 * Module registrar registry.
 *
 * Maps a modality key (as it appears in a profile's `setup.activeModules`) to its
 * registrar. setup/index.ts runs the registrars for the active edition's modules,
 * or all of them when a profile requests every module (empty `activeModules`).
 *
 * Add a modality by writing setup/modules/<key>.ts and listing it here. A key can
 * only be added once the interface exports a UI module for it. ncs and tab have no
 * finished importer yet, so they are deliberately not registered.
 *
 * A registrar composes whatever packages its modality needs, and some of those are
 * not public: acc pulls acc-module and csv-reader. Rollup resolves a static import
 * before it can tree-shake what the import provides, so a build only avoids those
 * packages if trimming removes the registrar first — which needs a profile with a
 * non-empty `activeModules`. An empty list (or no profile at all) keeps every
 * registrar below and therefore requires every package to be installed, so it is a
 * maintainer's all-in build; public editions name their modules explicitly.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import { registerAcc } from './modules/acc'
import { registerEeg } from './modules/eeg'
import { registerEmg } from './modules/emg'
import { registerHtm } from './modules/htm'
import { registerPdf } from './modules/pdf'

/** A registrar composes one modality's core module, readers and interface UI. */
export type ModuleRegistrar = (ctx: SetupContext) => void | Promise<void>

export const MODULE_REGISTRARS: Record<string, ModuleRegistrar> = {
    acc: registerAcc,
    eeg: registerEeg,
    emg: registerEmg,
    htm: registerHtm,
    pdf: registerPdf,
}
