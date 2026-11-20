import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { FreeTierSetting, PublicSettings } from '@shared/ipc-contract'
import { GuideDialog } from '@renderer/components/common/guide-dialog'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useFreeQuota } from '@renderer/data/models'
import { useSetting } from '@renderer/data/preferences'
import { useResetSettings } from '@renderer/data/settings'
import { errorMessage } from '@renderer/i18n/error-message'
import { NumberSetting, SettingRow } from './setting-row'

const ADVANCED_KEYS: (keyof PublicSettings)[] = [
  'llm.rateLimit.freeRpm',
  'llm.rateLimit.paidRpm',
  'llm.rateLimit.freeTier',
  'llm.retry.maxThrottled',
  'llm.retry.maxTransient',
  'llm.retry.baseDelayMs',
  'llm.retry.maxDelayMs',
  'llm.retry.chunkRounds'
]
const TIERS: readonly FreeTierSetting[] = ['auto', 'under-10', 'over-10']

/** Rate limits and retries (see the "Limits, waits and retries" guide). Not in the wizard. */
export function AdvancedSection(): React.JSX.Element {
  const { t } = useTranslation()
  const quota = useFreeQuota().data
  const reset = useResetSettings()
  const [tier, setTier] = useSetting('llm.rateLimit.freeTier')
  const [freeRpm, setFreeRpm] = useSetting('llm.rateLimit.freeRpm')
  const [paidRpm, setPaidRpm] = useSetting('llm.rateLimit.paidRpm')
  const [maxThrottled, setMaxThrottled] = useSetting('llm.retry.maxThrottled')
  const [maxTransient, setMaxTransient] = useSetting('llm.retry.maxTransient')
  const [baseDelay, setBaseDelay] = useSetting('llm.retry.baseDelayMs')
  const [maxDelay, setMaxDelay] = useSetting('llm.retry.maxDelayMs')
  const [rounds, setRounds] = useSetting('llm.retry.chunkRounds')
  const sec = (ms: number | undefined): number | undefined =>
    ms === undefined ? undefined : ms / 1000
  const ms = (s: number | null): number => Math.round((s ?? 0) * 1000)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="max-w-[65ch] flex-1 text-sm text-muted-foreground">
          {t('settings.advanced.body')}
        </p>
        <GuideDialog id="openrouter-limits" label={t('guides.openrouter-limits')} />
      </div>

      <div className="rounded-lg border bg-background/40 p-3 text-sm">
        <span className="font-medium">{t('settings.advanced.quota')}: </span>
        {quota && quota.used !== null ? (
          t('settings.advanced.quotaValue', { used: quota.used, limit: quota.limit })
        ) : (
          <span className="text-muted-foreground">{t('settings.advanced.quotaUnknown')}</span>
        )}
        {quota ? (
          <span className="block text-xs text-muted-foreground">
            {t('settings.advanced.tierAuto', { tier: t(`settings.advanced.tier.${quota.tier}`) })}
          </span>
        ) : null}
      </div>

      <div className="divide-y">
        <SettingRow
          label={t('settings.advanced.freeTier')}
          description={t('settings.advanced.freeTierHint')}
        >
          <Select value={tier ?? 'auto'} onValueChange={(v) => setTier(v as FreeTierSetting)}>
            <SelectTrigger className="w-56" aria-label={t('settings.advanced.freeTier')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((x) => (
                <SelectItem key={x} value={x}>
                  {t(`settings.advanced.tierOptions.${x}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <NumberSetting
          label={t('settings.advanced.freeRpm')}
          description={t('settings.advanced.freeRpmHint')}
          value={freeRpm}
          min={1}
          max={60}
          onSave={(v) => v !== null && setFreeRpm(v)}
        />
        <NumberSetting
          label={t('settings.advanced.paidRpm')}
          description={t('settings.advanced.paidRpmHint')}
          value={paidRpm}
          min={1}
          max={1000}
          nullable
          emptyLabel={t('settings.advanced.noLimit')}
          onSave={setPaidRpm}
        />
        <NumberSetting
          label={t('settings.advanced.maxThrottled')}
          value={maxThrottled}
          min={1}
          max={10}
          onSave={(v) => v !== null && setMaxThrottled(v)}
        />
        <NumberSetting
          label={t('settings.advanced.maxTransient')}
          value={maxTransient}
          min={1}
          max={10}
          onSave={(v) => v !== null && setMaxTransient(v)}
        />
        <NumberSetting
          label={t('settings.advanced.baseDelay')}
          value={sec(baseDelay)}
          min={0.25}
          max={10}
          step={0.25}
          unit={t('settings.advanced.seconds')}
          onSave={(v) => setBaseDelay(ms(v))}
        />
        <NumberSetting
          label={t('settings.advanced.maxDelay')}
          value={sec(maxDelay)}
          min={1}
          max={120}
          step={0.5}
          unit={t('settings.advanced.seconds')}
          onSave={(v) => setMaxDelay(ms(v))}
        />
        <NumberSetting
          label={t('settings.advanced.chunkRounds')}
          description={t('settings.advanced.chunkRoundsHint')}
          value={rounds}
          min={0}
          max={5}
          onSave={(v) => v !== null && setRounds(v)}
        />
      </div>

      <Button
        className="justify-self-start"
        disabled={reset.isPending}
        onClick={() =>
          reset.mutate(ADVANCED_KEYS, {
            onSuccess: () => toast.success(t('settings.advanced.restored')),
            onError: (err) => toast.error(errorMessage(err))
          })
        }
      >
        <RotateCcw />
        {t('settings.advanced.restore')}
      </Button>
    </div>
  )
}
