/**
 * Original artwork for the fictional show used in the screenshots ("Starlight Courier"): no real
 * TMDB image is ever shown. Plain SVG data URLs, deterministic so captures are reproducible.
 */
function stars(count: number, w: number, h: number, seed: number): string {
  let s = seed
  const rnd = (): number => (s = (s * 16807) % 2147483647) / 2147483647
  return Array.from({ length: count }, () => {
    const r = (rnd() * 1.6 + 0.4).toFixed(2)
    return `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h * 0.7).toFixed(1)}" r="${r}" fill="#fff" opacity="${(rnd() * 0.6 + 0.3).toFixed(2)}"/>`
  }).join('')
}

const toUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Night sky, a ringed planet and a train crossing a viaduct. 16:9. */
export function backdrop(): string {
  const w = 1920
  const h = 1080
  return toUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0620"/><stop offset=".55" stop-color="#3a1550"/><stop offset="1" stop-color="#b83a7a"/>
    </linearGradient>
    <radialGradient id="planet" cx=".35" cy=".35" r=".8">
      <stop offset="0" stop-color="#f9c4e4"/><stop offset=".6" stop-color="#a78bfa"/><stop offset="1" stop-color="#3b1f6b"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  ${stars(220, w, h, 7)}
  <circle cx="1420" cy="330" r="170" fill="url(#planet)"/>
  <ellipse cx="1420" cy="340" rx="300" ry="46" fill="none" stroke="#f472b6" stroke-width="6" opacity=".55" transform="rotate(-14 1420 340)"/>
  <path d="M0 860 C 320 780 620 820 960 800 S 1600 760 1920 820 V1080 H0Z" fill="#1d0b2c"/>
  <rect x="0" y="742" width="${w}" height="14" fill="#14081f"/>
  ${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 160 - 20} 1080 V800 a80 70 0 0 1 160 0 V1080" fill="none" stroke="#14081f" stroke-width="22"/>`).join('')}
  <g transform="translate(420 700)">
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${i * 128}" y="0" width="120" height="42" rx="8" fill="#241033"/>${Array.from({ length: 5 }, (_, j) => `<rect x="${i * 128 + 10 + j * 22}" y="10" width="14" height="12" rx="2" fill="#fbbf24" opacity=".85"/>`).join('')}`).join('')}
  </g>
  <path d="M0 1080 V940 C 400 900 700 960 1100 930 S 1700 900 1920 950 V1080Z" fill="#0d0516"/>
</svg>`)
}

/** Poster 2:3 with the title. */
export function poster(): string {
  return toUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120a2a"/><stop offset="1" stop-color="#9d2f6d"/></linearGradient>
    <radialGradient id="p" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#f9c4e4"/><stop offset="1" stop-color="#6d4bd1"/></radialGradient>
  </defs>
  <rect width="400" height="600" fill="url(#bg)"/>
  ${stars(70, 400, 600, 3)}
  <circle cx="260" cy="190" r="80" fill="url(#p)"/>
  <path d="M0 470 C 120 430 260 460 400 440 V600 H0Z" fill="#1a0a26"/>
  <text x="200" y="530" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="38" fill="#f3eaf8">STARLIGHT</text>
  <text x="200" y="566" text-anchor="middle" font-family="sans-serif" font-size="22" letter-spacing="8" fill="#f472b6">COURIER</text>
</svg>`)
}
