/**
 * MINHA VIDA (MARINA OS 2.0) — the library of her life areas. Universal search on top ("buscar na minha vida"),
 * then the areas with live hints; empty areas don't appear. Work lives in Projetos, money in Finanças.
 */
import { useMemo, useRef, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { IconButton, Page, PageHeader } from '@/components/ui'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { SearchResults } from '@/features/search/SearchResults'
import { pushRecent } from '@/features/search/recent'
import { searchSuggestions } from '@/features/search/suggestions'
import { lifeAreas } from './entries'
import { HubSection } from './hub'

export default function SpacesPage() {
  const db = useDB()
  const today = useToday()
  const areas = useMemo(() => lifeAreas(db, today), [db, today])
  const suggestions = useMemo(() => searchSuggestions(db, today, 5), [db, today])
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const searching = query.trim().length > 0

  return (
    <Page>
      <PageHeader
        title="Minha Vida"
        search={false}
        actions={
          <IconButton label="Registrar algo" onClick={() => openSheet('quickAdd')}>
            <Plus size={21} />
          </IconButton>
        }
      />

      <div className="sticky top-0 z-20 -mx-4 px-4 pt-[max(env(safe-area-inset-top),8px)] pb-2 bg-bg/90 backdrop-blur-xl">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Buscar na minha vida"
            placeholder="buscar na minha vida"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                pushRecent(query)
                inputRef.current?.blur()
              }
            }}
            className="input h-12 pl-11 pr-11 rounded-full [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <IconButton label="Limpar busca" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => (setQuery(''), inputRef.current?.focus())}>
              <X size={16} />
            </IconButton>
          )}
        </div>
        {!searching && suggestions.length > 0 && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setQuery(s)} className="shrink-0 h-9 px-3 rounded-full bg-surface-2 text-[13px] text-ink-2 active:scale-[0.97] transition">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {searching ? (
        <SearchResults query={query} onOpen={() => pushRecent(query)} />
      ) : (
        <>
          {areas.map((a, i) => (
            <HubSection key={a.key} label={a.label} entries={a.entries} delay={i * 40} />
          ))}
        </>
      )}
    </Page>
  )
}
