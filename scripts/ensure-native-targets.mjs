// Garante os binários nativos do libsql de outras plataformas para builds cruzados.
// O npm só instala optionalDependencies compatíveis com o host; aqui forçamos as demais.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const TARGETS = {
  linux: ['linux-x64-gnu'],
  win: ['win32-x64-msvc']
}

const wanted = process.argv.slice(2).flatMap((t) => TARGETS[t] ?? [])
const { version } = JSON.parse(readFileSync('node_modules/libsql/package.json', 'utf8'))
const missing = wanted.filter((t) => !existsSync(`node_modules/@libsql/${t}`))

if (missing.length) {
  console.log(`[native-targets] instalando: ${missing.join(', ')} @${version}`)
  execFileSync(
    'npm',
    ['install', '--no-save', '--force', ...missing.map((t) => `@libsql/${t}@${version}`)],
    { stdio: 'inherit' }
  )
}
