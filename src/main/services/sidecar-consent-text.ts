/** The only user-facing text the Main shows itself (native dialog), in the app languages. */
export type ConsentLanguage = 'en' | 'pt-BR'

const TEXT = {
  en: {
    title: 'Required components',
    message: 'BakaSub needs to download external tools. Continue?',
    checksum: 'Each file has its SHA-256 checked before it is installed in:',
    install: 'Download and install',
    cancel: 'Cancel'
  },
  'pt-BR': {
    title: 'Componentes necessários',
    message: 'O BakaSub precisa baixar ferramentas externas. Deseja continuar?',
    checksum: 'Os arquivos têm o SHA-256 verificado antes de serem instalados em:',
    install: 'Baixar e instalar',
    cancel: 'Cancelar'
  }
} as const satisfies Record<ConsentLanguage, Record<string, string>>

export const consentText = (lang: ConsentLanguage): (typeof TEXT)[ConsentLanguage] => TEXT[lang]

/** `ui.language`, else the system locale (same rule as the renderer), else English. */
export function consentLanguage(setting: string | null, systemLocale: string): ConsentLanguage {
  if (setting === 'en' || setting === 'pt-BR') return setting
  return systemLocale.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}
