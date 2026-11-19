/**
 * AST comum a todos os formatos de legenda.
 *
 * Invariante de round-trip: a concatenação, em ordem, de
 *   item.leading + <conteúdo cru do item> (para todos os itens) + document.trailing
 * reproduz exatamente o texto decodificado de entrada. Nada é descartado:
 *   - o texto entre dois itens (EOL do item anterior + linhas em branco) vive em `leading` do seguinte;
 *   - o EOL da última linha do arquivo vive em `SubtitleDocument.trailing`.
 *
 * Todos os tipos são imutáveis: `applyTranslation` devolve um novo Cue.
 */

import type { Diagnostic } from './diagnostics'

export type FormatId = 'srt' | 'ssa' | 'ass'

export interface Timecode {
  /** Valor normalizado em milissegundos. */
  readonly ms: number
  /** Texto exatamente como escrito no arquivo (ex.: "00:01:02.5"). */
  readonly raw: string
}

export interface TextNode {
  readonly type: 'text'
  readonly value: string
}

export type TagKind = 'open' | 'close' | 'override'

export interface TagNode {
  readonly type: 'tag'
  /** Texto cru, ex.: "<i>", "</font>", "{\\an8}". */
  readonly raw: string
  /** Nome em minúsculas para tags HTML-like ("i", "font"); "" para blocos `{...}`. */
  readonly name: string
  readonly kind: TagKind
}

export interface LineBreakNode {
  readonly type: 'br'
  /** EOL real do arquivo: "\n", "\r\n" ou "\r". */
  readonly raw: string
}

export type Node = TextNode | TagNode | LineBreakNode

/** Texto cru que ocupa o lugar de um item que o parser não conseguiu classificar. */
export type UnparsedReason = 'orphan-text' | 'bad-timing' | 'empty-block' | 'bad-event'

export interface Cue<F = unknown> {
  readonly kind: 'cue'
  /** Ordinal 1-based entre os cues do documento. É o ID enviado ao LLM (não o índice do arquivo). */
  readonly id: number
  readonly start: Timecode
  readonly end: Timecode
  readonly nodes: readonly Node[]
  /** Estilo do evento (ASS/SSA); `undefined` em formatos sem estilo (SRT). */
  readonly style?: string
  /** Falante/ator (coluna `Name` do ASS/SSA); `undefined` quando vazio ou inexistente. */
  readonly actor?: string
  /** Texto cru entre o item anterior (ou o início do arquivo) e este item. */
  readonly leading: string
  /** Dados lossless específicos do formato (opacos para as camadas acima). */
  readonly format: F
  /** Linha (1-based) onde o cue começa no arquivo. */
  readonly line: number
  /** Última linha (1-based) do cue no arquivo. */
  readonly endLine: number
}

export interface UnparsedBlock {
  readonly kind: 'unparsed'
  /** Posição entre os itens do documento (0-based). */
  readonly blockIndex: number
  readonly raw: string
  readonly leading: string
  readonly reason: UnparsedReason
  readonly line: number
  readonly endLine: number
}

export type Item<F = unknown> = Cue<F> | UnparsedBlock

export type Eol = '\n' | '\r\n' | '\r'
export type EolStyle = Eol | 'mixed'

export interface DocumentMeta {
  /** Nome do encoding detectado/declarado (ex.: "utf-8", "windows-1252"). */
  readonly encoding: string
  /** 0..1; `null` quando a decisão foi determinística (BOM ou UTF-8 estrito). */
  readonly confidence: number | null
  /** O arquivo original tinha BOM (regravado na saída). */
  readonly bom: boolean
  readonly eol: EolStyle
  /** EOL mais frequente (empate: \r\n > \n > \r). Usado pelo serializer reparado para unificar. */
  readonly dominantEol: Eol
}

export interface SubtitleDocument<F = unknown> {
  readonly format: FormatId
  readonly items: readonly Item<F>[]
  /** Texto cru após o último item (tipicamente o EOL final, ou ""). */
  readonly trailing: string
  readonly meta: DocumentMeta
  readonly diagnostics: readonly Diagnostic[]
}
