import { dirname } from 'node:path'
import { z } from 'zod'
import type {
  JobCreateRequest,
  JobMediaRequest,
  MediaContextLookup,
  MediaType,
  Preset
} from '../../shared/ipc-contract'
import { AppError } from '../errors'
import { languageName } from '../llm/prompt-builder'
import { MAX_USER_NOTES } from '../presets/preset.schema'
import { canonicalTag } from '../media/languages'
import { langFromFilename } from '../media/naming'
import {
  MAX_SUBTITLE_BYTES,
  MEDIA_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  validateInputFile,
  validateOutputDir
} from '../media/path-guard'

/**
 * Preset congelado no job, já RESOLVIDO (modelo e idioma decididos na criação): editar o preset
 * ou atualizar os embutidos depois não muda um job enfileirado nem o seu retry.
 */
export interface PresetSnapshot {
  readonly id: string
  readonly name: string
  readonly mediaType: MediaType
  readonly model: string
  readonly glossary: Preset['glossary']
  readonly temperature: number
  readonly prompt: string
}

/** Busca dos detalhes do TMDB para congelar no job. Falha = job sem contexto (`onError`). */
export interface MediaLookupSource {
  lookup(
    ref: JobMediaRequest['ref'],
    episode: { season?: number; episode?: number }
  ): Promise<MediaContextLookup>
  onError?: (err: unknown) => void
}

async function resolveMedia(
  req: JobMediaRequest | undefined,
  source: MediaLookupSource | undefined
): Promise<{ media?: MediaContextLookup }> {
  if (!req || !source) return {}
  try {
    return { media: await source.lookup(req.ref, { season: req.season, episode: req.episode }) }
  } catch (err) {
    source.onError?.(err)
    return {}
  }
}

/** Presets + padrões das configurações (`translation.*`). */
export interface PresetSource {
  get(id: string): Promise<Preset>
  defaults(): Promise<{ presetId: string; model: string | null; targetLang: string | null }>
}

interface Base {
  readonly source: string
  readonly sourceSize: number
  readonly outputDir: string
}
export interface MuxSpecOptions {
  readonly setDefault: boolean
  readonly keepOriginalSubtitles: boolean
}
export interface MuxSubtitleSpec {
  readonly path: string
  readonly size: number
  readonly language: string
  readonly name: string
  readonly default: boolean
}

export type JobSpec =
  | (Base & { readonly kind: 'extract'; readonly trackIds: readonly number[] })
  | (Base & {
      readonly kind: 'translate'
      readonly preset: PresetSnapshot
      readonly targetLang: string
      readonly sourceLang?: string
      /** Contexto do usuário (vai no `<media>`). */
      readonly notes?: string
      /** Detalhes do TMDB congelados na criação (retry usa os mesmos, mesmo offline). */
      readonly media?: MediaContextLookup
      readonly confirmBeforeTranslate: boolean
    })
  | (Base &
      MuxSpecOptions & { readonly kind: 'mux'; readonly subtitles: readonly MuxSubtitleSpec[] })
  | (Base &
      MuxSpecOptions & {
        readonly kind: 'pipeline'
        readonly trackId: number
        readonly preset: PresetSnapshot
        readonly targetLang: string
        readonly sourceLang?: string
        readonly alsoWriteSubtitle: boolean
        readonly notes?: string
        readonly media?: MediaContextLookup
        readonly confirmBeforeTranslate: boolean
      })

const path = z.string().min(1).max(4096)
const lang = z.string().min(1).max(64)
const trackId = z.number().int().min(0).max(10_000)
const episodeNumber = z.number().int().min(0).max(9999)
const mediaRequest = z.object({
  ref: z.object({
    provider: z.literal('tmdb'),
    id: z.number().int().positive(),
    kind: z.enum(['movie', 'series'])
  }),
  season: episodeNumber.optional(),
  episode: episodeNumber.optional()
}) satisfies z.ZodType<JobMediaRequest>
const muxOptions = z
  .object({ setDefault: z.boolean().optional(), keepOriginalSubtitles: z.boolean().optional() })
  .optional()

export const JobCreateRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('extract'),
    source: path,
    trackIds: z.array(trackId).min(1).max(64),
    outputDir: path.optional()
  }),
  z.object({
    kind: z.literal('translate'),
    source: path,
    presetId: z.string().min(1).max(64).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(MAX_USER_NOTES).optional(),
    media: mediaRequest.optional(),
    targetLang: lang.optional(),
    sourceLang: lang.optional(),
    outputDir: path.optional(),
    confirmBeforeTranslate: z.boolean().optional()
  }),
  z.object({
    kind: z.literal('mux'),
    source: path,
    subtitles: z
      .array(
        z.object({
          path,
          language: lang,
          name: z.string().trim().min(1).max(200).optional(),
          default: z.boolean().optional()
        })
      )
      .min(1)
      .max(32),
    outputDir: path.optional(),
    options: muxOptions
  }),
  z.object({
    kind: z.literal('pipeline'),
    source: path,
    trackId,
    presetId: z.string().min(1).max(64).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(MAX_USER_NOTES).optional(),
    media: mediaRequest.optional(),
    targetLang: lang.optional(),
    sourceLang: lang.optional(),
    outputDir: path.optional(),
    options: z
      .object({
        setDefault: z.boolean().optional(),
        keepOriginalSubtitles: z.boolean().optional(),
        alsoWriteSubtitle: z.boolean().optional()
      })
      .optional(),
    confirmBeforeTranslate: z.boolean().optional()
  })
]) satisfies z.ZodType<JobCreateRequest>

function requiredLang(tag: string): string {
  const t = canonicalTag(tag)
  if (!t) throw new AppError('INVALID_INPUT', `Invalid language tag: ${tag}`)
  return t
}
const optionalLang = (tag: string | undefined): string | undefined =>
  tag === undefined ? undefined : requiredLang(tag)

/** Preset (estilo) + modelo e idioma: o pedido manda; senão, os padrões das configurações. */
async function resolvePreset(
  req: { presetId?: string; model?: string; targetLang?: string },
  presets: PresetSource
): Promise<{ preset: PresetSnapshot; targetLang: string }> {
  const defaults = await presets.defaults()
  const p = await presets.get(req.presetId ?? defaults.presetId)
  const model = req.model ?? defaults.model
  if (!model) throw new AppError('MODEL_NOT_SET', 'No model in the request and no default model')
  const lang = req.targetLang ?? defaults.targetLang
  if (!lang)
    throw new AppError('TARGET_LANG_NOT_SET', 'No target language in the request and no default')
  return {
    preset: {
      id: p.id,
      name: p.name,
      mediaType: p.mediaType,
      model,
      glossary: p.glossary,
      temperature: p.temperature,
      prompt: p.prompt
    },
    targetLang: requiredLang(lang)
  }
}

const withNotes = (notes: string | undefined): { notes?: string } =>
  notes?.trim() ? { notes: notes.trim() } : {}

/**
 * Pedido do renderer -> spec congelado. Revalida todos os caminhos no Main (o renderer nunca é
 * fonte confiável), copia o preset e aplica os padrões. Lança `INVALID_INPUT`/`INVALID_PATH`.
 */
export async function resolveJobSpec(
  raw: JobCreateRequest,
  presets: PresetSource,
  media?: MediaLookupSource
): Promise<JobSpec> {
  const parsed = JobCreateRequestSchema.safeParse(raw)
  if (!parsed.success) throw new AppError('INVALID_INPUT', parsed.error.message)
  const req = parsed.data

  const sourceExts = req.kind === 'translate' ? SUBTITLE_EXTENSIONS : MEDIA_EXTENSIONS
  const src = await validateInputFile(
    req.source,
    sourceExts,
    req.kind === 'translate' ? MAX_SUBTITLE_BYTES : undefined
  )
  const outputDir = await validateOutputDir(req.outputDir ?? dirname(src.path))
  const base = { source: src.path, sourceSize: src.size, outputDir }

  switch (req.kind) {
    case 'extract':
      return {
        ...base,
        kind: 'extract',
        trackIds: [...new Set(req.trackIds)].sort((a, b) => a - b)
      }
    case 'translate': {
      const { preset, targetLang } = await resolvePreset(req, presets)
      return {
        ...base,
        kind: 'translate',
        preset,
        targetLang,
        ...withNotes(req.notes),
        ...(await resolveMedia(req.media, media)),
        ...withLang(optionalLang(req.sourceLang) ?? langFromFilename(src.path)),
        confirmBeforeTranslate: req.confirmBeforeTranslate ?? true
      }
    }
    case 'mux': {
      const subtitles: MuxSubtitleSpec[] = []
      for (const s of req.subtitles) {
        const f = await validateInputFile(s.path, SUBTITLE_EXTENSIONS, MAX_SUBTITLE_BYTES)
        const language = requiredLang(s.language)
        subtitles.push({
          path: f.path,
          size: f.size,
          language,
          name: s.name ?? languageName(language),
          default: s.default ?? ((req.options?.setDefault ?? true) && subtitles.length === 0)
        })
      }
      return {
        ...base,
        kind: 'mux',
        subtitles,
        setDefault: req.options?.setDefault ?? true,
        keepOriginalSubtitles: req.options?.keepOriginalSubtitles ?? true
      }
    }
    case 'pipeline': {
      const { preset, targetLang } = await resolvePreset(req, presets)
      return {
        ...base,
        kind: 'pipeline',
        trackId: req.trackId,
        preset,
        targetLang,
        ...withNotes(req.notes),
        ...(await resolveMedia(req.media, media)),
        ...withLang(optionalLang(req.sourceLang)),
        setDefault: req.options?.setDefault ?? true,
        keepOriginalSubtitles: req.options?.keepOriginalSubtitles ?? true,
        alsoWriteSubtitle: req.options?.alsoWriteSubtitle ?? false,
        confirmBeforeTranslate: req.confirmBeforeTranslate ?? true
      }
    }
  }
}

const withLang = (sourceLang: string | undefined): { sourceLang?: string } =>
  sourceLang ? { sourceLang } : {}
