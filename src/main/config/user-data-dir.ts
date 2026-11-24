import { isAbsolute, join, resolve } from 'node:path'

/** Env var that forces the userData directory (tests, scripts, a second dev profile). */
export const USER_DATA_ENV = 'BAKASUB_USER_DATA'

/** Folder used by unpackaged builds (`electron-vite dev`), next to the installed `bakasub`. */
export const DEV_USER_DATA_DIR = 'bakasub-dev'

export interface UserDataInput {
  isPackaged: boolean
  /** `app.getPath('appData')`: Linux `~/.config`, Windows `%APPDATA%`. */
  appData: string
  env: Readonly<Record<string, string | undefined>>
  /** Base for a relative override. Defaults to `process.cwd()`. */
  cwd?: string
}

/**
 * Directory to pass to `app.setPath('userData')`, or `null` to keep Electron's default
 * (installed app: `<appData>/bakasub`). Precedence: env override > dev folder > default.
 * Pure: no `electron` import, so it is testable in Node.
 */
export function resolveUserDataDir(input: UserDataInput): string | null {
  const override = input.env[USER_DATA_ENV]?.trim()
  if (override)
    return isAbsolute(override) ? resolve(override) : resolve(input.cwd ?? process.cwd(), override)
  if (!input.isPackaged) return join(input.appData, DEV_USER_DATA_DIR)
  return null
}
