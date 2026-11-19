/**
 * Contrato IPC único (fonte da verdade) compartilhado entre main, preload e renderer.
 * Não importar zod/electron aqui: o preload roda em sandbox e só pode `require('electron')`.
 */

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  arch: string
  electron: string
  userDataPath: string
}

export interface AppUpdateInfo {
  current: string
  latest: string
  updateAvailable: boolean
  /** `updatedAt` do version.json remoto. */
  publishedAt: string
  /** true quando o manifest veio do cache local (rede indisponível). */
  offline: boolean
}

export type SidecarState = 'ok' | 'missing' | 'outdated' | 'unsupported'

export interface SidecarToolStatus {
  name: string
  requiredVersion: string
  installedVersion: string | null
  state: SidecarState
  /** Caminho absoluto do executável quando instalado e íntegro. */
  path: string | null
}

export interface SidecarReport {
  checkedAt: string
  manifestUpdatedAt: string
  offline: boolean
  installDir: string
  tools: SidecarToolStatus[]
  /** true quando todas as ferramentas estão `ok`. */
  ready: boolean
}

export type SidecarInstallResult =
  { outcome: 'installed'; tools: string[] } | { outcome: 'declined' } | { outcome: 'cancelled' }

export type SidecarPhase = 'downloading' | 'extracting' | 'probing' | 'done'

export interface SidecarProgress {
  /** Ferramentas servidas pelo mesmo artefato, ex.: "mkvextract+mkvmerge". */
  archive: string
  phase: SidecarPhase
  received: number
  total: number | null
}

export interface MemoryStats {
  rows: number
  /** Bytes em disco da tabela e índices do Job Memory. */
  bytes: number
  /** ISO 8601 do `last_used_at` mais antigo; `null` com o cache vazio. */
  oldestUsedAt: string | null
}

/** "Não usado há mais de N dias", ou limpar tudo. */
export type MemoryPruneScope = 1 | 3 | 7 | 30 | 'all'

export interface MemoryPruneResult {
  deleted: number
  /** Estado depois do prune (o tamanho em disco já reflete o `incremental_vacuum`). */
  stats: MemoryStats
}

/**
 * Configurações que o renderer pode ler e alterar (`settings:get`/`settings:update`).
 * Chaves internas (ex.: `models.cache`) nunca aparecem aqui.
 */
export interface PublicSettings {
  'translation.defaultModel': string | null
  'translation.defaultTargetLang': string | null
  'translation.defaultPresetId': string
  'translation.targetLangs': string[]
  'models.favorites': string[]
  'jobs.concurrency': number
  'preflight.autoConfirmBelowUsd': number | null
  'tracks.preferredSourceLangs': string[]
  'logs.level': 'info' | 'debug'
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Uma linha do log (arquivo JSON por linha), já sem segredos. */
export interface LogEntry {
  /** ISO 8601 (linhas antigas, em texto puro, trazem o horário como estava). */
  time: string
  level: LogLevel
  /** `app`, `db`, `ipc`, `sidecar`, `llm`, `jobs`, `renderer`… */
  scope: string
  msg: string
  /** Presente em tudo que foi logado durante a execução de um job. */
  jobId?: string
  /** Erro (código + stack), stderr de ferramentas, corpo de resposta HTTP… */
  detail?: string
}

export interface LogTailQuery {
  /** 1..2000, padrão 500. */
  limit?: number
  minLevel?: LogLevel
  scopes?: string[]
  jobId?: string
}

export interface RendererErrorReport {
  level: 'warn' | 'error'
  message: string
  stack?: string
  /** `boundary` (React), `window` (onerror), `promise` (unhandledrejection). */
  source: 'boundary' | 'window' | 'promise'
}

/** Contexto de mídia (TMDB). `series` = TV no TMDB. */
export type MediaKind = 'movie' | 'series'

export interface MediaRef {
  provider: 'tmdb'
  id: number
  kind: MediaKind
}

/** URLs de arte são `bakasub-media://…`: o Main baixa e guarda em cache; o renderer nunca vai à rede. */
export interface MediaSearchResult extends MediaRef {
  title: string
  originalTitle?: string
  year?: number
  posterUrl?: string
}

export interface MediaDetails extends MediaSearchResult {
  genres: string[]
  /** Minutos (filme) ou duração típica do episódio (série). */
  runtime?: number
  synopsis: string
  backdropUrl?: string
}

export interface EpisodeDetails {
  season: number
  episode: number
  title: string
  synopsis?: string
}

/** O que o nome do arquivo diz sobre a mídia (parser de release). */
export interface ReleaseNameInfo {
  title: string
  year?: number
  season?: number
  episode?: number
  /** Numeração absoluta de anime (`Show - 28`): o usuário converte em temporada/episódio. */
  absoluteEpisode?: number
}

/**
 * Resultado da identificação automática. `matched` só quando o título (e o ano, se o nome tiver)
 * batem; senão `not-found` e o usuário busca. `no-key`: sem chave do TMDB (recurso opcional).
 */
export interface MediaIdentification {
  release: ReleaseNameInfo
  status: 'matched' | 'not-found' | 'no-key' | 'offline'
  match: MediaDetails | null
  episode: EpisodeDetails | null
}

export interface MediaContextLookup {
  details: MediaDetails
  episode: EpisodeDetails | null
}

export interface TmdbKeyStatus {
  present: boolean
}

export interface ApiKeyStatus {
  present: boolean
  /** `os`: protegida pelo cofre do sistema; `none`: sem keyring disponível (a UI deve avisar). */
  protection: 'os' | 'none'
}

export interface GlossaryEntry {
  source: string
  target?: string
  rule?: string
}

/** Rótulo livre ("Anime", "Sitcom"…); só informativo, não entra no prompt. */
export type MediaType = string

/**
 * Preset de tradução: só ESTILO (prompt, temperatura, glossário, tipo de mídia). Modelo e idioma
 * de destino são escolhidos por job (padrões nas configurações). Os embutidos (`builtin: true`,
 * ids `builtin:*`) são imutáveis; os personalizados são criados do zero ou copiados (`copiedFrom`).
 */
export interface Preset {
  id: string
  builtin: boolean
  name: string
  mediaType: MediaType
  temperature: number
  /** Orientação de estilo para o tipo de mídia (vai no System Prompt, antes das regras fixas). */
  prompt: string
  glossary: GlossaryEntry[]
  copiedFrom: string | null
  /** `null` nos embutidos. */
  createdAt: string | null
}

export type PresetInput = Pick<Preset, 'name' | 'mediaType' | 'temperature' | 'prompt' | 'glossary'>

/** Formatos de legenda em texto que o app lê, traduz e grava (a extensão do arquivo é o id). */
export type SubtitleTextFormat = 'srt' | 'ass' | 'ssa' | 'vtt'

export type JobKind = 'extract' | 'translate' | 'mux' | 'pipeline'
export type JobStatus =
  | 'queued'
  | 'running'
  /** Reservado para o preflight (inativo nesta versão). */
  | 'awaiting-confirmation'
  | 'completed'
  | 'completed-with-warnings'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
export type JobStep = 'probe' | 'extract' | 'preflight' | 'translate' | 'validate' | 'write' | 'mux'

export interface JobMediaRequest {
  ref: MediaRef
  season?: number
  episode?: number
}

export interface MuxOptions {
  /** A faixa nova vira `default` e as legendas originais perdem o `default`. Padrão `true`. */
  setDefault?: boolean
  /** Mantém as legendas originais no MKV novo. Padrão `true`. */
  keepOriginalSubtitles?: boolean
}

/** Pedido do renderer. Caminhos vêm do diálogo/drag & drop e são revalidados no Main. */
export type JobCreateRequest =
  | { kind: 'extract'; source: string; trackIds: number[]; outputDir?: string }
  | {
      kind: 'translate'
      source: string
      /** Padrão: `translation.defaultPresetId`. */
      presetId?: string
      /** Id OpenRouter. Padrão: `translation.defaultModel`. */
      model?: string
      /** Notas/contexto do usuário (sinopse, personagens…), até 4000 caracteres; vai no `<media>`. */
      notes?: string
      /**
       * Contexto do TMDB escolhido na UI (só quando "Include" está marcado). O Main busca os
       * detalhes e os congela no job.
       */
      media?: JobMediaRequest
      /** Padrão: `translation.defaultTargetLang`. */
      targetLang?: string
      sourceLang?: string
      outputDir?: string
      /** Para em `awaiting-confirmation` com a estimativa de custo. Padrão `true`. */
      confirmBeforeTranslate?: boolean
    }
  | {
      kind: 'mux'
      source: string
      subtitles: { path: string; language: string; name?: string; default?: boolean }[]
      outputDir?: string
      options?: MuxOptions
    }
  | {
      kind: 'pipeline'
      source: string
      trackId: number
      /** Padrão: `translation.defaultPresetId`. */
      presetId?: string
      /** Id OpenRouter. Padrão: `translation.defaultModel`. */
      model?: string
      /** Notas/contexto do usuário (sinopse, personagens…), até 4000 caracteres; vai no `<media>`. */
      notes?: string
      /**
       * Contexto do TMDB escolhido na UI (só quando "Include" está marcado). O Main busca os
       * detalhes e os congela no job.
       */
      media?: JobMediaRequest
      /** Padrão: `translation.defaultTargetLang`. */
      targetLang?: string
      sourceLang?: string
      outputDir?: string
      options?: MuxOptions & { alsoWriteSubtitle?: boolean }
      /** Para em `awaiting-confirmation` com a estimativa de custo. Padrão `true`. */
      confirmBeforeTranslate?: boolean
    }

export interface JobProgress {
  step: JobStep | null
  /** 0..1 dentro da etapa, quando conhecido. */
  stepFraction?: number
  /** Etapa de tradução. */
  translation?: {
    done: number
    total: number
    cached: number
    chunk?: { index: number; count: number }
  }
  cost?: number
}

export interface JobResult {
  outputs: string[]
  warnings: string[]
  usage?: {
    requests: number
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    cost: number
    costIncomplete: boolean
  }
  cache?: { hits: number; misses: number }
  failedLines?: { cueId: number; reason: string }[]
  /** Estimativa do preflight (a cobertura completa vem de `jobs:preflight`). */
  preflight?: PreflightEstimate
}

export interface Job {
  id: string
  kind: JobKind
  batchId: string | null
  status: JobStatus
  /** Etapa atual (running) ou onde parou (failed/cancelled/interrupted). */
  step: JobStep | null
  /** Nome do arquivo de origem (para listar sem expor o caminho completo à toa). */
  source: string
  progress: JobProgress
  result: JobResult | null
  error: { code: string; message: string } | null
  attempt: number
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface JobProgressEvent {
  id: string
  status: JobStatus
  progress: JobProgress
}

export interface SubtitleTrackInfo {
  id: number
  codecId: string
  /** `null` = não traduzível/extraível nesta versão (ver `unsupported`). */
  format: SubtitleTextFormat | null
  unsupported?: 'image-based' | 'no-parser'
  language?: string
  name?: string
  default: boolean
  forced: boolean
  eventCount?: number
}

export interface MediaProbe {
  subtitles: SubtitleTrackInfo[]
  attachments: number
}

export interface ModelSummary {
  id: string
  name: string
  contextLength: number | null
  maxCompletionTokens: number | null
  isModerated: boolean
  /** USD por token; `null` = preço dinâmico. */
  pricing: { prompt: number; completion: number } | null
  structuredOutputs: boolean
  responseFormat: boolean
  /** Família do tokenizer (GPT, Claude…): só GPT tem contagem local exata. */
  tokenizer?: string
}

export interface ModelList {
  models: ModelSummary[]
  fetchedAt: string
  offline: boolean
}

export type OpenDialogKind = 'media' | 'subtitle' | 'any'

export type BatchKind = 'extract' | 'translate' | 'pipeline'

export type BatchSource =
  { type: 'folder'; path: string; recursive?: boolean } | { type: 'files'; paths: string[] }

export interface BatchPlanRequest {
  kind: BatchKind
  source: BatchSource
}

export interface BatchPlanItem {
  path: string
  /** Relativo à pasta do batch (ou só o nome, para arquivos avulsos). */
  relPath: string
  /** Faixas do MKV (`extract`/`pipeline`). */
  tracks?: SubtitleTrackInfo[]
  /** Seleção automática: várias no `extract`, uma no `pipeline`, nenhuma no `translate`. */
  selected: number[]
  /** Arquivo sem o que processar (o usuário pode removê-lo do plano ou escolher outra faixa). */
  skipped?: 'no-subtitle-track' | 'no-supported-track' | 'probe-failed'
  error?: string
}

export interface BatchPlan {
  kind: BatchKind
  /** Pasta de origem (espelhamento) ou `null`. */
  root: string | null
  items: BatchPlanItem[]
  /** Caminhos recusados pelo validador (arquivos avulsos). */
  rejected: { path: string; reason: string }[]
  /** Pasta com mais arquivos que o limite. */
  truncated: boolean
}

export interface BatchCreateRequest {
  kind: BatchKind
  name?: string
  /** `plan.root`: revalidado; base do espelhamento quando há `outputDir`. */
  root: string | null
  items: { path: string; trackIds?: number[] }[]
  presetId?: string
  notes?: string
  targetLang?: string
  sourceLang?: string
  /** Sem `outputDir`: saída ao lado de cada arquivo. Com `outputDir` e `root`: estrutura espelhada. */
  outputDir?: string
  options?: MuxOptions & { alsoWriteSubtitle?: boolean }
  confirmBeforeTranslate?: boolean
}

export interface Batch {
  id: string
  name: string
  kind: BatchKind
  root: string | null
  createdAt: string
  total: number
  counts: Partial<Record<JobStatus, number>>
  /** `active` enquanto algum job não é terminal. */
  state: 'active' | 'finished'
  /** Soma das estimativas dos jobs em `awaiting-confirmation` (`cost: null` se algum preço é dinâmico). */
  preflight?: { awaiting: number; toTranslate: number; cost: Range | null; approximate: boolean }
}

export interface Range {
  low: number
  high: number
}

/** Estimativa do preflight (antes de qualquer chamada ao LLM). */
export interface PreflightEstimate {
  model: {
    id: string
    /** USD por token; `null` = preço dinâmico. */
    pricing: { prompt: number; completion: number } | null
    catalogFetchedAt: string | null
  }
  /** Tokenizer local (o200k) diferente do do modelo: faixa alargada em ±20%. */
  approximate: boolean
  lines: { total: number; cached: number; toTranslate: number; chunks: number }
  tokens: { input: Range; output: Range }
  /** USD; `null` quando o preço é dinâmico. */
  cost: Range | null
  /** Decisão tomada pelo job. */
  decision: 'auto-confirmed' | 'needs-confirmation' | 'confirmed'
}

export interface PresetImportResult {
  /** `null` se o diálogo foi cancelado. */
  path: string | null
  imported: Preset[]
  /** Entradas não importadas: inválidas (campo com problema) ou `name-taken` com `onConflict: 'skip'`. */
  skipped: { index: number; name?: string; reason: string }[]
}

/** `code` é um `ErrorCode` (ver `error-codes.ts`); tipado como string porque o Main é a fonte. */
export type IpcError = { code: string; message: string }
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/** Canais request/response (ipcRenderer.invoke <-> ipcMain.handle). */
export interface IpcInvokeContract {
  'app:get-info': { req: void; res: AppInfo }
  'app:check-update': { req: void; res: AppUpdateInfo }
  /** Só HTTPS para hosts da allowlist do Main (TMDB, OpenRouter); senão `URL_NOT_ALLOWED`. */
  'app:open-external': { req: { url: string }; res: { opened: true } }
  'sidecars:check': { req: void; res: SidecarReport }
  /** O Main exibe diálogo nativo de consentimento; sem aceite, nada é baixado. */
  'sidecars:install': { req: { tools: string[] }; res: SidecarInstallResult }
  'sidecars:cancel': { req: void; res: { cancelled: boolean } }
  'memory:stats': { req: void; res: MemoryStats }
  /** Recusado com `MEMORY_BUSY` enquanto houver job ativo. */
  'memory:prune': { req: { olderThanDays: MemoryPruneScope }; res: MemoryPruneResult }
  /** Somente escrita: a chave nunca volta ao renderer. */
  'settings:set-api-key': { req: { apiKey: string }; res: ApiKeyStatus }
  'settings:clear-api-key': { req: void; res: ApiKeyStatus }
  /** Validada no TMDB (`GET /configuration`) antes de ir para o vault: `TMDB_AUTH` se recusada. */
  'settings:set-tmdb-key': { req: { key: string }; res: TmdbKeyStatus }
  'settings:clear-tmdb-key': { req: void; res: TmdbKeyStatus }
  'settings:tmdb-key-status': { req: void; res: TmdbKeyStatus }
  /** Só o nome do arquivo é usado (nada é lido do disco). */
  'media:identify': { req: { name: string }; res: MediaIdentification }
  'media:search': { req: { query: string }; res: MediaSearchResult[] }
  'media:lookup': {
    req: { ref: MediaRef; season?: number; episode?: number }
    res: MediaContextLookup
  }
  'settings:api-key-status': { req: void; res: ApiKeyStatus }
  'settings:get': { req: void; res: PublicSettings }
  /** Patch parcial, validado por chave; aplica as regras de favoritos/idiomas (`SETTINGS_CONFLICT`). */
  'settings:update': { req: Partial<PublicSettings>; res: PublicSettings }
  /** Últimas entradas (mais antigas primeiro), de todos os arquivos rotacionados. */
  'logs:tail': { req: LogTailQuery; res: LogEntry[] }
  /** Liga/desliga o envio de `logs:entry` (só enquanto a tela de logs está aberta). */
  'logs:watch': { req: { on: boolean }; res: { watching: boolean } }
  'logs:open-folder': { req: void; res: { opened: boolean } }
  /** Diálogo nativo para salvar; home vira `~` e segredos são removidos. `null` = cancelado. */
  'logs:export': { req: void; res: { path: string | null } }
  /** Erro do renderer gravado no log (escopo `renderer`), com limite de taxa. */
  'logs:report': { req: RendererErrorReport; res: { accepted: boolean } }
  /** Embutidos primeiro, depois os personalizados. */
  'presets:list': { req: void; res: Preset[] }
  'presets:create': { req: PresetInput; res: Preset }
  /** `PRESET_READ_ONLY` nos embutidos. */
  'presets:update': { req: { id: string; preset: PresetInput }; res: Preset }
  /** Cópia editável (de embutido ou personalizado); nome padrão "<nome> (copy)". */
  'presets:duplicate': { req: { id: string; name?: string }; res: Preset }
  /** `PRESET_READ_ONLY` nos embutidos; `PRESET_IN_USE` enquanto um job não terminal o usa. */
  'presets:delete': { req: { id: string }; res: { deleted: true } }
  /** Diálogo nativo de salvar; `path: null` se cancelado. Embutidos também podem ser exportados. */
  'presets:export': { req: { ids: string[] }; res: { path: string | null; count: number } }
  /** Diálogo nativo de abrir (.json); sempre cria presets personalizados novos. */
  'presets:import': {
    req: { onConflict?: 'rename' | 'skip' }
    res: PresetImportResult
  }
  'models:list': { req: { force?: boolean }; res: ModelList }
  /** Faixas de legenda de um MKV (caminho revalidado no Main). */
  'media:probe': { req: { path: string }; res: MediaProbe }
  /** Diálogo nativo; caminhos já validados. `[]` se cancelado. */
  'dialog:open-files': {
    req: { kind: OpenDialogKind; multiple?: boolean }
    res: { paths: string[] }
  }
  'dialog:choose-output-dir': { req: void; res: { path: string | null } }
  /** Responde já com o job enfileirado; a execução é assíncrona (`jobs:progress`). */
  'jobs:create': { req: JobCreateRequest; res: Job }
  'jobs:list': { req: void; res: Job[] }
  'jobs:get': { req: { id: string }; res: Job }
  'jobs:cancel': { req: { id: string }; res: Job }
  'jobs:retry': { req: { id: string }; res: Job }
  'jobs:remove': { req: { id: string }; res: { removed: true } }
  /** `awaiting-confirmation` -> fila; retoma na tradução, sem reextrair nem reestimar. */
  'jobs:confirm': { req: { id: string }; res: Job }
  /** Estimativa + cobertura completa (o que não será traduzido, onde e por quê). */
  'jobs:preflight': {
    req: { id: string }
    res: { estimate: PreflightEstimate; coverage: unknown } | null
  }
  /** Pasta de entrada de um batch (legível). `null` se cancelado. */
  'dialog:open-folder': { req: void; res: { path: string | null } }
  /** Varre, faz o probe e pré-seleciona faixas; não cria nada. */
  'batches:plan': { req: BatchPlanRequest; res: BatchPlan }
  /** Cria o batch e todos os jobs numa transação (um item inválido recusa tudo). */
  'batches:create': { req: BatchCreateRequest; res: Batch }
  'batches:list': { req: void; res: Batch[] }
  'batches:get': { req: { id: string }; res: Batch }
  'batches:jobs': { req: { id: string }; res: Job[] }
  'batches:cancel': { req: { id: string }; res: Batch }
  /** Só batches sem jobs ativos; remove também os jobs. */
  'batches:remove': { req: { id: string }; res: { removed: true } }
  /** Confirma todos os jobs do batch em `awaiting-confirmation`. */
  'batches:confirm': { req: { id: string }; res: Batch }
}

/** Canais push (main -> renderer). Payload tipado por canal. */
export interface IpcEventContract {
  'sidecars:progress': SidecarProgress
  /** Throttle de 250 ms por job; transições de estado saem na hora. */
  'jobs:progress': JobProgressEvent
  /** Lotes a cada 250 ms, só enquanto `logs:watch` estiver ligado. */
  'logs:entry': LogEntry[]
}

export type InvokeChannel = keyof IpcInvokeContract
export type EventChannel = keyof IpcEventContract

/** Allowlists em runtime — o preload só expõe o que está listado aqui. */
export const INVOKE_CHANNELS = [
  'app:get-info',
  'app:check-update',
  'app:open-external',
  'sidecars:check',
  'sidecars:install',
  'sidecars:cancel',
  'memory:stats',
  'memory:prune',
  'settings:set-api-key',
  'settings:clear-api-key',
  'settings:set-tmdb-key',
  'settings:clear-tmdb-key',
  'settings:tmdb-key-status',
  'media:identify',
  'media:search',
  'media:lookup',
  'settings:api-key-status',
  'settings:get',
  'settings:update',
  'logs:tail',
  'logs:watch',
  'logs:open-folder',
  'logs:export',
  'logs:report',
  'presets:list',
  'presets:create',
  'presets:update',
  'presets:duplicate',
  'presets:delete',
  'presets:export',
  'presets:import',
  'models:list',
  'media:probe',
  'dialog:open-files',
  'dialog:choose-output-dir',
  'jobs:create',
  'jobs:list',
  'jobs:get',
  'jobs:cancel',
  'jobs:retry',
  'jobs:remove',
  'dialog:open-folder',
  'batches:plan',
  'batches:create',
  'batches:list',
  'batches:get',
  'batches:jobs',
  'batches:cancel',
  'batches:remove',
  'batches:confirm',
  'jobs:confirm',
  'jobs:preflight'
] as const satisfies readonly InvokeChannel[]
export const EVENT_CHANNELS = [
  'sidecars:progress',
  'jobs:progress',
  'logs:entry'
] as const satisfies readonly EventChannel[]

/** Superfície tipada de `window.api`. */
export interface BakaSubApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>
    checkUpdate(): Promise<IpcResult<AppUpdateInfo>>
    openExternal(url: string): Promise<IpcResult<{ opened: true }>>
  }
  sidecars: {
    check(): Promise<IpcResult<SidecarReport>>
    install(tools: string[]): Promise<IpcResult<SidecarInstallResult>>
    cancel(): Promise<IpcResult<{ cancelled: boolean }>>
  }
  memory: {
    stats(): Promise<IpcResult<MemoryStats>>
    prune(olderThanDays: MemoryPruneScope): Promise<IpcResult<MemoryPruneResult>>
  }
  settings: {
    setApiKey(apiKey: string): Promise<IpcResult<ApiKeyStatus>>
    clearApiKey(): Promise<IpcResult<ApiKeyStatus>>
    apiKeyStatus(): Promise<IpcResult<ApiKeyStatus>>
    setTmdbKey(key: string): Promise<IpcResult<TmdbKeyStatus>>
    clearTmdbKey(): Promise<IpcResult<TmdbKeyStatus>>
    tmdbKeyStatus(): Promise<IpcResult<TmdbKeyStatus>>
    get(): Promise<IpcResult<PublicSettings>>
    update(patch: Partial<PublicSettings>): Promise<IpcResult<PublicSettings>>
  }
  logs: {
    tail(query?: LogTailQuery): Promise<IpcResult<LogEntry[]>>
    watch(on: boolean): Promise<IpcResult<{ watching: boolean }>>
    openFolder(): Promise<IpcResult<{ opened: boolean }>>
    export(): Promise<IpcResult<{ path: string | null }>>
    report(report: RendererErrorReport): Promise<IpcResult<{ accepted: boolean }>>
  }
  presets: {
    list(): Promise<IpcResult<Preset[]>>
    create(preset: PresetInput): Promise<IpcResult<Preset>>
    update(id: string, preset: PresetInput): Promise<IpcResult<Preset>>
    duplicate(id: string, name?: string): Promise<IpcResult<Preset>>
    delete(id: string): Promise<IpcResult<{ deleted: true }>>
    export(ids: string[]): Promise<IpcResult<{ path: string | null; count: number }>>
    import(onConflict?: 'rename' | 'skip'): Promise<IpcResult<PresetImportResult>>
  }
  models: {
    list(force?: boolean): Promise<IpcResult<ModelList>>
  }
  media: {
    probe(path: string): Promise<IpcResult<MediaProbe>>
    identify(name: string): Promise<IpcResult<MediaIdentification>>
    search(query: string): Promise<IpcResult<MediaSearchResult[]>>
    lookup(
      ref: MediaRef,
      episode?: { season: number; episode: number }
    ): Promise<IpcResult<MediaContextLookup>>
  }
  dialog: {
    openFiles(kind: OpenDialogKind, multiple?: boolean): Promise<IpcResult<{ paths: string[] }>>
    chooseOutputDir(): Promise<IpcResult<{ path: string | null }>>
    openFolder(): Promise<IpcResult<{ path: string | null }>>
  }
  batches: {
    plan(request: BatchPlanRequest): Promise<IpcResult<BatchPlan>>
    create(request: BatchCreateRequest): Promise<IpcResult<Batch>>
    list(): Promise<IpcResult<Batch[]>>
    get(id: string): Promise<IpcResult<Batch>>
    jobs(id: string): Promise<IpcResult<Job[]>>
    cancel(id: string): Promise<IpcResult<Batch>>
    remove(id: string): Promise<IpcResult<{ removed: true }>>
    confirm(id: string): Promise<IpcResult<Batch>>
  }
  jobs: {
    create(request: JobCreateRequest): Promise<IpcResult<Job>>
    list(): Promise<IpcResult<Job[]>>
    get(id: string): Promise<IpcResult<Job>>
    cancel(id: string): Promise<IpcResult<Job>>
    retry(id: string): Promise<IpcResult<Job>>
    remove(id: string): Promise<IpcResult<{ removed: true }>>
    confirm(id: string): Promise<IpcResult<Job>>
    preflight(
      id: string
    ): Promise<IpcResult<{ estimate: PreflightEstimate; coverage: unknown } | null>>
  }
  files: {
    /** Drag & drop: caminho real de um `File` (`webUtils.getPathForFile`). Revalidado no Main. */
    pathFor(file: File): string
  }
  events: {
    on<C extends EventChannel>(
      channel: C,
      listener: (payload: IpcEventContract[C]) => void
    ): () => void
  }
}
