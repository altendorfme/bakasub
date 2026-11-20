import {
  Cpu,
  FileDown,
  Bookmark,
  Combine,
  Languages,
  ListOrdered,
  ScrollText,
  Settings,
  Languages as TranslateIcon,
  type LucideIcon
} from 'lucide-react'

export const PAGES = [
  'translate',
  'extract',
  'mux',
  'queue',
  'presets',
  'models',
  'languages',
  'logs',
  'settings'
] as const
export type PageKey = (typeof PAGES)[number]

/** Sidebar order and grouping. `main` is Translate: the core of BakaSub, shown on its own. */
export const NAV: readonly {
  group: 'main' | 'work' | 'manage'
  page: PageKey
  icon: LucideIcon
}[] = [
  { group: 'main', page: 'translate', icon: TranslateIcon },
  { group: 'work', page: 'extract', icon: FileDown },
  { group: 'work', page: 'mux', icon: Combine },
  { group: 'manage', page: 'queue', icon: ListOrdered },
  { group: 'manage', page: 'presets', icon: Bookmark },
  { group: 'manage', page: 'models', icon: Cpu },
  { group: 'manage', page: 'languages', icon: Languages },
  { group: 'manage', page: 'logs', icon: ScrollText },
  { group: 'manage', page: 'settings', icon: Settings }
]
