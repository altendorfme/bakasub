/**
 * Stroke icons drawn on a 24×24 grid (`fill="none"`, `stroke="currentColor"`), rendered by `Icon.astro`.
 * Each entry is the list of `d` attributes of its paths.
 */
export const icons = {
  receipt: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
  database: [
    'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z',
    'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
    'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'
  ],
  film: ['M4 4h16v16H4z', 'M8 4v16', 'M16 4v16', 'M4 9h4', 'M4 15h4', 'M16 9h4', 'M16 15h4'],
  book: ['M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z', 'M4 20a2 2 0 0 0 2 2h13v-4', 'M9 8h6', 'M9 11h4'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5', 'm3 17.5 9 5 9-5'],
  braces: [
    'M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1',
    'M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1'
  ],
  shield: ['M12 3 4 6v6c0 4.4 3.4 8.2 8 9 4.6-.8 8-4.6 8-9V6z', 'm9 12 2 2 4-4'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0', 'M4 4l16 16'],
  signal: ['M4 20h.01', 'M8 20v-4', 'M12 20v-8', 'M16 20V8', 'M3 3l18 18'],
  key: ['M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M10.8 12.2 20 3.5', 'M16 7.5l2.5 2.5', 'M18.5 5l2 2'],
  extract: ['M4 4h16v6H4z', 'M12 10v10', 'm8 16 4 4 4-4'],
  translate: ['M3 5h10', 'M8 3v2', 'M5 5c1 4 4 7 8 8', 'M11 5c-1 4-4 7-8 8', 'm13 21 4-10 4 10', 'M14.5 17.5h5'],
  remux: ['M4 14h16v6H4z', 'M12 4v10', 'm8 8 4-4 4 4']
} as const

export type IconName = keyof typeof icons
