import { app } from 'electron'
import { resolveUserDataDir } from '../config/user-data-dir'

/*
 * Side-effect module: MUST be the first import of `src/main/index.ts`. ES imports are evaluated
 * in order, so this runs before the logger, the single-instance lock (keyed on userData), the
 * database and any `app.getPath('userData')`. It also has to run before `ready` (Chromium's
 * session data defaults to userData).
 */
const dir = resolveUserDataDir({
  isPackaged: app.isPackaged,
  appData: app.getPath('appData'),
  env: process.env
})
if (dir) app.setPath('userData', dir)
