// Generates public/og.png (1200x630) from the shared brand sources. Run: npm run og
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = (p) => fileURLToPath(new URL(p, import.meta.url))
const W = 1200
const H = 630

const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="p" cx="0.3" cy="0.2" r="0.6"><stop offset="0" stop-color="#f472b6" stop-opacity="0.28"/><stop offset="1" stop-color="#f472b6" stop-opacity="0"/></radialGradient>
    <radialGradient id="v" cx="0.75" cy="0.35" r="0.55"><stop offset="0" stop-color="#a78bfa" stop-opacity="0.26"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="#120c18"/><rect width="100%" height="100%" fill="url(#p)"/><rect width="100%" height="100%" fill="url(#v)"/>
</svg>`)

// Lockup (icon + wordmark, transparent), 695x208 viewBox; scaled to 840 wide.
const logo = await sharp(root('../../src/renderer/src/assets/logo.svg'), { density: 300 })
  .resize({ width: 840 })
  .png()
  .toBuffer()
const { height: logoH } = await sharp(logo).metadata()

const tagline = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="80">
  <text x="600" y="48" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="29" fill="#e9e1f2">Extract, translate with AI and re-mux the subtitles of your .mkv videos.</text>
</svg>`)

const logoTop = Math.round((H - logoH) / 2) - 50
await sharp(background)
  .composite([
    { input: logo, left: (W - 840) / 2, top: logoTop },
    { input: tagline, left: 0, top: logoTop + logoH + 20 }
  ])
  .png({ compressionLevel: 9 })
  .toFile(root('../public/og.png'))
console.log('wrote public/og.png')
