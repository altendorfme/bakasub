import { app } from 'electron'
import { join } from 'node:path'

/**
 * Tudo vive em `app.getPath('userData')` (Linux: ~/.config/bakasub, Windows: %APPDATA%\bakasub).
 * A pasta de instalação não é usada: no AppImage ela é somente-leitura e no Windows
 * (perMachine=false) não é garantidamente gravável.
 */
export const paths = {
  userData: (): string => app.getPath('userData'),
  logs: (): string => join(app.getPath('userData'), 'logs'),
  bin: (): string => join(app.getPath('userData'), 'bin'),
  cache: (): string => join(app.getPath('userData'), 'cache'),
  database: (): string => join(app.getPath('userData'), 'bakasub.db'),
  migrations: (): string =>
    app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
}
