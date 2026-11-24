/** Must match `appId` in electron-builder.yml (installed build). */
export const APP_USER_MODEL_ID = 'com.bakasub.app'

/** Suffix of every identity marker of an unpackaged build (`electron-vite dev`). */
export const DEV_SUFFIX = 'dev'

/**
 * Windows AppUserModelId: the dev build gets its own, so taskbar grouping, jump lists and toast
 * notifications never mix with the installed app. Pure: testable without `electron`.
 */
export function appUserModelId(isPackaged: boolean): string {
  return isPackaged ? APP_USER_MODEL_ID : `${APP_USER_MODEL_ID}.${DEV_SUFFIX}`
}

/** Window title: `BakaSub` installed, `BakaSub (dev)` unpackaged. */
export function windowTitle(title: string, isPackaged: boolean): string {
  const suffix = ` (${DEV_SUFFIX})`
  return isPackaged || title.endsWith(suffix) ? title : `${title}${suffix}`
}
