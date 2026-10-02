import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { History, Search, X } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { Button, Chip, EmptyState, IconButton, ListCard, Page, PageHeader, SectionTitle } from '@/components/ui'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { runAction } from './actions'
import { search, type SearchResult } from './engine'
import { clearRecent, loadRecent, pushRecent } from './recent'
import { MoneySummaryCard, ResultGroup, ResultRow } from './ResultViews'

export const SEARCH_SUGGESTIONS = ['FashionFinder', 'Cape Town', 'bike', 'gastos viagem', 'estudo IA', 'Luna', 'safari', 'UGC']

export default function SearchPage() {
  const db = useDB()
  const today = useToday()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQueryState] = useState(() => params.get('q') ?? '')
  const [recent, setRecent] = useState(loadRecent)
  const inputRef = useRef<HTMLInputElement>(null)

  const setQuery = (q: string) => {
    setQueryState(q)
    setParams(q ? { q } : {}, { replace: true })
  }

  const res = useMemo(() => search(db, query, today), [db, query, today])
  const hasQuery = query.trim().length > 0

  const remember = () => setRecent(pushRecent(query))

  const open = (r: SearchResult) => {
    remember()
    runAction(r.action, navigate)
  }

  return (
    <Page>
      <PageHeader back search={false} title="Busca" />

      <div className="sticky top-0 z-20 -mx-4 px-4 pt-[max(env(safe-area-inset-top),8px)] pb-2 bg-bg/90 backdrop-blur-xl">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            ref={inputRef}
            autoFocus
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Buscar em tudo"
            placeholder="Projetos, viagens, gastos, livros…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                remember()
                inputRef.current?.blur()
              }
            }}
            className="input h-12 pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {hasQuery && (
            <IconButton
              label="Limpar busca"
              size="sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
            >
              <X size={16} />
            </IconButton>
          )}
        </div>
      </div>

      {!hasQuery && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <SectionTitle className="mt-4">Experimente</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {SEARCH_SUGGESTIONS.map((s) => (
              <Chip key={s} onClick={() => setQuery(s)}>
                {s}
              </Chip>
            ))}
          </div>

          {recent.length > 0 && (
            <>
              <SectionTitle
                action={
                  <button
                    type="button"
                    className="text-[13px] text-muted h-8 px-1"
                    onClick={() => {
                      clearRecent()
                      setRecent([])
                    }}
                  >
                    limpar
                  </button>
                }
              >
                Buscas recentes
              </SectionTitle>
              <ListCard>
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setQuery(r)}
                    className="w-full flex items-center gap-3 min-h-[50px] px-4 text-left text-[15px] active:bg-surface-2"
                  >
                    <History size={16} className="text-muted shrink-0" />
                    <span className="truncate">{r}</span>
                  </button>
                ))}
              </ListCard>
            </>
          )}

          <p className="text-[13px] text-muted text-center mt-8 px-6">
            Busca em tudo: tarefas, projetos, viagens, gastos, treinos, livros, estudos, Luna… Dica: “gastos setembro” soma pra você.
          </p>
        </motion.div>
      )}

      {hasQuery && (
        <div>
          {res.summary && <MoneySummaryCard summary={res.summary} onOpen={() => (remember(), runAction(res.summary!.action, navigate))} />}

          {res.groups.length > 0 && !res.summary && (
            <p className="text-[13px] text-muted px-1 mt-3">
              {res.total === 1 ? '1 resultado' : `${res.total} resultados`}
              {res.groups.length > 1 && ` em ${res.groups.length} áreas`}
            </p>
          )}

          {res.groups.map((g, i) => (
            <ResultGroup key={`${query}:${g.key}`} group={g} index={i} onOpen={open} />
          ))}

          {res.total === 0 && !res.summary && (
            <EmptyState
              emoji="🌾"
              title="Nada por aqui com esse nome."
              text="Quer jogar no brain dump?"
              action={
                <Button variant="primary" onClick={() => openSheet('brainDump', { text: query.trim() })}>
                  🧠 Jogar no brain dump
                </Button>
              }
            />
          )}

          {res.intent === 'money' && res.total === 0 && (
            <ListCard className="mt-4">
              <ResultRow emoji="💸" title="Adicionar um gasto" onPress={() => openSheet('expense')} />
            </ListCard>
          )}
        </div>
      )}
    </Page>
  )
}
