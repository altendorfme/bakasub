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

export type MediaType = 'movie' | 'series' | 'anime' | 'documentary' | 'other'

/**
 * Preset de tradução. Os embutidos (`builtin: true`, ids `builtin:*`) são imutáveis e não têm
 * modelo/idioma/glossário (usam as configurações padrão); os personalizados são criados do zero
 * ou copiados (`copiedFrom`).
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
  /** `null` = `translation.defaultModel`. */
  model: string | null
  /** BCP-47; `null` = `translation.defaultTargetLang`. */
  targetLang: string | null
  copiedFrom: string | null
  /** `null` nos embutidos. */
  createdAt: string | null
}

export type PresetInput = Pick<
  Preset,
  'name' | 'mediaType' | 'temperature' | 'prompt' | 'glossary' | 'model' | 'targetLang'
>

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
      /** Notas/contexto do usuário (sinopse, personagens…), até 4000 caracteres; vai no `<media>`. */
      notes?: string
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
      /** Notas/contexto do usuário (sinopse, personagens…), até 4000 caracteres; vai no `<media>`. */
      notes?: string
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

export type IpcError = { code: string; message: string }
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/** Canais request/response (ipcRenderer.invoke <-> ipcMain.handle). */
export interface IpcInvokeContract {
  'app:get-info': { req: void; res: AppInfo }
  'app:check-update': { req: void; res: AppUpdateInfo }
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
  'settings:api-key-status': { req: void; res: ApiKeyStatus }
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
}

export type InvokeChannel = keyof IpcInvokeContract
export type EventChannel = keyof IpcEventContract

/** Allowlists em runtime — o preload só expõe o que está listado aqui. */
export const INVOKE_CHANNELS = [
  'app:get-info',
  'app:check-update',
  'sidecars:check',
  'sidecars:install',
  'sidecars:cancel',
  'memory:stats',
  'memory:prune',
  'settings:set-api-key',
  'settings:clear-api-key',
  'settings:api-key-status',
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
  'jobs:progress'
] as const satisfies readonly EventChannel[]

/** Superfície tipada de `window.api`. */
export interface BakaSubApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>
    checkUpdate(): Promise<IpcResult<AppUpdateInfo>>
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
