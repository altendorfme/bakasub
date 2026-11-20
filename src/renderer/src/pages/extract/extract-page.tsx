import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { FileDrop } from '@renderer/components/files/file-drop'
import { OutputFolder } from '@renderer/components/files/output-folder'
import { JobDetail } from '@renderer/components/jobs/job-detail'
import { TrackPicker } from '@renderer/components/media/track-picker'
import { Button } from '@renderer/components/ui/button'
import { useCreateJob } from '@renderer/data/jobs'
import { errorMessage } from '@renderer/i18n/error-message'
import { usePageState } from '@renderer/lib/page-state'

/** Extract subtitle tracks from a video, no translation. Then follows the job. */
export function ExtractPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [source, setSource] = usePageState<string | null>('extract.source', null)
  const [tracks, setTracks] = usePageState<number[]>('extract.tracks', [])
  const [outputDir, setOutputDir] = usePageState<string | null>('extract.outputDir', null)
  const [jobId, setJobId] = usePageState<string | null>('extract.jobId', null)
  const create = useCreateJob()
  const onTracks = useCallback((ids: number[]) => setTracks(ids), [setTracks])

  const start = (): void => {
    if (!source) return
    create.mutate(
      { kind: 'extract', source, trackIds: tracks, ...(outputDir ? { outputDir } : {}) },
      { onSuccess: (job) => setJobId(job.id), onError: (err) => toast.error(errorMessage(err)) }
    )
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5 px-6 py-7">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('pages.extract.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('extractPage.body')}</p>
      </div>
      {jobId ? (
        <section className="rounded-xl border bg-card/92 p-5">
          <JobDetail
            id={jobId}
            showQueueLink
            onAnother={() => {
              setJobId(null)
              setSource(null)
              setTracks([])
            }}
          />
        </section>
      ) : (
        <section className="grid gap-5 rounded-xl border bg-card/92 p-5">
          <div className="grid gap-2">
            <h2 className="text-sm font-medium">{t('extractPage.video')}</h2>
            <FileDrop
              path={source}
              accept={['video']}
              onFile={(p) => {
                setSource(p)
                setTracks([])
              }}
            />
          </div>
          {source ? (
            <div className="grid gap-2">
              <h2 className="text-sm font-medium">{t('extractPage.tracks')}</h2>
              <TrackPicker
                key={source}
                path={source}
                mode="multi"
                value={tracks}
                onChange={onTracks}
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <h2 className="text-sm font-medium">{t('extractPage.output')}</h2>
            <OutputFolder value={outputDir} onChange={setOutputDir} />
          </div>
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {source && tracks.length === 0 ? (
              <span className="mr-auto text-xs text-muted-foreground">
                {t('extractPage.needTrack')}
              </span>
            ) : null}
            <Button
              variant="default"
              disabled={!source || tracks.length === 0 || create.isPending}
              onClick={start}
            >
              {t('extractPage.start')}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
