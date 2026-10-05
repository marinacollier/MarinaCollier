/**
 * ESPAÇOS — manual destinations, not the main path. Universal search on top ("buscar na minha vida"),
 * then four quiet groups with live hints; empty modules don't appear.
 */
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, Plus, Search, X } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { IconButton, Page, PageHeader } from '@/components/ui'
import { TONE } from '@/components/ui/tone'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { SearchResults } from '@/features/search/SearchResults'
import { pushRecent } from '@/features/search/recent'
import { searchSuggestions } from '@/features/search/suggestions'
import { rituals, spaceGroups, type SpaceEntry } from './entries'

function EntryRow({ e }: { e: SpaceEntry }) {
  const nav = useNavigate()
  return (
    <button type="button" onClick={() => nav(e.to)} className="w-full flex items-center gap-3.5 min-h-[58px] py-2 px-4 text-left active:bg-surface-2 transition-colors">
      <span aria-hidden className={cn('h-10 w-10 shrink-0 rounded-[14px] inline-flex items-center justify-center text-[19px] leading-none', TONE[e.tone].soft)}>
        {e.emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15.5px] leading-snug truncate">{e.label}</span>
        {e.hint && <span className="block text-[13px] text-muted mt-0.5 truncate">{e.hint}</span>}
      </span>
      <ChevronRight size={17} className="text-muted/50 shrink-0" />
    </button>
  )
}

export default function SpacesPage() {
  const db = useDB()
  const today = useToday()
  const nav = useNavigate()
  const groups = useMemo(() => spaceGroups(db, today), [db, today])
  const extra = useMemo(() => rituals(db), [db])
  const suggestions = useMemo(() => searchSuggestions(db, today, 5), [db, today])
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const searching = query.trim().length > 0

  return (
    <Page>
      <PageHeader
        title="Espaços"
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
          {groups.map((g, gi) => (
            <motion.section
              key={g.key}
              aria-label={g.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: gi * 0.05 }}
              className="mt-6"
            >
              <div className="flex items-center justify-between min-h-9 px-1 mb-1.5">
                <h2 className="eyebrow">{g.label}</h2>
                {g.all && (
                  <button type="button" onClick={() => nav(g.all!)} className="h-9 -mr-1 px-1 text-[12.5px] text-muted active:opacity-70">
                    ver tudo
                  </button>
                )}
              </div>
              <div className="card overflow-hidden divide-y divide-line/60">
                {g.entries.map((e) => (
                  <EntryRow key={e.key} e={e} />
                ))}
              </div>
            </motion.section>
          ))}

          <nav aria-label="Rituais" className="mt-9 px-1">
            <div className="eyebrow mb-1">Ritmo</div>
            <div className="flex flex-wrap gap-x-1 -ml-2">
              {extra.map((r) => (
                <button key={r.key} type="button" onClick={() => nav(r.to)} className="h-11 px-2 text-[14px] text-ink-2 active:opacity-70">
                  {r.label}
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </Page>
  )
}
