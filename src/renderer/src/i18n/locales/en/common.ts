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
  },
  actions: {
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    retry: 'Retry',
    reload: 'Reload BakaSub',
    back: 'Back'
  },
  boundary: {
    title: 'Something went wrong on this screen',
    body: 'The error was saved to the log. Try again, or reload BakaSub if it keeps happening.'
  },
  guides: {
    'openrouter-key': 'How to get an OpenRouter key',
    'openrouter-limits': 'Limits, waits and retries',
    'tmdb-key': 'How to get a TMDB key',
    openExternal: 'Opens in your browser'
  },
  wait: {
    'rate-limit': 'Waiting for the rate limit',
    cooldown: 'Paused after a rate limit',
    backoff: 'Retrying',
    in: '{{label}} · {{seconds}} s'
  },
  keyForm: {
    saved: 'Key saved',
    notSet: 'No key yet',
    replace: 'Replace key',
    remove: 'Remove key',
    save: 'Check and save',
    checking: 'Checking…',
    howTo: 'How to get one',
    noKeyring:
      'Your system has no keyring, so the key is stored without system protection. Anyone with access to your user account could read it.'
  },
  models: {
    search: 'Search models',
    empty: 'No model matches.',
    offline: 'Showing the saved model list: OpenRouter could not be reached.',
    loading: 'Loading models from OpenRouter…',
    loadFailed: 'Could not load the model list.',
    favorite: 'Add to favorites',
    unfavorite: 'Remove from favorites',
    makeDefault: 'Make default',
    default: 'Default',
    free: 'Free',
    dynamicPrice: 'Price varies',
    perMillion: '${{input}} in · ${{output}} out per 1M tokens',
    context: '{{k}}k context',
    moderated: 'Moderated',
    moderatedHint: 'The provider filters content; some lines may stay untranslated.',
    structured: 'Reliable JSON',
    structuredHint: 'Supports structured output, so fewer retries.',
    favoritesOnly: 'Favorites only',
    favoritesCount_one: '{{count}} favorite',
    favoritesCount_other: '{{count}} favorites'
  },
  languages: {
    search: 'Search languages',
    empty: 'No language matches.',
    makeDefault: 'Make default',
    default: 'Default',
    selectedCount_one: '{{count}} language',
    selectedCount_other: '{{count}} languages'
  },
  welcome: {
    title: 'Set up BakaSub',
    stepOf: 'Step {{n}} of {{total}}',
    next: 'Continue',
    skip: 'Skip for now',
    finish: 'Start translating',
    steps: {
      key: 'OpenRouter key',
      models: 'Models',
      languages: 'Languages',
      tools: 'Video tools',
      tmdb: 'TMDB (optional)'
    },
    key: {
      heading: 'Connect your OpenRouter account',
      body: 'BakaSub translates through OpenRouter. Paste your API key; it is checked with OpenRouter and stored encrypted on this computer.',
      label: 'OpenRouter API key'
    },
    models: {
      heading: 'Pick the models you want to use',
      body: 'Star the models to offer when translating and choose the default. You can change them later in Models.',
      needOne: 'Star at least one model to continue.'
    },
    languages: {
      heading: 'Which languages do you translate into?',
      body: 'Choose your target languages and the default. You can change them later in Languages.',
      needOne: 'Choose at least one language to continue.'
    },
    tools: {
      heading: 'Tools for video files',
      body: 'Extracting subtitles from .mkv files and putting translations back needs mkvtoolnix. BakaSub downloads it for you (you will be asked to confirm). Translating subtitle files works without it.',
      ready: 'All tools are installed.',
      install: 'Install tools',
      installing: 'Installing…',
      declined: 'Installation cancelled. You can install the tools later in Settings.',
      offline: 'The tool list could not be updated; install may fail until you are online.',
      state: {
        ok: 'Installed',
        missing: 'Not installed',
        outdated: 'Update available',
        unsupported: 'Not available for this system'
      }
    },
    tmdb: {
      heading: 'Recognize what you translate (optional)',
      body: 'With a free TMDB key, BakaSub finds the movie or show from the file name and gives the AI its synopsis, which improves names and tone. Without it, everything else works the same.',
      label: 'TMDB key',
      attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.'
    }
  }
}
