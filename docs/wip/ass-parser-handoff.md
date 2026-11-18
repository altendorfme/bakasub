# HANDOFF TEMPORÁRIO: parser ASS/SSA

> Arquivo de transição entre máquinas. **Apague quando o parser ASS estiver implementado** e mova o que importar para `docs/parsing.md`. Escrito em 2026-11-18. A memória do assistente (`~/.claude/...`) é local a cada máquina; tudo que importa está aqui.

## 1. Como retomar

1. Copie o projeto inteiro (este diretório **não é um repositório git ainda**):
   `tar --exclude=node_modules --exclude=dist --exclude=out -czf bakasub.tgz bakasub`
2. Na nova máquina: Node 26 (`nvm use`, há `.nvmrc`), `npm install`, depois `npm test` (esperado: **217 testes, 12 arquivos**), `npm run typecheck`, `npx eslint src`.
3. Recomendado antes de tudo: `git init && git add -A && git commit` (o `.gitignore` já exclui `node_modules`, `dist`, `out`).
4. Peça ao assistente: _"leia `AGENTS.md` e `docs/wip/ass-parser-handoff.md` e continue o /grill-me do parser ASS a partir da rodada 1"_.

## 2. Estado do projeto (tudo verificado)

Feito: IPC estrito, banco SQLite/Drizzle, sidecars (download verificável, resume por Range, poda, consentimento nativo), build/release (AppImage + NSIS + unpacked) e **parser SRT completo** com segmentação para o LLM e relatório de cobertura. Documentação: `README.md` (EN), `README-pt.md`, `docs/{ipc,sidecars,database,release,parsing,frontend-requirements}.md`.

O que o ASS vai reaproveitar (ler primeiro):

- `src/main/parsers/core/types.ts`: AST (`Node = Text | Tag | LineBreak`, `Cue<F>`, `UnparsedBlock`, `SubtitleDocument`). Invariante: cada item guarda o texto cru **anterior** a ele em `leading`; o resto do arquivo fica em `document.trailing`; `serialize(parse(s)) === s`.
- `core/format.ts`: contrato `SubtitleFormat<F>` (`parse`, `serialize`, `serializeRepaired`, `lexInline`).
- `core/diagnostics.ts`: tabela única `FIX_POLICY` (`auto` | `report`).
- `core/segmentation/*`: `classify()` único, payload XLIFF-style `<gN>`, `<xN/>`, `<br/>`, validador, `applyTranslation`. `core/coverage.ts`: `analyzeCoverage`.
- `srt/*`: referência de implementação (scanner, timing, lexer, parser, serializer, repair).
- Regras do projeto em `AGENTS.md` (PT-BR, modularidade, docs sempre atualizados, README EN + `README-pt.md`).

## 3. Onde a conversa parou

O usuário pediu: _"vamos para o parser ass/ssa e já resolver os pontos de atenção junto"_. O `/grill-me` está na **rodada 1, sem nenhuma resposta ainda** (o usuário precisou trocar de máquina). As respostas recomendadas abaixo **não foram confirmadas**: perguntar de novo.

### Fatos levantados (não precisam ser refeitos)

- Não há `.ass`/`.ssa`/`.mkv` reais na máquina original → fixtures sintéticos.
- `mkvextract` com ASS (testado com mux+extração reais): grava UTF-8 **com BOM**; preserva `Dialogue:` e centésimos; **move os eventos `Comment:` para o cabeçalho**, antes de todos os `Dialogue:`. Depois da extração o `[Events]` é: `Format`, comentários, diálogos.
- Fixture de partida (cada linha `Dialogue` mostra um caso):

```ass
[Script Info]
Title: Teste
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.50,Default,Bob,0,0,0,,{\an8}Olá, {\i1}mundo{\i0}\Ncom, vírgulas, no texto
Comment: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{nota de tradução} linha comentada
Dialogue: 1,0:00:05.00,0:00:06.00,Default,,0,0,0,karaoke,{\k20}Ka{\k30}ra{\k25}o{\k40}ke
Dialogue: 2,0:00:07.00,0:00:08.00,Default,,0,0,0,,{\p1}m 0 0 l 100 0 100 100 0 100{\p0}
```

### Rodada 1: perguntas e recomendações (aguardando "sim"/ajustes)

| #   | Decisão                        | Recomendação                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Escopo dos "pontos de atenção" | **(a)** revisar `Cue.format` para o ASS: entra. **(b)** ambiguidade do scanner SRT: entra, regra abaixo. **(c)** CI nunca executado: ação do usuário (`git push` + `workflow_dispatch`). **(d)** `model` na chave de `job_memory`: fica para a iteração do Job Memory                                                             |
| Q2  | ASS e SSA                      | um módulo `parsers/ass/`; `doc.format = 'ssa'` se `ScriptType: v4.00` (sem `+`) ou seção `[V4 Styles]`, senão `'ass'`                                                                                                                                                                                                             |
| Q3  | Estrutura lossless             | só `Dialogue:` dentro de `[Events]` vira `Cue`; todo o resto (Script Info, estilos, `Comment:`, fontes, `;`, linhas em branco) fica cru em `leading`/`trailing`. `Dialogue:` ilegível → `UnparsedBlock` com motivo novo `bad-event` (verbatim, reportado). `Format:` de eventos ausente → colunas padrão do dialeto + diagnóstico |
| Q4  | Texto no ASS                   | campo `Text` = tudo após a (N-1)-ésima vírgula; **todo `{…}` é Tag** (libass ignora chaves sem barra, é comentário invisível; difere do SRT onde `{laughs}` é texto); `\N` e `\n` → `LineBreak` (raw `\N`/`\n`); `\h` fica literal no texto                                                                                       |
| Q5  | O que nunca vai ao LLM         | desenho vetorial (`\p1`…) → `skipped`, novo `SKIPPED_DRAWING` (info); karaokê (`\k \kf \ko \K`) → `untranslated`, novo `UNTRANSLATED_KARAOKE` (warn)                                                                                                                                                                              |
| Q6  | Marcadores no ASS              | bloco com **uma única** tag booleana (`\i \b \u \s` com 0/1) vira par `<gN>`; demais overrides são singles. **Singles passam a exigir ordem relativa original** (nova issue `MARKER_ORDER`), nos dois formatos (muda levemente o SRT); pares continuam livres                                                                     |
| Q7  | Metadados no núcleo            | `Cue.style?` e `Cue.actor?` (coluna `Name`) opcionais (`undefined` no SRT); layer/margens/effect ficam em `AssCueData`                                                                                                                                                                                                            |
| Q8  | Reparo no ASS                  | só unificar EOL no dominante; resto `report` (tempo fora de `H:MM:SS.cc`, `Format:` ausente, fim<início); sem trim (espaços finais do `Text` podem ser significativos)                                                                                                                                                            |
| Q9  | Fixtures                       | sintéticos no repo (Aegisub, SSA v4.00, karaokê, desenhos, placas, saída estilo mkvextract com BOM e `Comment:` no cabeçalho); arquivo real do usuário só para validação local, **sem commitar**                                                                                                                                  |

**Regra proposta para Q1(b)** (scanner SRT, `srt/block-scanner.ts`): no caso colado (linha anterior não vazia, sem linha em branco), uma linha só de dígitos antes de um timing só vira índice se for `índice anterior + 1`; senão é texto do cue anterior e o cue seguinte fica sem índice, com o diagnóstico novo `SRT_AMBIGUOUS_INDEX` (`report`). Com linha em branco antes, nada muda. Hoje está documentado como ambiguidade conhecida em `docs/parsing.md`.

### Rodada 2 (só depois das respostas da 1)

Contrato exato de `assFormat`/`ssaFormat` e de `AssCueData`; política de reparo do tempo; motivo `bad-event` na cobertura (`UNTRANSLATED_BAD_EVENT`); filtro por estilo na API; atualização de `docs/frontend-requirements.md` (novos motivos: `SKIPPED_DRAWING`, `UNTRANSLATED_KARAOKE`, `UNTRANSLATED_BAD_EVENT`, `SRT_AMBIGUOUS_INDEX`). Quando o grill terminar, apresentar o plano final e **só implementar após a confirmação do usuário**.

## 4. Esboço de implementação (assumindo as recomendações acima)

```text
parsers/ass/
  event-format.ts   parse de "Format:" (colunas) + defaults ASS/SSA
  time.ts           H:MM:SS.cc <-> ms (Timecode {ms, raw}); fração em centésimos
  line-scanner.ts   seções, Dialogue: (texto após N-1 vírgulas), Comment:/outros = trivia
  inline-lexer.ts   {…} -> Tag(override), \N \n -> LineBreak; detecta \p1 e \k
  ass-parser.ts / ass-serializer.ts / ass-repair.ts (só EOL) / types.ts (AssCueData) / index.ts
```

Mudanças no núcleo: `Cue.style?`/`actor?`; `UnparsedReason += 'bad-event'`; `SkipReason += 'SKIPPED_DRAWING'`; `UntranslatedReason += 'UNTRANSLATED_KARAOKE' | 'UNTRANSLATED_BAD_EVENT'`; `FIX_POLICY` com códigos `ASS_*`; validador com `MARKER_ORDER` e pares via toggles; `classify()` reconhece drawing/karaokê **pelas tags** (não pelo formato), mantendo o núcleo agnóstico.

Ordem sugerida (red → green, um passo por vez): (1) tipos/núcleo + `MARKER_ORDER` (e regressão do SRT); (2) `time` e `event-format`; (3) lexer inline ASS; (4) scanner de linhas + parser + serializer exato + propriedade de round-trip; (5) classify (drawing/karaokê) e cobertura; (6) reparo EOL; (7) correção do scanner SRT (Q1b); (8) docs: `docs/parsing.md`, READMEs, `frontend-requirements.md`.

## 5. Armadilhas do ambiente (já custaram tempo)

- **Nunca** `pkill -f vitest` / `pkill -f appimage-mount`: o padrão casa com a linha do próprio shell e o mata (exit 144). Use PID.
- Rode vitest sempre com `timeout` (um laço infinito já travou a sessão): `timeout 150 npx vitest run`.
- Shell é zsh: glob sem correspondência (`rm dist/*.exe`) aborta o comando; use `;` ou `nullglob`.
- Windows local só via Docker+wine (`scripts/build-win-docker.sh`, imagem `electronuserland/builder:wine`); wine exige rodar como root no container para o prefixo.
- Arquivos temporários de teste (smoke tests, 7za, árvore podada) estavam no scratchpad da sessão e **não** vêm junto; os testes permanentes estão em `src/**/*.test.ts`.
- Bug já corrigido que merece teste de propriedade sempre: laço infinito em `edgeCounts` (`t = n - i - 1`).
- `npm run build:win` etc. dependem de Docker; o CI (`.github/workflows/release.yml`) nunca rodou de verdade.
