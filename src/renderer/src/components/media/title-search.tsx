import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaSearchResult } from '@shared/ipc-contract'
import { Command, CommandItem, CommandList } from '@renderer/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@renderer/components/ui/popover'
import { useMediaSearch } from '@renderer/data/media'
import { errorMessage } from '@renderer/i18n/error-message'
import { useDebounced } from '@renderer/lib/use-debounced'

/** Editable title with TMDB results in a popover (server-side search: cmdk does not filter). */
export function TitleSearch({
  value,
  selectedId,
  onPick
}: {
  /** Current title (chosen media or the parsed file name). */
  value: string
  selectedId: number | null
  onPick: (r: MediaSearchResult) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const debounced = useDebounced(query.trim())
  const search = useMediaSearch(open ? debounced : '')
  const results = search.data ?? []

  return (
    <Popover open={open && debounced.length >= 2} onOpenChange={setOpen}>
      <Command shouldFilter={false} className="grid gap-1">
        <label htmlFor="media-title" className="text-xs font-medium text-muted-foreground">
          {t('media.title')}
        </label>
        <PopoverAnchor asChild>
          <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background/60 px-3 focus-within:border-primary">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              id="media-title"
              value={query}
              autoComplete="off"
              placeholder={t('media.searchPlaceholder')}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Enter' && results[0]) {
                  e.preventDefault()
                  onPick(results[0])
                  setQuery(results[0].title)
                  setOpen(false)
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
            {search.isFetching ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            ) : null}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <CommandList className="max-h-80">
            {search.isError ? (
              <p className="px-3 py-3 text-sm text-destructive">{errorMessage(search.error)}</p>
            ) : search.isPending || search.isFetching ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                {t('media.searching', { query: debounced })}
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                {t('media.noResults', { query: debounced })}
              </p>
            ) : (
              results.map((r) => (
                <CommandItem
                  key={`${r.kind}-${r.id}`}
                  value={`${r.kind}-${r.id}`}
                  onSelect={() => {
                    onPick(r)
                    setQuery(r.title)
                    setOpen(false)
                  }}
                >
                  {r.posterUrl ? (
                    <img
                      src={r.posterUrl}
                      alt=""
                      className="aspect-[2/3] w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="aspect-[2/3] w-8 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        r.year,
                        r.kind === 'series' ? t('media.series') : t('media.movie'),
                        r.originalTitle
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </span>
                  {selectedId === r.id ? <Check className="size-4 text-primary" /> : null}
                </CommandItem>
              ))
            )}
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  )
}
