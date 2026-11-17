/**
 * Video edition registrar.
 *
 * The browser decodes the file itself, so this composes only the interface's native media module with its own loader;
 * no reader package, worker or core module package is involved.
 * @package    epicurrents/builder
 * @copyright  2026 Sampsa Lohi
 * @license    Apache-2.0
 */
import type { SetupContext } from '@epicurrents/interface'
import { registerNativeMedia } from '@epicurrents/interface/modules/native'

/** Register the video player. */
export const registerVideo = (ctx: SetupContext) => registerNativeMedia(ctx, 'video')
