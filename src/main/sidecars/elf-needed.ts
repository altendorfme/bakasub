import { readFile } from 'node:fs/promises'

const PT_LOAD = 1
const PT_DYNAMIC = 2
const DT_NULL = 0n
const DT_NEEDED = 1n
const DT_STRTAB = 5n

/**
 * Lê as entradas DT_NEEDED (sonames) de um ELF64 little-endian.
 * Retorna [] para qualquer arquivo que não seja ELF64 LE (ex.: PE, scripts).
 */
export async function readElfNeeded(file: string): Promise<string[]> {
  const buf = await readFile(file)
  if (buf.length < 64 || buf.readUInt32BE(0) !== 0x7f454c46) return []
  if (buf[4] !== 2 || buf[5] !== 1) return [] // só ELFCLASS64 + ELFDATA2LSB

  const phoff = Number(buf.readBigUInt64LE(0x20))
  const phentsize = buf.readUInt16LE(0x36)
  const phnum = buf.readUInt16LE(0x38)

  const loads: Array<{ vaddr: bigint; offset: bigint; filesz: bigint }> = []
  let dynamic: { offset: number; size: number } | null = null
  for (let i = 0; i < phnum; i++) {
    const ph = phoff + i * phentsize
    const type = buf.readUInt32LE(ph)
    const offset = buf.readBigUInt64LE(ph + 8)
    const vaddr = buf.readBigUInt64LE(ph + 0x10)
    const filesz = buf.readBigUInt64LE(ph + 0x20)
    if (type === PT_LOAD) loads.push({ vaddr, offset, filesz })
    else if (type === PT_DYNAMIC) dynamic = { offset: Number(offset), size: Number(filesz) }
  }
  if (!dynamic) return []

  const needed: bigint[] = []
  let strtabVaddr: bigint | null = null
  for (let off = dynamic.offset; off + 16 <= dynamic.offset + dynamic.size; off += 16) {
    const tag = buf.readBigUInt64LE(off)
    const val = buf.readBigUInt64LE(off + 8)
    if (tag === DT_NULL) break
    if (tag === DT_NEEDED) needed.push(val)
    else if (tag === DT_STRTAB) strtabVaddr = val
  }
  if (strtabVaddr === null) return []

  const seg = loads.find((l) => strtabVaddr! >= l.vaddr && strtabVaddr! < l.vaddr + l.filesz)
  if (!seg) return []
  const strtabOffset = Number(seg.offset + (strtabVaddr - seg.vaddr))

  return needed.map((n) => {
    const start = strtabOffset + Number(n)
    return buf.toString('utf8', start, buf.indexOf(0, start))
  })
}
