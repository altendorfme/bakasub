import { DatabaseSchemaMismatchError } from '../database/init'

/** Text of the native dialog shown when startup fails (no window exists yet). */
export function bootFailureMessage(
  err: unknown,
  o: { packaged: boolean; dbPath: string; logPath: string }
): { title: string; body: string } {
  const title = 'BakaSub could not start'
  if (err instanceof DatabaseSchemaMismatchError) {
    const body = o.packaged
      ? `The database was created by a newer version of BakaSub, or it was changed outside the app.\n\nInstall the latest version. Details are in ${o.logPath}.`
      : `The development database does not match this build (${err.detail}). This happens after migration 0000 was regenerated.\n\nDelete ${o.dbPath}* and start the app again.`
    return { title, body }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { title, body: `${message}\n\nDetails are in ${o.logPath}.` }
}
