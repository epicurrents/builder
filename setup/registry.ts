/**
 * Module registrar registry.
 *
 * Maps a modality key (as it appears in a profile's `setup.activeModules`) to its
 * registrar. setup/index.ts runs the registrars for the active edition's modules,
 * or all of them when a profile requests every module (empty `activeModules`).
 *
 * Add a modality by writing setup/modules/<key>.ts and listing it here. A key can
 * only be added once the interface exports a UI module for it. ncs is in the full
 * profile but has no finished importer yet, so it is deliberately not registered.
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
