import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@renderer/components/ui/command'
import { makeDefault, toggleItem, type ListWithDefault } from '@renderer/lib/favorites'
import { languageName, TARGET_LANGUAGES } from '@renderer/lib/languages'

/**
 * Target languages (multi-select) and the default one. Controlled: the parent persists
 * `{ list, default }` (`translation.targetLangs` + `translation.defaultTargetLang`).
 */
export function LanguagePicker({
  value,
  onChange,
  disabled
}: {
  value: ListWithDefault
  onChange: (next: ListWithDefault) => void
  disabled?: boolean
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const ui = i18n.language

  // Selected first; everything sorted by its name in the UI language.
  const rows = useMemo(() => {
    const tags = [...new Set([...value.list, ...TARGET_LANGUAGES])]
    const named = tags.map((tag) => ({ tag, name: languageName(tag, ui) }))
    named.sort((a, b) => a.name.localeCompare(b.name, ui))
    const on = new Set(value.list)
    return [...named.filter((r) => on.has(r.tag)), ...named.filter((r) => !on.has(r.tag))]
  }, [value.list, ui])

  return (
    <div className="grid gap-2">
      <span className="text-xs text-muted-foreground">
        {t('languages.selectedCount', { count: value.list.length })}
      </span>
      <Command className="rounded-md border bg-background/40" loop>
        <CommandInput placeholder={t('languages.search')} />
        <CommandList className="max-h-[min(22rem,45vh)]">
          <CommandEmpty>{t('languages.empty')}</CommandEmpty>
          {rows.map(({ tag, name }) => {
            const selected = value.list.includes(tag)
            return (
              <CommandItem
                key={tag}
                value={`${name} ${tag}`}
                disabled={disabled}
                onSelect={() => onChange(toggleItem(value, tag))}
              >
                <Checkbox
                  checked={selected}
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none"
                />
                <span className="flex-1">{name}</span>
                <span className="text-xs text-muted-foreground">{tag}</span>
                {value.default === tag ? (
                  <Badge tone="primary">{t('languages.default')}</Badge>
                ) : selected ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation()
                      onChange(makeDefault(value, tag))
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {t('languages.makeDefault')}
                  </Button>
                ) : null}
              </CommandItem>
            )
          })}
        </CommandList>
      </Command>
    </div>
  )
}
