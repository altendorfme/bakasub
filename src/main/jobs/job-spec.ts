import { dirname } from 'node:path'
import { z } from 'zod'
import type { JobCreateRequest, Profile } from '../../shared/ipc-contract'
import { AppError } from '../errors'
import { languageName } from '../llm/prompt-builder'
import { canonicalTag } from '../media/languages'
import { langFromFilename } from '../media/naming'
import {
  MAX_SUBTITLE_BYTES,
  MEDIA_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  validateInputFile,
  validateOutputDir
} from '../media/path-guard'

/** Cópia do perfil congelada no job: editar o perfil depois não muda o job nem o retry. */
export interface ProfileSnapshot {
  readonly id: number
  readonly name: string
  readonly model: string
  readonly glossary: Profile['glossary']
  readonly temperature: number
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
      readonly profile: ProfileSnapshot
      readonly targetLang: string
      readonly sourceLang?: string
    })
  | (Base &
      MuxSpecOptions & { readonly kind: 'mux'; readonly subtitles: readonly MuxSubtitleSpec[] })
  | (Base &
      MuxSpecOptions & {
        readonly kind: 'pipeline'
        readonly trackId: number
        readonly profile: ProfileSnapshot
        readonly targetLang: string
        readonly sourceLang?: string
        readonly alsoWriteSubtitle: boolean
      })

const path = z.string().min(1).max(4096)
const lang = z.string().min(1).max(64)
const trackId = z.number().int().min(0).max(10_000)
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
    profileId: z.number().int(),
    targetLang: lang.optional(),
    sourceLang: lang.optional(),
    outputDir: path.optional()
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
    profileId: z.number().int(),
    targetLang: lang.optional(),
    sourceLang: lang.optional(),
    outputDir: path.optional(),
    options: z
      .object({
        setDefault: z.boolean().optional(),
        keepOriginalSubtitles: z.boolean().optional(),
        alsoWriteSubtitle: z.boolean().optional()
      })
      .optional()
  })
]) satisfies z.ZodType<JobCreateRequest>

function requiredLang(tag: string): string {
  const t = canonicalTag(tag)
  if (!t) throw new AppError('INVALID_INPUT', `Invalid language tag: ${tag}`)
  return t
}
const optionalLang = (tag: string | undefined): string | undefined =>
  tag === undefined ? undefined : requiredLang(tag)

const snapshot = (p: Profile): ProfileSnapshot => ({
  id: p.id,
  name: p.name,
  model: p.model,
  glossary: p.glossary,
  temperature: p.temperature
})

/**
 * Pedido do renderer -> spec congelado. Revalida todos os caminhos no Main (o renderer nunca é
 * fonte confiável), copia o perfil e aplica os padrões. Lança `INVALID_INPUT`/`INVALID_PATH`.
 */
export async function resolveJobSpec(
  raw: JobCreateRequest,
  profiles: { get(id: number): Promise<Profile> }
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
      const profile = await profiles.get(req.profileId)
      return {
        ...base,
        kind: 'translate',
        profile: snapshot(profile),
        targetLang: requiredLang(req.targetLang ?? profile.targetLang),
        ...withLang(optionalLang(req.sourceLang) ?? langFromFilename(src.path))
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
      const profile = await profiles.get(req.profileId)
      return {
        ...base,
        kind: 'pipeline',
        trackId: req.trackId,
        profile: snapshot(profile),
        targetLang: requiredLang(req.targetLang ?? profile.targetLang),
        ...withLang(optionalLang(req.sourceLang)),
        setDefault: req.options?.setDefault ?? true,
        keepOriginalSubtitles: req.options?.keepOriginalSubtitles ?? true,
        alsoWriteSubtitle: req.options?.alsoWriteSubtitle ?? false
      }
    }
  }
}

const withLang = (sourceLang: string | undefined): { sourceLang?: string } =>
  sourceLang ? { sourceLang } : {}
