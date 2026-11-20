import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { PRESET_LIMITS, type DraftErrors, type PresetDraft } from './preset-draft'

type Row = PresetDraft['glossary'][number]

/** Termbase rows (term, translation, rule). Read-only for built-ins. */
export function GlossaryEditor({
  rows,
  errors,
  readOnly,
  onChange
}: {
  rows: Row[]
  errors: DraftErrors['glossary']
  readOnly: boolean
  onChange: (rows: Row[]) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const set = (i: number, patch: Partial<Row>): void =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t('presets.glossary.title')}</legend>
      <p className="text-xs text-muted-foreground">{t('presets.glossary.hint')}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('presets.glossary.empty')}</p>
      ) : (
        <div className="grid gap-2">
          <div className="hidden grid-cols-[1fr_1fr_1.4fr_2rem] gap-2 text-xs text-muted-foreground sm:grid">
            <span>{t('presets.glossary.source')}</span>
            <span>{t('presets.glossary.target')}</span>
            <span>{t('presets.glossary.rule')}</span>
          </div>
          {rows.map((r, i) => {
            const err = errors?.[i]
            return (
              <div key={i} className="grid gap-1">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_2rem]">
                  <Input
                    aria-label={`${t('presets.glossary.source')} ${i + 1}`}
                    value={r.source}
                    maxLength={PRESET_LIMITS.source}
                    readOnly={readOnly}
                    aria-invalid={err === 'source' || undefined}
                    onChange={(e) => set(i, { source: e.target.value })}
                  />
                  <Input
                    aria-label={`${t('presets.glossary.target')} ${i + 1}`}
                    value={r.target}
                    maxLength={PRESET_LIMITS.target}
                    readOnly={readOnly}
                    placeholder={t('presets.glossary.targetPlaceholder')}
                    aria-invalid={err === 'targetOrRule' || undefined}
                    onChange={(e) => set(i, { target: e.target.value })}
                  />
                  <Input
                    aria-label={`${t('presets.glossary.rule')} ${i + 1}`}
                    value={r.rule}
                    maxLength={PRESET_LIMITS.rule}
                    readOnly={readOnly}
                    placeholder={t('presets.glossary.rulePlaceholder')}
                    aria-invalid={err === 'targetOrRule' || undefined}
                    onChange={(e) => set(i, { rule: e.target.value })}
                  />
                  {readOnly ? (
                    <span />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('presets.glossary.remove', { n: i + 1 })}
                      onClick={() => onChange(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                {err ? (
                  <p className="text-xs text-destructive">
                    {t(`presets.glossary.rowError.${err}`)}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      {readOnly ? null : (
        <Button
          size="sm"
          className="justify-self-start"
          disabled={rows.length >= PRESET_LIMITS.glossary}
          onClick={() => onChange([...rows, { source: '', target: '', rule: '' }])}
        >
          <Plus />
          {t('presets.glossary.add')}
        </Button>
      )}
    </fieldset>
  )
}
