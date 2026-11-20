import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAppUpdateStatus } from '@renderer/data/app'
import type { AppRouter } from './router'

/**
 * One discreet toast per version (per session) when an update is found. It only points to
 * Settings → About: nothing is downloaded or installed from here.
 */
export function useUpdateToast(router: AppRouter): void {
  const { t } = useTranslation()
  const status = useAppUpdateStatus().data
  const seen = useRef(new Set<string>())
  const latest = status?.state === 'available' ? status.latest : undefined
  useEffect(() => {
    if (!latest || seen.current.has(latest)) return
    seen.current.add(latest)
    toast(t('settings.about.toast', { latest }), {
      action: {
        label: t('settings.about.toastAction'),
        onClick: () => void router.navigate({ to: '/settings', search: { tab: 'about' } })
      }
    })
  }, [latest, router, t])
}
