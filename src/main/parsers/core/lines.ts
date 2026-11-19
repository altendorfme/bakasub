/** Linha física do arquivo, com offsets para recortes lossless. */
export interface Line {
  /** Offset do primeiro caractere da linha. */
  start: number
  /** Offset logo após o último caractere do conteúdo (antes do EOL). */
  end: number
  /** Offset logo após o EOL. */
  next: number
  text: string
  eol: string
  /** 1-based. */
  no: number
}

/** Divide em linhas preservando o EOL real de cada uma (`\n`, `\r\n` ou `\r`). */
export function splitLines(input: string): Line[] {
  const lines: Line[] = []
  let pos = 0
  while (pos < input.length) {
    let end = pos
    while (end < input.length && input.charCodeAt(end) !== 10 && input.charCodeAt(end) !== 13) end++
    let next = end
    if (input.charCodeAt(end) === 13 && input.charCodeAt(end + 1) === 10) next = end + 2
    else if (end < input.length) next = end + 1
    lines.push({
      start: pos,
      end,
      next,
      text: input.slice(pos, end),
      eol: input.slice(end, next),
      no: lines.length + 1
    })
    pos = next
  }
  return lines
}
