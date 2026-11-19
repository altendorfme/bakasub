export const common = {
  appName: 'BakaSub',
  nav: {
    work: 'Work',
    manage: 'Manage',
    translate: 'Translate',
    extract: 'Extract',
    mux: 'Mux',
    batch: 'Batch',
    queue: 'Queue',
    presets: 'Presets',
    models: 'Models',
    languages: 'Languages',
    logs: 'Logs',
    settings: 'Settings'
  },
  status: {
    running_one: '{{count}} running',
    running_other: '{{count}} running',
    queued_one: '{{count}} queued',
    queued_other: '{{count}} queued',
    awaiting_one: '{{count}} needs confirmation',
    awaiting_other: '{{count}} need confirmation',
    tools: {
      ok: 'Tools ready',
      missing: 'Tools missing',
      checking: 'Checking tools'
    },
    apiKey: {
      set: 'API key set',
      missing: 'No API key'
    }
  },
  pages: {
    translate: { title: 'Translate a file' },
    extract: { title: 'Extract subtitles' },
    mux: { title: 'Mux subtitles' },
    batch: { title: 'Batch' },
    queue: { title: 'Queue' },
    presets: { title: 'Presets' },
    models: { title: 'Models' },
    languages: { title: 'Languages' },
    logs: { title: 'Logs' },
    settings: { title: 'Settings' },
    notBuilt: 'This screen is not built yet.'
  }
}
