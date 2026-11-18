/** Comparação numérica de versões pontilhadas ("103.0", "9.0.2", "1.0.0-beta"). Pré-release < release. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): { nums: number[]; pre: boolean } => {
    const [core, pre] = v.trim().replace(/^v/i, '').split(/-(.+)/)
    return { nums: core.split('.').map((s) => Number.parseInt(s, 10) || 0), pre: Boolean(pre) }
  }
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.nums.length, pb.nums.length)
  for (let i = 0; i < len; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  if (pa.pre !== pb.pre) return pa.pre ? -1 : 1
  return 0
}
