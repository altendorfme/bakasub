import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SecretsRepository } from '../database/repositories/secrets.repository'
import { SecretVault, type SafeStorageLike } from './secret-vault'
import { openTestDatabase } from '../database/test-db'

/** safeStorage falso: "cifra" invertendo bytes com prefixo, como um backend do SO. */
function fakeSafe(
  available = true,
  backend = 'gnome_libsecret'
): SafeStorageLike & { broken: boolean } {
  return {
    broken: false,
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => backend,
    encryptString(s) {
      return Buffer.concat([Buffer.from('OS:'), Buffer.from(s, 'utf8').reverse()])
    },
    decryptString(b) {
      if (this.broken) throw new Error('keyring changed')
      return Buffer.from(b.subarray(3)).reverse().toString('utf8')
    }
  }
}

let t: Awaited<ReturnType<typeof openTestDatabase>>
let repo: SecretsRepository
beforeEach(async () => {
  t = await openTestDatabase()
  repo = new SecretsRepository(t.db)
})
afterEach(() => t.close())

describe('SecretVault', () => {
  it('set/get/has/delete com proteção do SO', async () => {
    const v = await SecretVault.open(repo, fakeSafe())
    expect(v.protection).toBe('os')
    expect(await v.has('openrouter.apiKey')).toBe(false)
    await v.set('openrouter.apiKey', 'sk-or-123')
    expect(await v.get('openrouter.apiKey')).toBe('sk-or-123')
    expect(await v.has('openrouter.apiKey')).toBe(true)
    await v.delete('openrouter.apiKey')
    expect(await v.get('openrouter.apiKey')).toBeNull()
  })

  it('o banco nunca contém o segredo nem a chave mestra em claro', async () => {
    const v = await SecretVault.open(repo, fakeSafe())
    await v.set('openrouter.apiKey', 'sk-or-SEGREDO')
    const rows = await t.client.execute('SELECT * FROM secrets')
    expect(JSON.stringify(rows.rows)).not.toContain('SEGREDO')
    const ct = rows.rows[0].ciphertext as ArrayBuffer
    expect(Buffer.from(ct).toString('utf8')).not.toContain('SEGREDO')
  })

  it('reabrir usa a mesma chave mestra (persistida)', async () => {
    const safe = fakeSafe()
    await (await SecretVault.open(repo, safe)).set('openrouter.apiKey', 'abc')
    expect(await (await SecretVault.open(repo, safe)).get('openrouter.apiKey')).toBe('abc')
  })

  it('AAD: ciphertext copiado para outra chave não decifra', async () => {
    const v = await SecretVault.open(repo, fakeSafe())
    await v.set('outra.chave' as never, 'abc')
    await t.client.execute(
      "INSERT INTO secrets (key, ciphertext, iv, tag, key_version) SELECT 'openrouter.apiKey', ciphertext, iv, tag, key_version FROM secrets WHERE key = 'outra.chave'"
    )
    expect(await v.get('outra.chave' as never)).toBe('abc')
    expect(await v.get('openrouter.apiKey')).toBeNull()
  })

  it('ciphertext adulterado: get devolve null (e não lança)', async () => {
    const v = await SecretVault.open(repo, fakeSafe())
    await v.set('openrouter.apiKey', 'abc')
    await t.client.execute('UPDATE secrets SET tag = zeroblob(16)')
    expect(await v.get('openrouter.apiKey')).toBeNull()
  })

  it("sem safeStorage ou backend basic_text: protection 'none'", async () => {
    expect((await SecretVault.open(repo, null)).protection).toBe('none')
    const t2 = await openTestDatabase()
    const v2 = await SecretVault.open(new SecretsRepository(t2.db), fakeSafe(true, 'basic_text'))
    expect(v2.protection).toBe('none')
    await v2.set('openrouter.apiKey', 'x')
    expect(await v2.get('openrouter.apiKey')).toBe('x')
    t2.close()
  })

  it("'none' é promovida a 'os' quando o SO fica disponível, preservando os segredos", async () => {
    const v = await SecretVault.open(repo, null)
    await v.set('openrouter.apiKey', 'abc')
    const promoted = await SecretVault.open(repo, fakeSafe())
    expect(promoted.protection).toBe('os')
    expect(await promoted.get('openrouter.apiKey')).toBe('abc')
  })

  it('chave mestra irrecuperável (keyring trocado): cofre recriado, segredos descartados', async () => {
    const safe = fakeSafe()
    await (await SecretVault.open(repo, safe)).set('openrouter.apiKey', 'abc')
    safe.broken = true
    const v = await SecretVault.open(repo, safe)
    expect(v.recovered).toBe(true)
    expect(await v.get('openrouter.apiKey')).toBeNull()
    safe.broken = false
    await v.set('openrouter.apiKey', 'novo')
    expect(await (await SecretVault.open(repo, safe)).get('openrouter.apiKey')).toBe('novo')
  })
})
