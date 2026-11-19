import { randomUUID } from 'node:crypto'
import type { Preset, PresetInput } from '../../shared/ipc-contract'
import type { PresetRepository, PresetRow } from '../database/repositories/preset.repository'
import { AppError } from '../errors'
import { BUILTIN_PRESETS, isBuiltinId } from './builtin-presets'
import { buildPresetFile, parsePresetFile, type PresetFile } from './preset-file'
import { PresetInputSchema, type PresetData } from './preset.schema'

function toDto(r: PresetRow): Preset {
  return {
    id: r.id,
    builtin: false,
    name: r.name,
    mediaType: r.mediaType,
    temperature: r.temperature,
    prompt: r.prompt,
    glossary: r.glossary,
    model: r.model,
    targetLang: r.targetLang,
    copiedFrom: r.copiedFrom,
    createdAt: r.createdAt.toISOString()
  }
}

function parse(input: PresetInput): PresetData {
  const r = PresetInputSchema.safeParse(input)
  if (!r.success) throw new AppError('INVALID_INPUT', r.error.message)
  return r.data
}

const readOnly = (id: string): AppError =>
  new AppError('PRESET_READ_ONLY', `Built-in preset ${id} cannot be changed; duplicate it instead`)

/** Presets embutidos (código, imutáveis) + personalizados (banco). */
export class PresetService {
  private readonly newId: () => string
  constructor(
    private readonly repo: PresetRepository,
    private readonly deps: {
      isInUse: (id: string) => boolean | Promise<boolean>
      newId?: () => string
    }
  ) {
    this.newId = deps.newId ?? randomUUID
  }

  async list(): Promise<Preset[]> {
    return [...BUILTIN_PRESETS.map(clone), ...(await this.repo.list()).map(toDto)]
  }

  async get(id: string): Promise<Preset> {
    const builtin = BUILTIN_PRESETS.find((p) => p.id === id)
    if (builtin) return clone(builtin)
    const r = isBuiltinId(id) ? null : await this.repo.get(id)
    if (!r) throw new AppError('PRESET_NOT_FOUND', `Preset ${id} not found`)
    return toDto(r)
  }

  async create(input: PresetInput): Promise<Preset> {
    return this.insert(parse(input), null)
  }

  /** Cópia editável; o nome padrão é "<nome> (copy)", "(copy 2)"… até ficar livre. */
  async duplicate(id: string, name?: string): Promise<Preset> {
    const src = await this.get(id)
    const data = parse({
      name: name ?? (await this.freeName(`${src.name} (copy)`)),
      mediaType: src.mediaType,
      temperature: src.temperature,
      prompt: src.prompt,
      glossary: src.glossary,
      model: src.model,
      targetLang: src.targetLang
    })
    return this.insert(data, src.id)
  }

  /** Arquivo de troca com os presets pedidos (embutidos inclusive), na ordem dada. */
  async exportPresets(ids: readonly string[]): Promise<PresetFile> {
    if (ids.length === 0) throw new AppError('INVALID_INPUT', 'No presets to export')
    const list: Preset[] = []
    for (const id of ids) list.push(await this.get(id))
    return buildPresetFile(list)
  }

  /**
   * Importa como presets personalizados novos (nunca sobrescreve). Nomes já usados (embutidos,
   * existentes ou repetidos no próprio arquivo): `rename` -> "<nome> (imported)", "(imported 2)"…;
   * `skip` -> ignorado. Entradas inválidas são relatadas; as válidas entram numa transação.
   */
  async importPresets(
    text: string,
    options: { onConflict?: 'rename' | 'skip' } = {}
  ): Promise<{ imported: Preset[]; skipped: { index: number; name?: string; reason: string }[] }> {
    const parsed = parsePresetFile(text)
    const skipped: { index: number; name?: string; reason: string }[] = parsed.invalid.map((i) => ({
      ...i
    }))
    const reserved = new Set<string>()
    const taken = async (name: string): Promise<boolean> =>
      reserved.has(name.toLowerCase()) || (await this.nameTaken(name))

    const rows: { index: number; id: string; values: PresetData & { copiedFrom: null } }[] = []
    for (const { index, data } of parsed.valid) {
      let name = data.name
      if (await taken(name)) {
        if (options.onConflict === 'skip') {
          skipped.push({ index, name, reason: 'name-taken' })
          continue
        }
        name = await this.freeName(`${data.name} (imported)`, taken)
      }
      reserved.add(name.toLowerCase())
      rows.push({ index, id: this.newId(), values: { ...data, name, copiedFrom: null } })
    }
    const inserted = await this.repo.insertMany(rows)
    return {
      imported: inserted.map(toDto),
      skipped: skipped.sort((a, b) => a.index - b.index)
    }
  }

  async update(id: string, input: PresetInput): Promise<Preset> {
    if (isBuiltinId(id)) throw readOnly(id)
    const data = parse(input)
    if (!(await this.repo.get(id))) throw new AppError('PRESET_NOT_FOUND', `Preset ${id} not found`)
    await this.assertNameFree(data.name, id)
    const r = await this.repo.update(id, data)
    if (!r) throw new AppError('PRESET_NOT_FOUND', `Preset ${id} not found`)
    return toDto(r)
  }

  async delete(id: string): Promise<void> {
    if (isBuiltinId(id)) throw readOnly(id)
    if (await this.deps.isInUse(id))
      throw new AppError('PRESET_IN_USE', `Preset ${id} is used by an active job`)
    if (!(await this.repo.delete(id)))
      throw new AppError('PRESET_NOT_FOUND', `Preset ${id} not found`)
  }

  private async insert(data: PresetData, copiedFrom: string | null): Promise<Preset> {
    await this.assertNameFree(data.name)
    return toDto(await this.repo.insert(this.newId(), { ...data, copiedFrom }))
  }

  private async nameTaken(name: string, exceptId?: string): Promise<boolean> {
    const lower = name.toLowerCase()
    if (BUILTIN_PRESETS.some((p) => p.name.toLowerCase() === lower)) return true
    const other = await this.repo.findByName(name)
    return !!other && other.id !== exceptId
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    if (await this.nameTaken(name, exceptId))
      throw new AppError('PRESET_NAME_TAKEN', `Preset name already exists: ${name}`)
  }

  /** `base` = "<nome> (copy)" ou "<nome> (imported)"; colisões viram "(copy 2)", "(imported 2)"… */
  private async freeName(
    base: string,
    taken: (name: string) => Promise<boolean> = (n) => this.nameTaken(n)
  ): Promise<string> {
    if (!(await taken(base))) return base
    const m = / \((copy|imported)\)$/.exec(base)
    const stem = m ? base.slice(0, m.index) : base
    const word = m?.[1] ?? 'copy'
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${word} ${n})`
      if (!(await taken(candidate))) return candidate
    }
  }
}

function clone(p: Readonly<Preset>): Preset {
  return { ...p, glossary: [...p.glossary] }
}
