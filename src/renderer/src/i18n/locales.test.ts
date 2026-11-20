import { describe, expect, it } from 'vitest'
import { resources } from '.'

type Tree = { readonly [k: string]: string | Tree }

function leaves(t: Tree, prefix = ''): [string, string][] {
  return Object.entries(t).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)
  )
}
const vars = (s: string): string[] =>
  [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()

describe('locales', () => {
  for (const lang of Object.keys(resources).filter((l) => l !== 'en') as (keyof typeof resources)[])
    for (const ns of ['common', 'errors'] as const)
      it(`${lang}/${ns}: same keys and the same {{variables}} as English`, () => {
        const en = new Map(leaves(resources.en[ns] as Tree))
        const other = new Map(leaves(resources[lang][ns] as Tree))
        expect([...other.keys()].sort()).toEqual([...en.keys()].sort())
        for (const [key, text] of en)
          expect(vars(other.get(key)!), `${lang} ${ns}.${key}`).toEqual(vars(text))
      })
})
