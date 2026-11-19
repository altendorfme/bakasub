# BakaSub

🇬🇧 [English](./README.md) · 🇧🇷 **Português**

Aplicação desktop para extrair, traduzir com IA e remuxar legendas de vídeos `.mkv`.

> Status: **infraestrutura base, parsers SRT e ASS/SSA, cache Job Memory, camada de tradução LLM, Job Manager (com modo batch) e preflight de custo concluídos** (IPC, banco, sidecars, build/release, AST de legendas lossless). A UI ainda não foi implementada. Veja o [roadmap](#roadmap).

## Stack

| Camada            | Tecnologia                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Wrapper / backend | Electron (Main Process em Node.js + TypeScript)                                                            |
| Frontend          | React 19 (Vite) + Tailwind CSS v4 + TanStack Query                                                         |
| Comunicação       | IPC nativo estrito: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, bridge no preload |
| Banco             | SQLite (WAL) via Drizzle ORM + driver LibSQL                                                               |
| Validação         | Zod (IPC e manifests)                                                                                      |
| LLM               | OpenRouter via SSE (`fetch` nativo)                                                                        |
| Sidecars          | mkvtoolnix (`mkvextract`/`mkvmerge`) e ffmpeg via `child_process`                                          |
| Logs              | `electron-log` com rotação em `userData/logs`                                                              |

Runtime: Node **26** no tooling (`.nvmrc`). O Main Process roda no Node embutido do Electron 44 (24.x), por isso `@types/node` permanece em `^24`.

## Desenvolvimento

```bash
nvm use            # Node 26
npm install
npm run dev        # electron-vite com HMR
```

| Script                            | Função                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| `npm run typecheck`               | `tsc` para main/preload (`node`) e renderer (`web`)           |
| `npm run lint` / `format`         | ESLint / Prettier                                             |
| `npm run db:generate`             | Gera migration Drizzle a partir de `src/main/database/schema` |
| `npm run db:check`                | Valida consistência das migrations                            |
| `npm run build`                   | Typecheck + `electron-vite build`                             |
| `npm run dist:linux` / `dist:win` | Empacota em runner nativo (usado pelo CI)                     |
| `npm run build:win`               | Gera o instalador Windows a partir do Linux (wine em Docker)  |
| `npm run build:all`               | Linux + Windows localmente                                    |
| `npm run clean`                   | Remove `out/`, `dist/` e cache do ESLint                      |

Plataformas suportadas: **Linux x64** e **Windows x64**. Não há build para macOS.

## Estrutura

```
src/
  main/
    config/        paths (userData), URLs remotas
    database/      client (WAL, migrate no boot), schema/, repositories/
    ipc/           create-handler (valida sender + Zod), register, handlers/ por domínio
    logging/       electron-log (scopes: app, db, ipc, sidecar, llm)
    services/      shutdown-coordinator, app-info, app-update, consentimento nativo
    sidecars/      módulo de sidecars (sem dependência de `electron`, testável em Node puro)
    parsers/       parsing de legendas: decoder, AST comum, SRT, ASS/SSA, segmentação, cobertura (puro, testável)
    llm/           cliente OpenRouter (SSE), catálogo de modelos, chunking, prompts, retries, translateDocument
    memory/        Job Memory: context hash e serviço de cache
    media/         fachada do mkvtoolnix (probe/extract/mux), idiomas, nomes de saída, validação de caminhos
    jobs/          fila de jobs, runner, etapas (probe/extract/translate/validate/write/mux), specs
    batch/         planejamento de batch (varredura, probe, seleção de faixas) e serviço de batch
    preflight/     contagem de tokens (js-tiktoken) e estimativa de custo
    profiles/      schema e serviço de perfis
    settings/      registro tipado de configurações e o cofre de segredos cifrado
    window/        criação da BrowserWindow
  preload/         única superfície exposta ao renderer (window.api), com allowlist
  renderer/        React + Tailwind + TanStack Query
  shared/          contrato IPC tipado e utilitários puros (sem zod/electron)
drizzle/           migrations versionadas
scripts/           build cruzado (Docker/wine) e binários nativos
```

### Contrato IPC

`src/shared/ipc-contract.ts` é a fonte única de verdade para canais, payloads e `window.api`. O preload expõe apenas canais presentes nas allowlists `INVOKE_CHANNELS`/`EVENT_CHANNELS`; nunca o `ipcRenderer`. Todo handler passa por `createHandler`, que:

1. rejeita `senderFrame` fora da origem do app;
2. valida o payload com Zod;
3. devolve o envelope `{ ok, data } | { ok, error: { code, message } }`, mapeando `AppError` para códigos estáveis.

Para adicionar um canal: declarar em `IpcInvokeContract` + allowlist, expor em `BakaSubApi`/preload e registrar um handler em `src/main/ipc/handlers/`.

### Shutdown gracioso

`ShutdownCoordinator` executa disposers em ordem LIFO, com timeout global, no `before-quit` e em `SIGINT`/`SIGTERM`. Primeiro aborta os jobs em execução (marcando-os `interrupted`), depois libera os processos filhos dos sidecars (SIGTERM → SIGKILL), as escritas do Job Memory e o banco (`wal_checkpoint(TRUNCATE)`).

## Dados do usuário

Tudo fica em `app.getPath('userData')` (Linux: `~/.config/bakasub`, Windows: `%APPDATA%\bakasub`), nunca na pasta de instalação:

```
bakasub.db            SQLite (WAL)
logs/main.log         rotação em 5 MB
cache/manifests/      último manifest remoto válido (fallback offline)
bin/                  sidecars (ver abaixo)
```

## Sidecars

ffmpeg e mkvtoolnix **não são empacotados**. O app lê dois manifests do repositório [`bakasub-manifests`](https://github.com/lsilvatti/bakasub-manifests):

- `version.json` — versão mais recente do app (apenas notifica; não baixa nem instala nada);
- `sidecar.json` — URL, SHA-256, tipo de arquivo e caminho do binário por `tool × plataforma × arquitetura`.

Regras de segurança e comportamento:

- **Nunca baixa automaticamente.** `sidecars:check` só consulta metadados. `sidecars:install` exige um diálogo nativo no Main (padrão "Cancelar"), que um renderer comprometido não consegue aprovar.
- Download em streaming com SHA-256 calculado on-the-fly, **resume por HTTP Range** (`If-Range` com ETag/Last-Modified) e retry com backoff. O `.part` sobrevive a falhas, cancelamentos e reinícios. Divergência de hash descarta o arquivo.
- Redirects para `http` são recusados; manifests remotos inválidos nunca caem no cache.
- Extração via `7zip-bin` (zip/7z) e `--appimage-extract`. `binaryRelativePath` é validado contra path traversal.
- **Poda:** após extrair, mantém só os binários e suas dependências (fecho de `DT_NEEDED` lido do ELF no Linux; DLLs vizinhas no Windows). A cópia podada é validada antes de ser adotada; se falhar, mantém a árvore completa.
- Cada binário é executado (`--version`/`-version`) antes de ser registrado em `bin/installed.json`.
- Artefatos são deduplicados por SHA-256 em `bin/archives/<sha256>/` (mkvextract e mkvmerge compartilham um único download).

Consumo no código de negócio:

```ts
const { path, env } = await sidecars.resolve('mkvmerge')
// `env` é obrigatório: no Linux injeta LD_LIBRARY_PATH para as libs do AppImage extraído
```

Toda execução de CLI externo deve passar pelo `ProcessRunner` (timeout, SIGTERM→SIGKILL, captura de stderr no log, rastreio para o shutdown).

> Observação para o parser de legendas: `mkvextract` grava `.srt` com **BOM UTF-8**; o lexer deve descartá-lo antes de ler o primeiro cue.

## Banco de dados

SQLite em modo WAL (`synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`), com migrations Drizzle aplicadas no boot (`drizzle/` é copiado para `resources/` no pacote). Tabelas atuais: `profiles` (inclui glossário/termbase) e `job_memory` (cache de linhas traduzidas, chave única `context_hash + target_lang + model + glossary_hash`; veja [`docs/job-memory.md`](./docs/job-memory.md)).

## Releases

O workflow `.github/workflows/release.yml` é disparado por tags `v*` (a tag precisa ser igual à versão do `package.json`) e gera, em runners nativos:

| Artefato                                | Origem  |
| --------------------------------------- | ------- |
| `bakasub-<v>.AppImage`                  | Linux   |
| `bakasub-<v>-linux-x64-unpacked.tar.gz` | Linux   |
| `bakasub-<v>-setup.exe` (NSIS)          | Windows |
| `bakasub-<v>-win-x64-unpacked.zip`      | Windows |
| `SHA256SUMS.txt`                        | —       |

Cada job executa lint, `db:check`, typecheck, build e um smoke test do binário desempacotado (o app precisa registrar `database ready`, validando libsql e migrations no SO real). A release é criada como **rascunho**.

```bash
git tag v0.0.1 && git push origin v0.0.1
```

Para testar sem criar release, rode o workflow manualmente (`workflow_dispatch`).

Notas: o `linux-unpacked` exige `--no-sandbox` ou `chrome-sandbox` com suid (`chown root` + `chmod 4755`); os binários não são assinados (SmartScreen avisará no Windows).

## Documentação detalhada

Fluxos do sistema em [`docs/`](./docs) (em inglês): [IPC](./docs/ipc.md) · [Sidecars](./docs/sidecars.md) · [Banco de dados](./docs/database.md) · [Parsing de legendas](./docs/parsing.md) · [Job Memory](./docs/job-memory.md) · [Tradução LLM](./docs/llm.md) · [Jobs](./docs/jobs.md) · [Preflight](./docs/preflight.md) · [Build e release](./docs/release.md) · [Backlog do frontend](./docs/frontend-requirements.md).

## Roadmap

Regras de negócio definidas em [`AGENTS.md`](./AGENTS.md):

- [x] IPC estrito, logging, banco com migrations, shutdown gracioso
- [x] Sidecars: manifests, download verificável, resume, poda, consentimento
- [x] Verificação de versão do app
- [x] Build e release (Linux + Windows)
- [x] **Parser SRT**: AST lossless (nós Text / Tag / LineBreak), scanner tolerante com diagnósticos, modo de reparo seguro, segmentação estilo XLIFF para o LLM, relatório de cobertura (veja [`docs/parsing.md`](./docs/parsing.md))
- [x] **Parser ASS/SSA**: mesma AST de `core/`; só `Dialogue:` vira cue e o resto é trivia lossless; desenhos e karaokê nunca vão ao LLM (veja [`docs/parsing.md`](./docs/parsing.md))
- [x] **Job Manager**: jobs persistidos (`extract`, `translate`, `mux`, `pipeline`), fila FIFO com concorrência limitada, `AbortController` por job, retry a partir da etapa que falhou, saídas atômicas, shutdown gracioso, CRUD de perfis, caminhos validados (veja [`docs/jobs.md`](./docs/jobs.md))
- [x] **Modo batch**: pastas (com recursão opcional) ou vários arquivos, plano com seleção automática de faixas, criação atômica, espelhamento de pastas, cancelamento do lote (veja [`docs/jobs.md`](./docs/jobs.md))
- [ ] **Formatos de legenda**: parser de WebVTT; OCR para PGS/VobSub
- [x] **Camada LLM**: chunks sequenciais `<context>`/`<target>` sobre os misses do cache, JSON estruturado (`json_schema` → `json_object` → prompt) validado com Zod e validação de marcadores, reparo por linha, política de retry de transporte, termbase no System Prompt, SSE do OpenRouter com cancelamento e contabilização de custo, API key cifrada (veja [`docs/llm.md`](./docs/llm.md))
- [x] **Job Memory**: cache validado com chave _context hash_ + idioma + modelo + glossário, upsert transacional por chunk, prune com vacuum incremental (veja [`docs/job-memory.md`](./docs/job-memory.md))
- [x] **Preflight**: estimativa local de tokens (`js-tiktoken`, exata para GPT, faixa de ±20% para outros tokenizers) × taxa de acerto do Job Memory × preços de `/api/v1/models`, relatório de cobertura, confirmação antes de traduzir (limite de auto-confirmação), totais do batch (veja [`docs/preflight.md`](./docs/preflight.md))
- [ ] **Contexto de mídia**: parse do nome do arquivo (scene release) + TMDB/TVDB com override manual
- [ ] **Frontend**: construir as telas listadas em [`docs/frontend-requirements.md`](./docs/frontend-requirements.md) (relatório de cobertura da tradução no preflight, diagnósticos do parser, confiança de encoding, onboarding de sidecars)
