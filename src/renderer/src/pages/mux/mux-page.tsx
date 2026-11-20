import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { unwrap } from '@renderer/lib/ipc'
import { FileDrop } from '@renderer/components/files/file-drop'
import { OutputFolder } from '@renderer/components/files/output-folder'
import { JobDetail } from '@renderer/components/jobs/job-detail'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useCreateJob } from '@renderer/data/jobs'
import { errorMessage } from '@renderer/i18n/error-message'
import { languageName, TARGET_LANGUAGES } from '@renderer/lib/languages'
import { usePageState } from '@renderer/lib/page-state'
import {
  addRows,
  buildMuxRequest,
  MAX_MUX_SUBTITLES,
  muxReady,
  setDefaultRow,
  type MuxRow
} from './mux-rows'

/** Put existing subtitle files into a copy of a video. Then follows the job. */
export function MuxPage({ onSwitchMode }: { onSwitchMode?: () => void } = {}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [source, setSource] = usePageState<string | null>('mux.source', null)
  const [rows, setRows] = usePageState<MuxRow[]>('mux.rows', [])
  const [outputDir, setOutputDir] = usePageState<string | null>('mux.outputDir', null)
  const [setDefault, setSetDefault] = usePageState('mux.setDefault', true)
  const [keepOriginal, setKeepOriginal] = usePageState('mux.keepOriginal', true)
  const [jobId, setJobId] = usePageState<string | null>('mux.jobId', null)
  const create = useCreateJob()
  const name = (tag: string): string => languageName(tag, i18n.language)
  const update = (path: string, patch: Partial<MuxRow>): void =>
    setRows((rs) => rs.map((r) => (r.path === path ? { ...r, ...patch } : r)))

  const addFiles = (): void => {
    unwrap(window.api.dialog.openFiles('subtitle', true)).then(
      ({ paths }) => setRows((rs) => addRows(rs, paths)),
      (err: unknown) => toast.error(errorMessage(err))
    )
  }
  const start = (): void => {
    if (!source) return
    create.mutate(
      buildMuxRequest(source, rows, { outputDir, setDefault, keepOriginalSubtitles: keepOriginal }),
      {
        onSuccess: (job) => setJobId(job.id),
        onError: (err) => toast.error(errorMessage(err))
      }
    )
  }

  if (jobId)
    return (
      <div className="mx-auto grid max-w-3xl gap-5 px-6 py-7">
        <h1 className="text-xl font-semibold tracking-tight">{t('pages.mux.title')}</h1>
        <section className="rounded-xl border bg-card/92 p-5">
          <JobDetail
            id={jobId}
            showQueueLink
            onAnother={() => {
              setJobId(null)
              setSource(null)
              setRows([])
            }}
          />
        </section>
      </div>
    )

  return (
    <div className="mx-auto grid max-w-3xl gap-5 px-6 py-7">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('pages.mux.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('muxPage.body')}</p>
      </div>
      <section className="grid gap-5 rounded-xl border bg-card/92 p-5">
        <div className="grid gap-2">
          <h2 className="text-sm font-medium">{t('muxPage.video')}</h2>
          <FileDrop path={source} accept={['video']} onFile={setSource} />
        </div>

        <div className="grid gap-2">
          <h2 className="text-sm font-medium">{t('muxPage.subtitles')}</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('muxPage.empty')}</p>
          ) : null}
          <ul className="grid gap-2">
            {rows.map((r) => {
              const file = r.path.split(/[\\/]/).pop() ?? r.path
              return (
                <li key={r.path} className="grid gap-2 rounded-lg border bg-background/40 p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{file}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('muxPage.remove', { name: file })}
                      onClick={() => setRows((rs) => rs.filter((x) => x.path !== r.path))}
                    >
                      <X />
                    </Button>
                  </div>
                  <div className="grid items-center gap-2 sm:grid-cols-[12rem_1fr_auto]">
                    <Select
                      value={r.language}
                      onValueChange={(v) => update(r.path, { language: v, guessed: false })}
                    >
                      <SelectTrigger
                        aria-label={`${t('muxPage.language')}: ${file}`}
                        aria-invalid={!r.language || undefined}
                      >
                        <SelectValue placeholder={t('muxPage.needLanguage')} />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          ...new Set([...(r.language ? [r.language] : []), ...TARGET_LANGUAGES])
                        ].map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {name(tag)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={`${t('muxPage.name')}: ${file}`}
                      value={r.name}
                      maxLength={200}
                      placeholder={r.language ? name(r.language) : t('muxPage.namePlaceholder')}
                      onChange={(e) => update(r.path, { name: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={r.isDefault}
                        onCheckedChange={() => setRows((rs) => setDefaultRow(rs, r.path))}
                      />
                      {t('muxPage.isDefault')}
                    </label>
                  </div>
                  {r.guessed ? <p className="text-xs text-violet">{t('muxPage.guessed')}</p> : null}
                </li>
              )
            })}
          </ul>
          <Button
            className="justify-self-start"
            size="sm"
            disabled={rows.length >= MAX_MUX_SUBTITLES}
            onClick={addFiles}
          >
            <Plus />
            {t('muxPage.add')}
          </Button>
          {rows.length >= MAX_MUX_SUBTITLES ? (
            <p className="text-xs text-muted-foreground">{t('muxPage.max')}</p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <h2 className="text-sm font-medium">{t('muxPage.options')}</h2>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={setDefault} onCheckedChange={(v) => setSetDefault(v === true)} />
            {t('muxPage.setDefault')}
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={keepOriginal} onCheckedChange={(v) => setKeepOriginal(v === true)} />
            {t('muxPage.keepOriginal')}
          </label>
        </div>

        <div className="grid gap-2">
          <h2 className="text-sm font-medium">{t('extractPage.output')}</h2>
          <OutputFolder value={outputDir} onChange={setOutputDir} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          {onSwitchMode ? (
            <Button variant="ghost" className="mr-auto" onClick={onSwitchMode}>
              {t('choose.toMany')}
            </Button>
          ) : null}
          <Button
            variant="default"
            disabled={!muxReady(source, rows) || create.isPending}
            onClick={start}
          >
            {t('muxPage.start')}
          </Button>
        </div>
      </section>
    </div>
  )
}
