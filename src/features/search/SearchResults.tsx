/** Results for one query — used by the Busca page and inline by Espaços ("buscar na minha vida"). */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { openSheet } from '@/app/ui-store'
import { Button, EmptyState, ListCard } from '@/components/ui'
import { useDB } from '@/data/store'
import { useToday } from '@/hooks/useToday'
import { ROUTES } from '@/app/routes'
import { runAction } from './actions'
import { search, type SearchResult } from './engine'
import { MoneySummaryCard, ResultGroup, ResultRow } from './ResultViews'

export function SearchResults({ query, onOpen }: { query: string; onOpen?: () => void }) {
  const db = useDB()
  const today = useToday()
  const navigate = useNavigate()
  const res = useMemo(() => search(db, query, today), [db, query, today])

  const open = (r: SearchResult) => {
    onOpen?.()
    runAction(r.action, navigate)
  }

  return (
    <div>
      {res.summary && <MoneySummaryCard summary={res.summary} onOpen={() => (onOpen?.(), runAction(res.summary!.action, navigate))} />}

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
          text="Conta pra Lumos? Ela guarda no lugar certo."
          action={
            <Button variant="primary" onClick={() => navigate(`${ROUTES.assistant}?q=${encodeURIComponent(query.trim())}`)}>
              ✦ Contar pra Lumos
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
  )
}
