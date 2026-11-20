import type { LocaleShape } from '../../locale-shape'
import type { common as en } from '../en/common'

export const common: LocaleShape<typeof en> = {
  appName: 'BakaSub',
  nav: {
    work: 'Trabalho',
    manage: 'Gerenciar',
    translate: 'Traduzir',
    extract: 'Extrair',
    mux: 'Mux',
    batch: 'Lote',
    queue: 'Fila',
    presets: 'Presets',
    models: 'Modelos',
    languages: 'Idiomas',
    logs: 'Logs',
    settings: 'Configurações'
  },
  status: {
    running_one: '{{count}} em andamento',
    running_other: '{{count}} em andamento',
    queued_one: '{{count}} na fila',
    queued_other: '{{count}} na fila',
    awaiting_one: '{{count}} aguarda confirmação',
    awaiting_other: '{{count}} aguardam confirmação',
    tools: {
      ok: 'Ferramentas prontas',
      missing: 'Faltam ferramentas',
      checking: 'Verificando ferramentas'
    },
    apiKey: {
      set: 'API key salva',
      missing: 'Sem API key'
    },
    cooldown: 'Limite de requisições · {{seconds}} s',
    sessionCost: 'US$ {{value}} nesta sessão'
  },
  pages: {
    translate: { title: 'Traduzir um arquivo' },
    extract: { title: 'Extrair legendas' },
    mux: { title: 'Mux de legendas' },
    batch: { title: 'Lote' },
    queue: { title: 'Fila' },
    presets: { title: 'Presets' },
    models: { title: 'Modelos' },
    languages: { title: 'Idiomas' },
    logs: { title: 'Logs' },
    settings: { title: 'Configurações' },
    notBuilt: 'Esta tela ainda não foi construída.'
  },
  actions: {
    cancel: 'Cancelar',
    close: 'Fechar',
    save: 'Salvar',
    retry: 'Tentar de novo',
    reload: 'Recarregar o BakaSub',
    back: 'Voltar'
  },
  boundary: {
    title: 'Algo deu errado nesta tela',
    body: 'O erro foi salvo no log. Tente de novo, ou recarregue o BakaSub se continuar acontecendo.'
  },
  guides: {
    'openrouter-key': 'Como conseguir uma key do OpenRouter',
    'openrouter-limits': 'Limites, esperas e novas tentativas',
    'tmdb-key': 'Como conseguir uma key do TMDB',
    openExternal: 'Abre no navegador'
  },
  wait: {
    'rate-limit': 'Aguardando o limite de requisições',
    cooldown: 'Pausado após limite de requisições',
    backoff: 'Tentando de novo',
    in: '{{label}} · {{seconds}} s'
  },
  keyForm: {
    saved: 'Key salva',
    notSet: 'Nenhuma key ainda',
    replace: 'Trocar key',
    remove: 'Remover key',
    save: 'Conferir e salvar',
    checking: 'Conferindo…',
    howTo: 'Como conseguir',
    noKeyring:
      'Seu sistema não tem chaveiro, então a key fica salva sem proteção do sistema. Quem tiver acesso à sua conta de usuário pode lê-la.'
  },
  models: {
    search: 'Buscar modelos',
    empty: 'Nenhum modelo encontrado.',
    offline: 'Mostrando a lista salva: não foi possível acessar o OpenRouter.',
    loading: 'Carregando modelos do OpenRouter…',
    loadFailed: 'Não foi possível carregar a lista de modelos.',
    favorite: 'Adicionar aos favoritos',
    unfavorite: 'Remover dos favoritos',
    makeDefault: 'Tornar padrão',
    default: 'Padrão',
    free: 'Grátis',
    dynamicPrice: 'Preço variável',
    perMillion: '${{input}} entrada · ${{output}} saída por 1M tokens',
    context: 'contexto de {{k}}k',
    moderated: 'Moderado',
    moderatedHint: 'O provedor filtra conteúdo; algumas falas podem ficar sem tradução.',
    structured: 'JSON confiável',
    structuredHint: 'Suporta saída estruturada, então há menos novas tentativas.',
    favoritesOnly: 'Só favoritos',
    favoritesCount_one: '{{count}} favorito',
    favoritesCount_other: '{{count}} favoritos'
  },
  languages: {
    search: 'Buscar idiomas',
    empty: 'Nenhum idioma encontrado.',
    makeDefault: 'Tornar padrão',
    default: 'Padrão',
    selectedCount_one: '{{count}} idioma',
    selectedCount_other: '{{count}} idiomas'
  },
  welcome: {
    title: 'Configurar o BakaSub',
    stepOf: 'Passo {{n}} de {{total}}',
    next: 'Continuar',
    skip: 'Pular por enquanto',
    finish: 'Começar a traduzir',
    steps: {
      key: 'Key do OpenRouter',
      models: 'Modelos',
      languages: 'Idiomas',
      tools: 'Ferramentas de vídeo',
      tmdb: 'TMDB (opcional)'
    },
    key: {
      heading: 'Conecte sua conta do OpenRouter',
      body: 'O BakaSub traduz pelo OpenRouter. Cole sua API key; ela é conferida com o OpenRouter e guardada criptografada neste computador.',
      label: 'API key do OpenRouter'
    },
    models: {
      heading: 'Escolha os modelos que quer usar',
      body: 'Marque com estrela os modelos que devem aparecer ao traduzir e escolha o padrão. Dá para mudar depois em Modelos.',
      needOne: 'Marque pelo menos um modelo para continuar.'
    },
    languages: {
      heading: 'Para quais idiomas você traduz?',
      body: 'Escolha seus idiomas de destino e o padrão. Dá para mudar depois em Idiomas.',
      needOne: 'Escolha pelo menos um idioma para continuar.'
    },
    tools: {
      heading: 'Ferramentas para vídeos',
      body: 'Para extrair legendas de arquivos .mkv e colocar as traduções de volta é preciso o mkvtoolnix. O BakaSub baixa para você (vai pedir confirmação). Traduzir arquivos de legenda funciona sem ele.',
      ready: 'Todas as ferramentas estão instaladas.',
      install: 'Instalar ferramentas',
      installing: 'Instalando…',
      declined: 'Instalação cancelada. Você pode instalar depois em Configurações.',
      offline:
        'Não foi possível atualizar a lista de ferramentas; a instalação pode falhar até você estar online.',
      state: {
        ok: 'Instalada',
        missing: 'Não instalada',
        outdated: 'Atualização disponível',
        unsupported: 'Indisponível para este sistema'
      }
    },
    tmdb: {
      heading: 'Reconhecer o que você traduz (opcional)',
      body: 'Com uma key gratuita do TMDB, o BakaSub encontra o filme ou a série pelo nome do arquivo e passa a sinopse para a IA, o que melhora nomes e tom. Sem ela, todo o resto funciona igual.',
      label: 'Key do TMDB',
      attribution: 'Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.'
    }
  },
  translate: {
    steps: { file: 'Arquivo', track: 'Faixa', preset: 'Preset e contexto', output: 'Saída' },
    next: 'Continuar',
    back: 'Voltar',
    start: 'Estimar custo',
    starting: 'Preparando…',
    another: 'Traduzir outro arquivo',
    file: {
      heading: 'Escolha o que traduzir',
      body: 'Um vídeo (.mkv) ou um arquivo de legenda (.srt, .ass, .ssa, .vtt).',
      drop: 'Solte um arquivo aqui',
      or: 'ou',
      browse: 'Procurar arquivos',
      unsupported: 'Este tipo de arquivo não é aceito. Use .mkv, .srt, .ass, .ssa ou .vtt.',
      video: 'Vídeo',
      subtitle: 'Arquivo de legenda',
      change: 'Escolher outro arquivo'
    },
    track: {
      heading: 'Escolha a faixa de legenda',
      loading: 'Lendo as faixas…',
      none: 'Este vídeo não tem nenhuma faixa de legenda que possa ser traduzida.',
      events_one: '{{count}} fala',
      events_other: '{{count}} falas',
      default: 'Padrão',
      forced: 'Forçada',
      imageBased: 'Legendas em imagem não são aceitas',
      noParser: 'Formato não aceito',
      fonts_one:
        'O vídeo tem {{count}} fonte anexada; ela é mantida para legendas com estilo (.ass).',
      fonts_other:
        'O vídeo tem {{count}} fontes anexadas; elas são mantidas para legendas com estilo (.ass).',
      unknownLang: 'Idioma desconhecido'
    },
    preset: {
      heading: 'Como traduzir',
      preset: 'Preset',
      builtin: 'Embutido',
      temperature: 'Temperatura',
      mediaType: 'Tipo de mídia',
      glossary_one: '{{count}} entrada no glossário',
      glossary_other: '{{count}} entradas no glossário',
      noGlossary: 'Sem glossário',
      style: 'Estilo',
      model: 'Modelo',
      modelHint: 'Só seus modelos favoritos aparecem. Gerencie em Modelos.',
      language: 'Traduzir para',
      languageHint: 'Gerencie seus idiomas em Idiomas.',
      notes: 'Notas para o tradutor (opcional)',
      notesHint: 'Personagens, nomes, tom, tudo que a IA deve saber. {{count}}/{{max}}',
      notesPlaceholder: 'ex.: Frieren é uma maga elfa; mantenha honoríficos como -san.'
    },
    output: {
      heading: 'Onde salvar',
      folder: 'Pasta de saída',
      nextToSource: 'Ao lado do arquivo de origem',
      choose: 'Escolher pasta',
      reset: 'Usar a pasta de origem',
      setDefault: 'Tornar a legenda traduzida a faixa padrão',
      keepOriginal: 'Manter as legendas originais no vídeo',
      alsoWrite: 'Salvar também a legenda traduzida como arquivo separado',
      summary:
        'O BakaSub primeiro estima o custo e pede sua confirmação antes de enviar qualquer coisa para a IA.'
    }
  },
  jobs: {
    step: {
      probe: 'Lendo o vídeo',
      extract: 'Extraindo a legenda',
      preflight: 'Estimando o custo',
      translate: 'Traduzindo',
      validate: 'Conferindo o resultado',
      write: 'Salvando a legenda',
      mux: 'Colocando a legenda no vídeo'
    },
    status: {
      queued: 'Aguardando na fila',
      running: 'Em andamento',
      'awaiting-confirmation': 'Aguardando sua confirmação',
      completed: 'Concluído',
      'completed-with-warnings': 'Concluído, com avisos',
      failed: 'Falhou',
      cancelled: 'Cancelado',
      interrupted: 'Interrompido quando o BakaSub fechou'
    },
    lines: '{{done}} de {{total}} falas',
    cached: '{{count}} do cache de tradução',
    chunk: 'parte {{index}} de {{count}}',
    cost: 'US$ {{value}} até agora',
    confirm: 'Traduzir',
    cancel: 'Cancelar job',
    cancelHint: 'Alguns provedores continuam gerando (e cobrando) a requisição já em andamento.',
    retry: 'Tentar de novo',
    openQueue: 'Abrir na fila',
    logs: 'Ver logs',
    outputs: 'Salvo em',
    finalCost: 'Custo: US$ {{value}}',
    costIncomplete: 'Não foi possível determinar todo o custo das requisições interrompidas.',
    untranslated_one: '{{count}} fala ficou no idioma original',
    untranslated_other: '{{count}} falas ficaram no idioma original',
    warnings: 'Avisos',
    remove: 'Remover',
    kind: {
      extract: 'Extração',
      translate: 'Tradução',
      mux: 'Mux',
      pipeline: 'Tradução de vídeo'
    },
    batch: 'Lote',
    attempt: 'tentativa {{n}}',
    created: 'Adicionado {{when}}',
    finished: 'Concluído {{when}}',
    hint: {
      dailyLimit:
        'Os modelos gratuitos zeram às {{time}} (00:00 UTC). Tente de novo nesse horário ou escolha um modelo pago.',
      credits: 'Adicionar créditos no OpenRouter',
      sidecar: 'Instalar ferramentas',
      interrupted:
        'O BakaSub fechou enquanto este job rodava. Tentar de novo continua da etapa em que parou.'
    }
  },
  queue: {
    new: 'Nova tradução',
    filters: { all: 'Todos', active: 'Ativos', attention: 'Precisam de você', done: 'Concluídos' },
    empty: {
      all: 'Nenhum job ainda. Traduza um arquivo para vê-lo aqui.',
      active: 'Nada em andamento.',
      attention: 'Nada precisa da sua atenção.',
      done: 'Nenhum job concluído.'
    },
    select: 'Selecione um job para ver os detalhes.',
    pill: {
      queued: 'Na fila',
      running: 'Rodando',
      'awaiting-confirmation': 'Confirmar',
      completed: 'Concluído',
      'completed-with-warnings': 'Avisos',
      failed: 'Falhou',
      cancelled: 'Cancelado',
      interrupted: 'Interrompido'
    },
    list: 'Jobs'
  },
  preflight: {
    heading: 'Revise antes de traduzir',
    lines: 'Falas',
    total: '{{count}} no total',
    cachedLines: '{{count}} já traduzidas (cache)',
    toTranslate: '{{count}} para traduzir',
    parts_one: '{{count}} requisição',
    parts_other: '{{count}} requisições',
    tokens: 'Tokens',
    tokensIn: '{{low}}–{{high}} de entrada',
    tokensOut: '{{low}}–{{high}} de saída',
    cost: 'Custo estimado',
    costRange: 'US$ {{low}} – {{high}}',
    free: 'Grátis',
    dynamic: 'Este modelo tem preço variável; só os tokens são estimados.',
    approximate: 'Aproximado: este modelo conta tokens de um jeito diferente do BakaSub.',
    model: 'Modelo {{model}}, preços de {{date}}',
    nothing: 'Tudo já está no cache de tradução: nada será enviado para a IA.',
    quotaShort:
      'Isto precisa de cerca de {{requests}} requisições de modelos gratuitos e restam {{remaining}} hoje. O job pode parar quando o limite diário for atingido; o que já tiver sido traduzido fica salvo.',
    quotaUnknown:
      'Os modelos gratuitos têm limite diário e o BakaSub não conseguiu verificar quanto resta.',
    quotaOk: '{{remaining}} de {{limit}} requisições gratuitas restantes hoje'
  },
  coverage: {
    heading: 'Não traduzido',
    summaryUntranslated_one: '{{count}} fala vai ficar no idioma original',
    summaryUntranslated_other: '{{count}} falas vão ficar no idioma original',
    summarySkipped_one: '{{count}} fala não tem nada para traduzir',
    summarySkipped_other: '{{count}} falas não têm nada para traduzir',
    showSkipped: 'Mostrar falas sem nada para traduzir',
    hideSkipped: 'Esconder',
    line: 'Linha {{line}}',
    truncated: 'Só as primeiras entradas estão listadas.',
    kept: 'Mantida como está',
    omitted: 'Deixada de fora',
    reason: {
      SKIPPED_NO_LETTERS: 'Sem palavras (notas musicais, pontos ou só formatação)',
      SKIPPED_EMPTY_BLOCK: 'Bloco vazio',
      SKIPPED_DRAWING: 'Desenho vetorial',
      UNTRANSLATED_ORPHAN_TEXT: 'Texto sem tempo depois de uma linha em branco',
      UNTRANSLATED_BAD_TIMING: 'Não foi possível ler a linha de tempo',
      UNTRANSLATED_MARKER_COLLISION: 'O texto parece um marcador interno',
      UNTRANSLATED_KARAOKE: 'Linha de karaokê (traduzir quebraria o tempo das sílabas)',
      UNTRANSLATED_BAD_EVENT: 'Linha de diálogo que não pôde ser lida',
      UNTRANSLATED_VALIDATION_FAILED: 'O modelo continuou quebrando a formatação',
      UNTRANSLATED_CONTENT_FILTERED: 'Bloqueada pela moderação do provedor'
    }
  },
  media: {
    heading: 'O que é isto?',
    title: 'Título',
    searchPlaceholder: 'Buscar pelo título',
    searching: 'Buscando “{{query}}” no TMDB…',
    noResults: 'Nenhum resultado para “{{query}}”. Tente o título original ou acrescente o ano.',
    identifying: 'Procurando “{{query}}” pelo nome do arquivo…',
    notFound:
      '“{{query}}” não foi reconhecido pelo nome do arquivo. Busque o título acima ou continue sem contexto de mídia.',
    offline: 'Não foi possível acessar o TMDB. Você pode continuar sem contexto de mídia.',
    noKey:
      'Adicione uma key gratuita do TMDB para o BakaSub reconhecer o filme ou a série e passar a sinopse para a IA.',
    addKey: 'Adicionar key do TMDB',
    recognized: 'Reconhecido pelo nome do arquivo',
    series: 'Série',
    movie: 'Filme',
    runtime: '{{minutes}} min',
    movieWithEpisode:
      'O nome do arquivo parece de um episódio ({{code}}), mas este título é um filme. Confira se o título certo foi escolhido.',
    season: 'Temporada',
    episode: 'Episódio',
    fromFile: 'Pelo nome do arquivo',
    changed: 'Alterado (o nome do arquivo diz {{code}})',
    notInFile: 'Não está no nome do arquivo',
    absolute:
      'O nome do arquivo usa numeração absoluta (episódio {{n}}). Informe a temporada e o episódio.',
    enterEpisode: 'Informe a temporada e o episódio para carregar a sinopse.',
    noEpisode: 'O TMDB não tem o episódio {{code}} deste título.',
    noEpisodeSynopsis: 'Sem sinopse para {{code}} no TMDB.',
    include: 'Incluir estes detalhes no contexto da tradução',
    attribution: 'Metadados e imagens do TMDB'
  },
  settings: {
    range: 'Use um valor de {{min}} a {{max}}.',
    tabs: {
      general: 'Geral',
      keys: 'Keys',
      cache: 'Cache de tradução',
      tools: 'Ferramentas de vídeo',
      advanced: 'Avançado',
      about: 'Sobre'
    },
    general: {
      language: 'Idioma',
      languageHint: 'Idioma do BakaSub e dos guias.',
      system: 'Igual ao do sistema',
      defaultPreset: 'Preset padrão',
      defaultPresetHint: 'Preset selecionado quando você começa uma tradução.',
      concurrency: 'Jobs ao mesmo tempo',
      concurrencyHint: 'Mais jobs terminam antes, mas dividem os mesmos limites do OpenRouter.',
      autoConfirm: 'Traduzir sem perguntar abaixo de',
      autoConfirmHint:
        'Pula a confirmação de custo quando a estimativa máxima fica abaixo deste valor. Vazio: sempre perguntar.',
      always: 'Sempre perguntar',
      sourceLangs: 'Idiomas de origem preferidos',
      sourceLangsHint:
        'Usados para escolher a faixa de legenda de um vídeo automaticamente, nesta ordem.',
      verbose: 'Logs detalhados',
      verboseHint: 'Escreve mais detalhes no log. Útil para relatar um problema.',
      add: 'Adicionar idioma',
      remove: 'Remover {{name}}',
      up: 'Subir {{name}}'
    },
    keys: {
      openrouter: 'OpenRouter',
      openrouterHint: 'Usada em toda tradução. Conferida com o OpenRouter antes de salvar.',
      tmdb: 'TMDB (opcional)',
      tmdbHint: 'Reconhece filmes e séries para passar a sinopse para a IA.'
    },
    cache: {
      body: 'Toda fala traduzida fica guardada, então traduzir o mesmo arquivo de novo (ou um parecido) é instantâneo e gratuito.',
      size: 'Tamanho em disco',
      entries_one: '{{n}} fala',
      entries_other: '{{n}} falas',
      oldest: 'Menos usada em {{date}}',
      empty: 'O cache está vazio.',
      prune: 'Remover falas não usadas há',
      days_one: 'mais de {{count}} dia',
      days_other: 'mais de {{count}} dias',
      all: 'Limpar tudo',
      apply: 'Remover',
      busy: 'Espere os jobs em andamento terminarem antes de limpar o cache.',
      done_one: '{{count}} fala removida.',
      done_other: '{{count}} falas removidas.'
    },
    tools: {
      body: 'O mkvtoolnix é necessário para ler as faixas de legenda dos vídeos e colocar as traduções de volta.',
      check: 'Verificar de novo',
      required: 'precisa da {{version}}'
    },
    advanced: {
      body: 'Como o BakaSub espaça e repete as requisições ao OpenRouter. Os padrões seguem os limites do OpenRouter; mude só se tiver um motivo.',
      quota: 'Modelos gratuitos hoje',
      quotaValue: '{{used}} de {{limit}} requisições usadas',
      quotaUnknown: 'Não foi possível verificar a cota dos modelos gratuitos.',
      tierAuto: 'Detectado: {{tier}}',
      tier: {
        'under-10': 'menos de US$ 10 em créditos comprados (50 requisições/dia)',
        'over-10': 'US$ 10 ou mais comprados (1000 requisições/dia)',
        unknown: 'desconhecido (assumindo 50 requisições/dia)'
      },
      freeTier: 'Patamar dos modelos gratuitos',
      freeTierHint:
        'Detectado pela sua conta do OpenRouter. Defina à mão só se a detecção estiver errada.',
      tierOptions: {
        auto: 'Automático',
        'under-10': 'Menos de US$ 10 comprados',
        'over-10': 'US$ 10 ou mais comprados'
      },
      freeRpm: 'Requisições por minuto (modelos gratuitos)',
      freeRpmHint: 'Diminua se usar a mesma conta do OpenRouter em outros apps ao mesmo tempo.',
      paidRpm: 'Requisições por minuto (modelos pagos)',
      paidRpmHint:
        'Defina um limite se um provedor vive pedindo para diminuir o ritmo. Vazio: sem limite.',
      noLimit: 'Sem limite',
      maxThrottled: 'Tentativas quando pedem para diminuir o ritmo',
      maxTransient: 'Tentativas após erros',
      baseDelay: 'Primeira espera entre tentativas',
      maxDelay: 'Maior espera entre tentativas',
      chunkRounds: 'Rodadas extras para uma parte que falhou',
      chunkRoundsHint:
        'Espera 1 minuto, depois 2, antes de tentar essa parte de novo. 0 falha na hora.',
      seconds: 's',
      restore: 'Restaurar padrões',
      restored: 'Padrões restaurados.'
    },
    about: {
      version: 'Versão {{version}}',
      platform: '{{platform}} {{arch}}, Electron {{electron}}',
      upToDate: 'Você está na versão mais recente.',
      update: 'A versão {{latest}} está disponível.',
      offline: 'Não foi possível verificar atualizações.',
      data: 'Pasta de dados',
      tmdb: 'Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB. Os metadados e imagens de filmes e séries vêm do The Movie Database (TMDB).',
      openrouter: 'As traduções são feitas pelos modelos que você escolhe, por meio do OpenRouter.'
    }
  },
  modelsPage: {
    body: 'Marque com estrela os modelos que devem aparecer ao traduzir e escolha o padrão. Os preços são por 1M tokens, do OpenRouter.',
    refresh: 'Atualizar lista',
    updated: 'Lista de {{date}}',
    missingTitle: 'Não estão mais no OpenRouter',
    missingBody:
      'Estes favoritos saíram do catálogo do OpenRouter. Traduzir com eles vai falhar; remova-os ou escolha outro padrão.',
    remove: 'Remover',
    quota: '{{remaining}} de {{limit}} requisições de modelos gratuitos restantes hoje'
  },
  languagesPage: {
    body: 'Os idiomas para os quais você traduz. Eles aparecem ao traduzir; o padrão vem selecionado.'
  },
  presets: {
    body: 'Como a IA deve traduzir: tom, um glossário de nomes e termos, e quanta liberdade ela tem.',
    new: 'Novo preset',
    import: 'Importar',
    export_one: 'Exportar {{count}} preset',
    export_other: 'Exportar {{count}} presets',
    exported_one: '{{count}} preset exportado.',
    exported_other: '{{count}} presets exportados.',
    builtin: 'Embutidos',
    custom: 'Seus presets',
    noCustom: 'Você ainda não tem presets próprios. Crie um ou duplique um embutido.',
    select: 'Selecionar para exportar',
    readOnly: 'Presets embutidos não podem ser alterados. Duplique para criar sua própria versão.',
    copiedFrom: 'Copiado de {{name}}',
    duplicate: 'Duplicar',
    delete: 'Excluir',
    deleteTitle: 'Excluir “{{name}}”?',
    deleteBody: 'Jobs que já o usaram mantêm as configurações.',
    save: 'Salvar preset',
    saved: 'Preset salvo.',
    discard: 'Descartar alterações',
    unsaved: 'Alterações não salvas',
    field: {
      name: 'Nome',
      mediaType: 'Tipo de mídia',
      mediaTypeHint: 'Texto livre, ex.: anime, sitcom, documentário.',
      temperature: 'Temperatura',
      temperatureHint: 'Mais baixa fica mais perto do original; mais alta é mais livre. De 0 a 2.',
      prompt: 'Instruções de estilo',
      promptHint: 'Tom, registro, o que manter ou adaptar. {{count}}/{{max}}'
    },
    error: {
      required: 'Obrigatório.',
      tooLong: 'Longo demais.',
      range: 'Use um valor de 0 a 2.'
    },
    glossary: {
      title: 'Glossário',
      hint: 'Nomes e termos que a IA deve seguir. Cada entrada precisa de uma tradução ou de uma regra.',
      source: 'Termo',
      target: 'Tradução',
      rule: 'Regra',
      targetPlaceholder: 'Para manter, repita o termo',
      rulePlaceholder: 'ex.: manter o honorífico',
      add: 'Adicionar entrada',
      remove: 'Remover entrada {{n}}',
      empty: 'Nenhuma entrada.',
      tooMany: 'No máximo 500 entradas.',
      rowError: {
        source: 'Informe o termo.',
        targetOrRule: 'Adicione uma tradução ou uma regra.',
        tooLong: 'Longo demais.'
      }
    },
    importDialog: {
      title: 'Importar presets',
      body: 'Escolha um arquivo de presets do BakaSub (.json). Os presets importados sempre entram como novos.',
      conflict: 'Quando o nome já existir',
      rename: 'Importar com outro nome',
      skip: 'Pular',
      choose: 'Escolher arquivo',
      imported_one: '{{count}} preset importado.',
      imported_other: '{{count}} presets importados.',
      skipped: 'Não importados',
      entry: 'Entrada {{n}}',
      nameTaken: 'o nome já existe',
      done: 'Concluir'
    }
  },
  files: {
    videoOnly: 'Escolha um arquivo de vídeo (.mkv).'
  },
  extractPage: {
    body: 'Salve faixas de legenda de um vídeo como arquivos separados, sem traduzir.',
    video: 'Vídeo',
    tracks: 'Faixas para salvar',
    output: 'Pasta de saída',
    start: 'Extrair',
    another: 'Extrair de outro vídeo',
    needTrack: 'Escolha pelo menos uma faixa.'
  },
  muxPage: {
    body: 'Coloque arquivos de legenda em um vídeo. O vídeo é copiado; o original nunca é alterado.',
    video: 'Vídeo',
    subtitles: 'Legendas para adicionar',
    add: 'Adicionar arquivos de legenda',
    empty: 'Nenhuma legenda ainda.',
    language: 'Idioma',
    name: 'Nome da faixa',
    namePlaceholder: 'Por padrão, o nome do idioma',
    isDefault: 'Faixa padrão',
    remove: 'Remover {{name}}',
    guessed: 'Pelo nome do arquivo',
    needLanguage: 'Escolha o idioma.',
    options: 'Opções',
    setDefault: 'Tornar a escolhida a única legenda padrão',
    keepOriginal: 'Manter as legendas que já estão no vídeo',
    start: 'Criar vídeo',
    another: 'Fazer mux de outro vídeo',
    max: 'No máximo 32 legendas.'
  },
  notify: {
    done: 'Tradução concluída',
    warnings: 'Concluído, com avisos',
    failed: 'O job falhou',
    confirm: 'Confirme o custo para traduzir'
  },
  logsPage: {
    body: 'O que o BakaSub fez, com o mais recente embaixo. Keys e outros segredos nunca são escritos aqui.',
    live: 'Ao vivo',
    level: 'Nível',
    levels: {
      debug: 'Tudo',
      info: 'Info e acima',
      warn: 'Avisos e erros',
      error: 'Só erros'
    },
    scope: 'Área',
    allScopes: 'Todas as áreas',
    job: 'Job {{id}}',
    clearJob: 'Mostrar todos os jobs',
    openFolder: 'Abrir pasta de logs',
    export: 'Exportar logs',
    exported: 'Logs exportados.',
    empty: 'Nenhuma linha de log corresponde aos filtros.',
    loading: 'Lendo o log…',
    loadFailed: 'Não foi possível ler o log.',
    details: 'Detalhes',
    count: '{{shown}} de {{total}} linhas'
  }
}
