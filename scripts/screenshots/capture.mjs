/**
 * Captures the site screenshots from the real renderer running against `mock-api.ts`.
 *
 *   npm i --no-save --ignore-scripts playwright-core   # once; not a project dependency
 *   node scripts/screenshots/capture.mjs [--only=wizard,cost] [--chrome=/path/to/chrome]
 *
 * Writes 1600x1000 PNGs (16:10, the carousel frame) to `site/public/screenshots/`. Each scene
 * starts from a fresh page, so they are independent and can be run alone with `--only`.
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain JS: no type syntax */
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const OUT = here('../../site/public/screenshots/')
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, '').split('='))
    .map(([k, v]) => [k, v ?? true])
)
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null

/** Picks the video in the wizard, then its first track, and stops on the given step. */
async function wizardTo(page, step) {
  const next = page.getByRole('button', { name: 'Continue' })
  await page.getByRole('button', { name: 'Browse files' }).click()
  await next.click()
  await page.getByText('Full Subtitles').first().waitFor()
  if (step === 'track') return
  await next.click()
  if (step === 'preset') return
  await next.click()
  if (step === 'output') return
  await page.getByRole('button', { name: 'Estimate cost' }).click()
}

const SCENES = {
  wizard: async (page) => {
    await page.goto('#/translate')
    await wizardTo(page, 'track')
  },
  cost: async (page) => {
    await page.goto('#/translate')
    await wizardTo(page, 'job')
    await page.getByText('Estimated cost').waitFor()
  },
  queue: async (page) => {
    await page.goto('#/queue?job=j-08')
    await page.getByText('Letters from the Ninth Moon').first().waitFor()
  },
  tmdb: async (page) => {
    await page.goto('#/translate')
    await wizardTo(page, 'preset')
    await page.getByText('The Last Train to Orion').first().waitFor()
  },
  presets: async (page) => {
    await page.goto('#/presets')
    await page.getByText('Starlight Courier').first().click()
    await page.getByText('Glossary', { exact: true }).waitFor()
  }
}

const server = await createServer({
  configFile: here('./vite.config.mts'),
  server: { port: 0, host: '127.0.0.1' }
})
await server.listen()
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch(
  typeof args.chrome === 'string' ? { executablePath: args.chrome } : {}
)
await mkdir(OUT, { recursive: true })

let failed = false
try {
  for (const [name, scene] of Object.entries(SCENES)) {
    if (only && !only.has(name)) continue
    const page = await browser.newPage({
      baseURL: base,
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      reducedMotion: 'reduce'
    })
    page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message))
    try {
      await scene(page)
      await page.waitForTimeout(600) // artwork fade-in and late queries
      await page.screenshot({ path: `${OUT}${name}.png` })
      console.log(`✓ ${name}.png`)
    } catch (err) {
      failed = true
      const shot = join(tmpdir(), `bakasub-${name}.failed.png`)
      await page.screenshot({ path: shot }).catch(() => {})
      console.error(`✗ ${name}:`, err.message.split('\n')[0], `(page: ${shot})`)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
process.exit(failed ? 1 : 0)
