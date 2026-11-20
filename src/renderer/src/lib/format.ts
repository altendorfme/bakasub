/** US$ amounts: small values keep enough digits to not read as zero. */
export function formatUsd(v: number): string {
  if (v === 0) return '0.00'
  if (v < 0.01) return v.toFixed(4)
  if (v < 1) return v.toFixed(3)
  return v.toFixed(2)
}

export const formatInt = (n: number, lang: string): string =>
  new Intl.NumberFormat(lang).format(Math.round(n))

export const formatDate = (iso: string, lang: string): string =>
  new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(iso))
