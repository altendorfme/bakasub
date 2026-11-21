import { BookmarkPlus, Ban, ShieldAlert, Shuffle, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Preset, TermConsistencyReport, TermVariation } from '@shared/ipc-contract'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useJobAction } from '@renderer/data/jobs'
import { usePresets, useSavePreset } from '@renderer/data/presets'
import { errorMessage } from '@renderer/i18n/error-message'
import { formatTimecode } from '@renderer/lib/format'
import { addNewTerms, freePresetName, splitByGlossary } from '@renderer/lib/glossary-pin'
import { copyName, mediaTypeLabel, presetLabel } from '@renderer/lib/preset-labels'
import { cn } from '@renderer/lib/utils'

/** The rendering chosen per term (`null` = "do not add": leave this term out). */
type Choices = Readonly<Record<string, string | null>>

/** The most used rendering of each term. */
function initialChoices(terms: readonly TermVariation[]): Choices {
  return Object.fromEntries(terms.map((term) => [term.term, term.variants[0]?.text ?? null]))
}

/**
 * Terms of the source translated in more than one way in this file (local check, no AI). The
 * user picks a rendering per term and pins them in the job's preset glossary; a built-in preset
 * is read-only, so the choices go into a new preset named after the media, with the same style.
 * Terms the preset's current glossary already has are not suggested again (and never
 * overwritten); those the job's glossary pinned and the model still varied show only as a
 * warning. Each term can be marked "do not add", and the whole section dismissed for the job
 * (persisted in its result, the preset is not touched).
 */
export function TermConsistency({
  jobId,
  report,
  mediaTitle
}: {
  /** Job of the report: where a dismissal is saved. */
  jobId: string
  report: TermConsistencyReport
  /** Media of the job (TMDB title): the suggested name of a new preset. */
  mediaTitle?: string
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const presets = usePresets()
  const save = useSavePreset()
  const dismiss = useJobAction()
  const [dismissed, setDismissed] = useState(false)
  /** A preset created from here: further pins go to it. */
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [choices, setChoices] = useState<Choices | null>(null)
  const [name, setName] = useState<string | null>(null)
  // Wait for the glossary: suggestions that vanish once it loads would only flash.
  if (!report.terms.length || presets.isPending || dismissed) return null

  const preset = presets.data?.find((p) => p.id === (createdId ?? report.preset.id))
  const { suggestions, ignored } = splitByGlossary(report.terms, preset?.glossary ?? [])
  if (!suggestions.length && !ignored.length) return null

  const chosen = choices ?? initialChoices(suggestions)
  const pins = suggestions.flatMap((term) => {
    const target = chosen[term.term]
    return target ? [{ term: term.term, target }] : []
  })
  const label = preset ? presetLabel(preset, t) : report.preset.name
  const suggestedName =
    preset && presets.data
      ? freePresetName(
          mediaTitle?.trim() ||
            copyName(
              label,
              presets.data.map((p) => p.name),
              t
            ),
          presets.data.map((p) => p.name)
        )
      : ''
  const newName = name ?? suggestedName

  /** A rendering (clicking the chosen one again leaves the term out) or `null`: "do not add". */
  const choose = (term: string, target: string | null): void =>
    setChoices({ ...chosen, [term]: target === null || chosen[term] === target ? null : target })

  const addToPreset = (p: Preset): void => {
    // Only new terms: an entry the preset gained meanwhile keeps its target and rule.
    const glossary = addNewTerms(p.glossary, pins)
    const count = glossary.length - p.glossary.length
    save.mutate(
      {
        id: p.id,
        input: {
          name: p.name,
          mediaType: p.mediaType,
          temperature: p.temperature,
          prompt: p.prompt,
          glossary
        }
      },
      {
        onSuccess: () => toast.success(t('termConsistency.added', { count, name: label })),
        onError: (err) => toast.error(errorMessage(err))
      }
    )
  }

  const dismissAll = (): void =>
    dismiss.mutate(
      { id: jobId, action: 'dismissConsistency' },
      {
        onSuccess: () => setDismissed(true),
        onError: (err) => toast.error(errorMessage(err))
      }
    )

  const dismissButton = (
    <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={dismissAll}>
      <X className="size-3.5" />
      {t('termConsistency.dismiss')}
    </Button>
  )

  const createFrom = (p: Preset): void =>
    save.mutate(
      {
        id: null,
        input: {
          name: newName.trim(),
          mediaType: p.mediaType,
          temperature: p.temperature,
          prompt: p.prompt,
          glossary: addNewTerms(p.glossary, pins)
        }
      },
      {
        onSuccess: (created) => {
          setCreatedId(created.id)
          toast.success(t('termConsistency.created', { name: created.name, count: pins.length }))
        },
        onError: (err) => toast.error(errorMessage(err))
      }
    )

  return (
    <section
      className="grid gap-2"
      aria-label={
        suggestions.length
          ? t('termConsistency.heading', { count: suggestions.length })
          : t('termConsistency.ignoredHeading', { count: ignored.length })
      }
    >
      {suggestions.length ? (
        <>
          <p className="flex items-center gap-1.5 text-sm text-warning">
            <Shuffle className="size-4 shrink-0" />
            {t('termConsistency.heading', { count: suggestions.length })}
          </p>
          <p className="text-xs text-muted-foreground">{t('termConsistency.hint')}</p>
          <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-md border bg-background/40 p-1.5">
            {suggestions.map((term) => (
              <TermRow
                key={term.term}
                term={term}
                chosen={chosen[term.term] ?? null}
                onChoose={(target) => choose(term.term, target)}
              />
            ))}
          </ul>
        </>
      ) : null}

      {ignored.length ? <IgnoredTerms terms={ignored} /> : null}

      {!suggestions.length || (createdId && !preset) ? null : !preset ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-warning">
            {t('termConsistency.presetGone', { name: report.preset.name })}
          </p>
          {dismissButton}
        </div>
      ) : preset.builtin ? (
        <div className="grid gap-2 rounded-md border border-primary/30 bg-primary-soft/40 p-3">
          <p className="text-xs text-muted-foreground">
            {t('termConsistency.builtin', { name: label })}
          </p>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">{t('termConsistency.newName')}</span>
            <Input
              value={newName}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('termConsistency.newName')}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {t('termConsistency.newDetails', {
              type: mediaTypeLabel(preset.mediaType, t),
              name: label
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="default"
              disabled={!pins.length || !newName.trim() || save.isPending}
              onClick={() => createFrom(preset)}
            >
              <BookmarkPlus className="size-3.5" />
              {t('termConsistency.create', { count: pins.length })}
            </Button>
            {dismissButton}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {pins.length
              ? t('termConsistency.target', { name: label })
              : t('termConsistency.noneChosen')}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {dismissButton}
            <Button
              size="sm"
              variant="default"
              disabled={!pins.length || save.isPending}
              onClick={() => addToPreset(preset)}
            >
              <BookmarkPlus className="size-3.5" />
              {t('termConsistency.add', { count: pins.length })}
            </Button>
          </span>
        </div>
      )}
    </section>
  )
}

/** Terms the job's glossary pinned and the model still translated in other ways. */
function IgnoredTerms({ terms }: { terms: readonly TermVariation[] }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="grid gap-1 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
      <p className="flex items-center gap-1.5 text-warning">
        <ShieldAlert className="size-3.5 shrink-0" />
        {t('termConsistency.ignoredHeading', { count: terms.length })}
      </p>
      <ul className="grid gap-0.5">
        {terms.map((term) => (
          <li key={term.term} className="flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="font-medium text-foreground">{term.term}</span>
            <span className="text-muted-foreground">
              {t('termConsistency.glossaryIgnored', { target: term.glossaryTarget })}
            </span>
            <span className="min-w-0 truncate font-mono text-muted-foreground">
              {term.variants.map((v) => `${v.text} ×${v.cues}`).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TermRow({
  term,
  chosen,
  onChoose
}: {
  term: TermVariation
  chosen: string | null
  onChoose: (target: string | null) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <li className="grid min-w-0 gap-1 rounded px-2 py-1.5 text-xs odd:bg-muted/40">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-foreground">{term.term}</span>
        <span className="text-muted-foreground">
          {t('termConsistency.lines', { count: term.cues })}
        </span>
        {term.glossaryTarget ? (
          <Badge tone="warning">
            {t('termConsistency.glossaryIgnored', { target: term.glossaryTarget })}
          </Badge>
        ) : null}
        {term.unmatched ? (
          <span className="text-muted-foreground">
            {t('termConsistency.unmatched', { count: term.unmatched })}
          </span>
        ) : null}
      </span>
      <ul className="grid gap-1" role="group" aria-label={term.term}>
        {term.variants.map((v) => {
          const selected = chosen === v.text
          const ex = v.examples[0]
          return (
            <li key={v.text} className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-pressed={selected}
                aria-label={t('termConsistency.choose', { term: term.term, target: v.text })}
                onClick={() => onChoose(v.text)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 font-mono',
                  selected
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-transparent text-foreground hover:bg-muted'
                )}
              >
                <span
                  className={cn(
                    'size-2 rounded-full border',
                    selected ? 'border-primary bg-primary' : 'border-muted-foreground'
                  )}
                />
                {v.text}
              </button>
              <span className="shrink-0 text-muted-foreground">×{v.cues}</span>
              {v.kept ? <Badge>{t('termConsistency.kept')}</Badge> : null}
              {ex ? (
                <span
                  className="min-w-0 flex-1 truncate text-muted-foreground"
                  title={`${ex.source}\n→ ${ex.translation}`}
                >
                  {formatTimecode(ex.startMs)} · {ex.translation}
                </span>
              ) : null}
            </li>
          )
        })}
        <li className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={chosen === null}
            aria-label={t('termConsistency.skipTerm', { term: term.term })}
            onClick={() => onChoose(null)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5',
              chosen === null
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted'
            )}
          >
            <Ban className="size-3" />
            {t('termConsistency.skip')}
          </button>
        </li>
      </ul>
    </li>
  )
}
