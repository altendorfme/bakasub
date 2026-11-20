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
    },
    cooldown: 'Rate limited · {{seconds}} s',
    sessionCost: 'US$ {{value}} this session'
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
  },
  translate: {
    steps: { file: 'File', track: 'Track', preset: 'Preset & context', output: 'Output' },
    next: 'Continue',
    back: 'Back',
    start: 'Estimate cost',
    starting: 'Preparing…',
    another: 'Translate another file',
    file: {
      heading: 'Choose what to translate',
      body: 'A video (.mkv) or a subtitle file (.srt, .ass, .ssa, .vtt).',
      drop: 'Drop a file here',
      or: 'or',
      browse: 'Browse files',
      unsupported: 'This file type is not supported. Use .mkv, .srt, .ass, .ssa or .vtt.',
      video: 'Video',
      subtitle: 'Subtitle file',
      change: 'Choose another file'
    },
    track: {
      heading: 'Pick the subtitle track',
      loading: 'Reading the tracks…',
      none: 'This video has no subtitle track that can be translated.',
      events_one: '{{count}} line',
      events_other: '{{count}} lines',
      default: 'Default',
      forced: 'Forced',
      imageBased: 'Image subtitles are not supported',
      noParser: 'Format not supported',
      fonts_one: 'The video has {{count}} font attached; it is kept for styled (.ass) subtitles.',
      fonts_other:
        'The video has {{count}} fonts attached; they are kept for styled (.ass) subtitles.',
      unknownLang: 'Unknown language'
    },
    preset: {
      heading: 'How to translate',
      preset: 'Preset',
      builtin: 'Built-in',
      temperature: 'Temperature',
      mediaType: 'Media type',
      glossary_one: '{{count}} glossary entry',
      glossary_other: '{{count}} glossary entries',
      noGlossary: 'No glossary',
      style: 'Style',
      model: 'Model',
      modelHint: 'Only your favorite models are listed. Manage them in Models.',
      language: 'Translate into',
      languageHint: 'Manage your languages in Languages.',
      notes: 'Notes for the translator (optional)',
      notesHint: 'Characters, names, tone, anything the AI should know. {{count}}/{{max}}',
      notesPlaceholder: 'e.g. Frieren is an elf mage; keep honorifics like -san.'
    },
    output: {
      heading: 'Where to save',
      folder: 'Output folder',
      nextToSource: 'Next to the source file',
      choose: 'Choose folder',
      reset: 'Use the source folder',
      setDefault: 'Make the translated subtitle the default track',
      keepOriginal: 'Keep the original subtitles in the video',
      alsoWrite: 'Also save the translated subtitle as a separate file',
      summary:
        'BakaSub first estimates the cost and asks you to confirm before anything is sent to the AI.'
    }
  },
  jobs: {
    step: {
      probe: 'Reading the video',
      extract: 'Extracting the subtitle',
      preflight: 'Estimating the cost',
      translate: 'Translating',
      validate: 'Checking the result',
      write: 'Saving the subtitle',
      mux: 'Putting the subtitle in the video'
    },
    status: {
      queued: 'Waiting in the queue',
      running: 'Running',
      'awaiting-confirmation': 'Waiting for your confirmation',
      completed: 'Done',
      'completed-with-warnings': 'Done, with warnings',
      failed: 'Failed',
      cancelled: 'Cancelled',
      interrupted: 'Interrupted when BakaSub closed'
    },
    lines: '{{done}} of {{total}} lines',
    cached: '{{count}} from the translation cache',
    chunk: 'part {{index}} of {{count}}',
    cost: 'US$ {{value}} so far',
    confirm: 'Translate',
    cancel: 'Cancel job',
    cancelHint: 'Some providers keep generating (and billing) the request already in progress.',
    retry: 'Retry',
    openQueue: 'Open in Queue',
    outputs: 'Saved to',
    finalCost: 'Cost: US$ {{value}}',
    costIncomplete: 'Cost of interrupted requests could not be fully determined.',
    untranslated_one: '{{count}} line stayed in the original language',
    untranslated_other: '{{count}} lines stayed in the original language',
    warnings: 'Warnings',
    remove: 'Remove',
    kind: {
      extract: 'Extract',
      translate: 'Translate',
      mux: 'Mux',
      pipeline: 'Video translation'
    },
    batch: 'Batch',
    attempt: 'attempt {{n}}',
    created: 'Added {{when}}',
    finished: 'Finished {{when}}',
    hint: {
      dailyLimit: 'Free models reset at {{time}} (00:00 UTC). Retry then, or pick a paid model.',
      credits: 'Add credits on OpenRouter',
      sidecar: 'Install tools',
      interrupted:
        'BakaSub closed while this job ran. Retrying continues from the step that stopped.'
    }
  },
  queue: {
    new: 'New translation',
    filters: { all: 'All', active: 'Active', attention: 'Needs you', done: 'Done' },
    empty: {
      all: 'No jobs yet. Translate a file to see it here.',
      active: 'Nothing is running.',
      attention: 'Nothing needs your attention.',
      done: 'No finished jobs.'
    },
    select: 'Select a job to see its details.',
    pill: {
      queued: 'Queued',
      running: 'Running',
      'awaiting-confirmation': 'Confirm',
      completed: 'Done',
      'completed-with-warnings': 'Warnings',
      failed: 'Failed',
      cancelled: 'Cancelled',
      interrupted: 'Interrupted'
    },
    list: 'Jobs'
  },
  preflight: {
    heading: 'Review before translating',
    lines: 'Lines',
    total: '{{count}} total',
    cachedLines: '{{count}} already translated (cache)',
    toTranslate: '{{count}} to translate',
    parts_one: '{{count}} request',
    parts_other: '{{count}} requests',
    tokens: 'Tokens',
    tokensIn: '{{low}}–{{high}} in',
    tokensOut: '{{low}}–{{high}} out',
    cost: 'Estimated cost',
    costRange: 'US$ {{low}} – {{high}}',
    free: 'Free',
    dynamic: 'This model has a variable price; only tokens are estimated.',
    approximate: 'Approximate: this model counts tokens differently from BakaSub.',
    model: 'Model {{model}}, prices from {{date}}',
    nothing: 'Everything is already in the translation cache: nothing will be sent to the AI.',
    quotaShort:
      'This needs about {{requests}} free-model requests and you have {{remaining}} left today. The job may stop when the daily limit is reached; what is translated by then is kept.',
    quotaUnknown: 'Free models have a daily limit and BakaSub could not check how much is left.',
    quotaOk: '{{remaining}} of {{limit}} free requests left today'
  },
  coverage: {
    heading: 'Not translated',
    summaryUntranslated_one: '{{count}} line will stay in the original language',
    summaryUntranslated_other: '{{count}} lines will stay in the original language',
    summarySkipped_one: '{{count}} line has nothing to translate',
    summarySkipped_other: '{{count}} lines have nothing to translate',
    showSkipped: 'Show lines with nothing to translate',
    hideSkipped: 'Hide them',
    line: 'Line {{line}}',
    truncated: 'Only the first entries are listed.',
    kept: 'Kept as is',
    omitted: 'Left out',
    reason: {
      SKIPPED_NO_LETTERS: 'No words (music notes, dots or only formatting)',
      SKIPPED_EMPTY_BLOCK: 'Empty block',
      SKIPPED_DRAWING: 'Vector drawing',
      UNTRANSLATED_ORPHAN_TEXT: 'Text without timing after a blank line',
      UNTRANSLATED_BAD_TIMING: 'The timing line could not be read',
      UNTRANSLATED_MARKER_COLLISION: 'Text looks like an internal marker',
      UNTRANSLATED_KARAOKE: 'Karaoke line (translating would break the syllable timing)',
      UNTRANSLATED_BAD_EVENT: 'Dialogue line that could not be read',
      UNTRANSLATED_VALIDATION_FAILED: 'The model kept breaking the formatting',
      UNTRANSLATED_CONTENT_FILTERED: "Blocked by the provider's moderation"
    }
  },
  media: {
    heading: 'What is this?',
    title: 'Title',
    searchPlaceholder: 'Search by title',
    searching: 'Searching TMDB for “{{query}}”…',
    noResults: 'No results for “{{query}}”. Try the original title or add the year.',
    identifying: 'Looking up “{{query}}” from the file name…',
    notFound:
      '“{{query}}” was not recognized from the file name. Search for the title above, or continue without media context.',
    offline: 'TMDB could not be reached. You can continue without media context.',
    noKey:
      'Add a free TMDB key so BakaSub can recognize the movie or show and give the AI its synopsis.',
    addKey: 'Add TMDB key',
    recognized: 'Recognized from the file name',
    series: 'Series',
    movie: 'Movie',
    runtime: '{{minutes}} min',
    movieWithEpisode:
      'The file name looks like an episode ({{code}}), but this title is a movie. Check that the right title was chosen.',
    season: 'Season',
    episode: 'Episode',
    fromFile: 'From the file name',
    changed: 'Changed (file name says {{code}})',
    notInFile: 'Not in the file name',
    absolute:
      'The file name uses absolute numbering (episode {{n}}). Enter the season and episode.',
    enterEpisode: 'Enter the season and episode to load its synopsis.',
    noEpisode: 'TMDB has no episode {{code}} for this title.',
    noEpisodeSynopsis: 'No synopsis for {{code}} on TMDB.',
    include: 'Include these details in the translation context',
    attribution: 'Metadata and images from TMDB'
  },
  settings: {
    range: 'Use a value from {{min}} to {{max}}.',
    tabs: {
      general: 'General',
      keys: 'Keys',
      cache: 'Translation cache',
      tools: 'Video tools',
      advanced: 'Advanced',
      about: 'About'
    },
    general: {
      language: 'Language',
      languageHint: 'Language of BakaSub and its guides.',
      system: 'Same as the system',
      defaultPreset: 'Default preset',
      defaultPresetHint: 'Preset selected when you start a translation.',
      concurrency: 'Jobs at the same time',
      concurrencyHint: 'More jobs finish sooner but share the same OpenRouter limits.',
      autoConfirm: 'Translate without asking below',
      autoConfirmHint:
        'Skip the cost confirmation when the highest estimate is below this amount. Empty: always ask.',
      always: 'Always ask',
      sourceLangs: 'Preferred source languages',
      sourceLangsHint: 'Used to pick the subtitle track of a video automatically, in this order.',
      verbose: 'Detailed logs',
      verboseHint: 'Writes more detail to the log. Useful when reporting a problem.',
      add: 'Add language',
      remove: 'Remove {{name}}',
      up: 'Move {{name}} up'
    },
    keys: {
      openrouter: 'OpenRouter',
      openrouterHint: 'Used for every translation. Checked with OpenRouter before saving.',
      tmdb: 'TMDB (optional)',
      tmdbHint: 'Recognizes movies and shows to give the AI their synopsis.'
    },
    cache: {
      body: 'Every translated line is kept, so translating the same file again (or a similar one) is instant and free.',
      size: 'Size on disk',
      entries_one: '{{n}} line',
      entries_other: '{{n}} lines',
      oldest: 'Least recently used on {{date}}',
      empty: 'The cache is empty.',
      prune: 'Remove lines not used for',
      days_one: 'more than {{count}} day',
      days_other: 'more than {{count}} days',
      all: 'Clear everything',
      apply: 'Remove',
      busy: 'Wait for the running jobs to finish before cleaning the cache.',
      done_one: 'Removed {{count}} line.',
      done_other: 'Removed {{count}} lines.'
    },
    tools: {
      body: 'mkvtoolnix is needed to read subtitle tracks from videos and to put translations back.',
      check: 'Check again',
      required: 'needs {{version}}'
    },
    advanced: {
      body: 'How BakaSub paces and retries requests to OpenRouter. The defaults follow OpenRouter limits; change them only if you have a reason.',
      quota: 'Free models today',
      quotaValue: '{{used}} of {{limit}} requests used',
      quotaUnknown: 'Could not check the free-model quota.',
      tierAuto: 'Detected: {{tier}}',
      tier: {
        'under-10': 'under US$ 10 of credits bought (50 requests/day)',
        'over-10': 'US$ 10 or more bought (1000 requests/day)',
        unknown: 'unknown (assuming 50 requests/day)'
      },
      freeTier: 'Free-model tier',
      freeTierHint:
        'Detected from your OpenRouter account. Set it by hand only if the detection is wrong.',
      tierOptions: {
        auto: 'Automatic',
        'under-10': 'Under US$ 10 bought',
        'over-10': 'US$ 10 or more bought'
      },
      freeRpm: 'Requests per minute (free models)',
      freeRpmHint:
        'Lower it if you use the same OpenRouter account in other apps at the same time.',
      paidRpm: 'Requests per minute (paid models)',
      paidRpmHint: 'Set a limit if a provider keeps asking you to slow down. Empty: no limit.',
      noLimit: 'No limit',
      maxThrottled: 'Attempts when asked to slow down',
      maxTransient: 'Attempts after errors',
      baseDelay: 'First wait between attempts',
      maxDelay: 'Longest wait between attempts',
      chunkRounds: 'Extra rounds for a failed part',
      chunkRoundsHint: 'Waits 1 minute, then 2, before retrying that part. 0 fails right away.',
      seconds: 's',
      restore: 'Restore defaults',
      restored: 'Defaults restored.'
    },
    about: {
      version: 'Version {{version}}',
      platform: '{{platform}} {{arch}}, Electron {{electron}}',
      upToDate: 'You have the latest version.',
      update: 'Version {{latest}} is available.',
      offline: 'Could not check for updates.',
      data: 'Data folder',
      tmdb: 'This product uses the TMDB API but is not endorsed or certified by TMDB. Movie and show metadata and images come from The Movie Database (TMDB).',
      openrouter: 'Translations are made by the models you choose, through OpenRouter.'
    }
  },
  modelsPage: {
    body: 'Star the models you want to offer when translating, and pick the default. Prices are per 1M tokens, from OpenRouter.',
    refresh: 'Refresh list',
    updated: 'List from {{date}}',
    missingTitle: 'No longer on OpenRouter',
    missingBody:
      'These favorites left the OpenRouter catalog. Translating with them will fail; remove them or pick another default.',
    remove: 'Remove',
    quota: '{{remaining}} of {{limit}} free-model requests left today'
  },
  languagesPage: {
    body: 'The languages you translate into. They are offered when translating; the default is selected first.'
  },
  presets: {
    body: 'How the AI should translate: tone, a glossary of names and terms, and how creative it can be.',
    new: 'New preset',
    import: 'Import',
    export_one: 'Export {{count}} preset',
    export_other: 'Export {{count}} presets',
    exported_one: 'Exported {{count}} preset.',
    exported_other: 'Exported {{count}} presets.',
    builtin: 'Built-in',
    custom: 'Your presets',
    noCustom: 'No presets of your own yet. Create one, or duplicate a built-in preset.',
    select: 'Select to export',
    readOnly: 'Built-in presets cannot be changed. Duplicate it to make your own version.',
    copiedFrom: 'Copied from {{name}}',
    duplicate: 'Duplicate',
    delete: 'Delete',
    deleteTitle: 'Delete “{{name}}”?',
    deleteBody: 'Jobs that already used it keep their settings.',
    save: 'Save preset',
    saved: 'Preset saved.',
    discard: 'Discard changes',
    unsaved: 'Unsaved changes',
    field: {
      name: 'Name',
      mediaType: 'Media type',
      mediaTypeHint: 'Free text, e.g. anime, sitcom, documentary.',
      temperature: 'Temperature',
      temperatureHint: 'Lower stays closer to the original; higher is freer. 0 to 2.',
      prompt: 'Style instructions',
      promptHint: 'Tone, register, what to keep or adapt. {{count}}/{{max}}'
    },
    error: {
      required: 'Required.',
      tooLong: 'Too long.',
      range: 'Use a value from 0 to 2.'
    },
    glossary: {
      title: 'Glossary',
      hint: 'Names and terms the AI must follow. Each entry needs a translation or a rule.',
      source: 'Term',
      target: 'Translation',
      rule: 'Rule',
      targetPlaceholder: 'Keep as is: repeat the term',
      rulePlaceholder: 'e.g. keep the honorific',
      add: 'Add entry',
      remove: 'Remove entry {{n}}',
      empty: 'No entries.',
      tooMany: 'At most 500 entries.',
      rowError: {
        source: 'Enter the term.',
        targetOrRule: 'Add a translation or a rule.',
        tooLong: 'Too long.'
      }
    },
    importDialog: {
      title: 'Import presets',
      body: 'Choose a BakaSub presets file (.json). Imported presets are always added as new ones.',
      conflict: 'When a name already exists',
      rename: 'Import with a new name',
      skip: 'Skip it',
      choose: 'Choose file',
      imported_one: 'Imported {{count}} preset.',
      imported_other: 'Imported {{count}} presets.',
      skipped: 'Not imported',
      entry: 'Entry {{n}}',
      nameTaken: 'name already exists',
      done: 'Done'
    }
  }
}
