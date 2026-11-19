import type { Preset } from '../../shared/ipc-contract'
import type { PresetSource } from '../jobs/job-spec'

/** Só para testes. */
export const TEST_PRESET: Preset = {
  id: 'p-test',
  builtin: false,
  name: 'P',
  mediaType: 'anime',
  temperature: 0.3,
  prompt: 'Keep honorifics.',
  glossary: [{ source: 'senpai', rule: 'keep' }],
  model: 'a/b',
  targetLang: 'pt-BR',
  copiedFrom: null,
  createdAt: new Date(0).toISOString()
}

export function testPresetSource(
  presets: readonly Preset[] = [TEST_PRESET],
  defaults: Partial<Awaited<ReturnType<PresetSource['defaults']>>> = {}
): PresetSource {
  return {
    get: async (id) => {
      const p = presets.find((x) => x.id === id)
      if (!p) throw Object.assign(new Error('nf'), { code: 'PRESET_NOT_FOUND' })
      return p
    },
    defaults: async () => ({
      presetId: presets[0].id,
      model: null,
      targetLang: 'pt-BR',
      ...defaults
    })
  }
}
