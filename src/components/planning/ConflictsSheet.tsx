import { useMemo } from 'react'
import { closeSheet, replaceSheet } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { EmptyState, SheetLayout } from '@/components/ui'
import { useDB } from '@/data/store'
import { conflictsBetween } from '@/data/planning'
import { relativeDay } from '@/lib/date'
import { useToday } from '@/hooks/useToday'
import { ConflictCard } from './ConflictCard'

/** All open conflicts in a date range, grouped by day. */
export default function ConflictsSheet({ from, to }: SheetProps<'conflicts'>) {
  const db = useDB()
  const today = useToday()
  const list = useMemo(() => conflictsBetween(db, from, to ?? from), [db, from, to])
  const days = [...new Set(list.map((c) => c.date))]
  return (
    <SheetLayout title="Pontos de atenção" eyebrow="planejamento" onClose={closeSheet}>
      {list.length === 0 && <EmptyState emoji="🌿" title="Tudo encaixado" text="Nenhum conflito por aqui. Delícia." compact />}
      {days.map((d) => (
        <div key={d} className="space-y-2">
          <div className="eyebrow">{relativeDay(d, today)}</div>
          {list
            .filter((c) => c.date === d)
            .map((c) => {
              const w = c.refs.find((r) => r.type === 'workout')
              return <ConflictCard key={c.key} conflict={c} onMove={w ? () => replaceSheet('workout', { id: w.id }) : undefined} />
            })}
        </div>
      ))}
    </SheetLayout>
  )
}
