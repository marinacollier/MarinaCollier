import { useMemo, useState } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { Checkbox, SheetLayout, SortableList } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import { activeProjects, isTaskOpen, modalityOf, nextStudy, nextTrip, studyingNow, workoutsOn } from '@/data/selectors'
import type { DateKey, DB, EntityType, ID } from '@/data/types'
import { formatLongDate, relativeDay, todayKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { addPriority, FULL_COPY, MAX_PRIORITIES, prioritiesOf, setPriorityDone } from './priorities'

interface Suggestion {
  key: string
  title: string
  emoji: string
  ref?: { type: EntityType; id: ID }
}

function suggestionsFor(db: DB, date: DateKey): { label: string; items: Suggestion[] }[] {
  const tasks = db.tasks
    .filter((t) => isTaskOpen(t) && t.status !== 'waiting' && !t.recurrence)
    .sort((a, b) => {
      const score = (t: typeof a) => (t.date === date || t.dueDate === date ? 0 : t.date && t.date < date ? 1 : t.needsMe ? 2 : 3)
      return score(a) - score(b) || a.order - b.order
    })
    .slice(0, 6)
    .map((t) => ({ key: `t-${t.id}`, title: t.title, emoji: t.context === 'trabalho' ? '💻' : '✓', ref: { type: 'task' as const, id: t.id } }))

  const projects = activeProjects(db)
    .filter((p) => p.nextAction)
    .slice(0, 4)
    .map((p) => ({ key: `p-${p.id}`, title: `${p.name} — ${p.nextAction}`, emoji: p.emoji, ref: { type: 'project' as const, id: p.id } }))

  const studies = [...studyingNow(db).slice(0, 2), nextStudy(db)]
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({ key: `s-${s.id}`, title: s.nextContent ? `${s.title}: ${s.nextContent}` : s.title, emoji: '📚', ref: { type: 'studyItem' as const, id: s.id } }))

  const workouts = workoutsOn(db, date)
    .filter((w) => w.status === 'planejado')
    .map((w) => {
      const m = modalityOf(db, w.modality)
      return { key: `w-${w.id}`, title: `Fazer treino de ${(w.title || m.label).toLowerCase()}`, emoji: m.emoji, ref: { type: 'workout' as const, id: w.id } }
    })

  const trip = nextTrip(db, date)
  const tripItems = trip
    ? db.tripItems
        .filter((i) => i.tripId === trip.id && (i.status === 'a_fazer' || i.status === 'a_confirmar'))
        .sort((a, b) => a.order - b.order)
        .slice(0, 3)
        .map((i) => ({ key: `ti-${i.id}`, title: i.title, emoji: trip.flag, ref: { type: 'tripItem' as const, id: i.id } }))
    : []

  return [
    { label: 'Treino de hoje', items: workouts },
    { label: 'Tarefas', items: tasks },
    { label: 'Próximas ações de projetos', items: projects },
    { label: 'Estudos', items: studies },
    { label: trip ? `Viagem · ${trip.name}` : 'Viagem', items: tripItems },
  ].filter((g) => g.items.length > 0)
}

export default function PrioritiesSheet({ date: dateProp }: SheetProps<'priorities'>) {
  const date = dateProp ?? todayKey()
  const db = useDB()
  const list = useMemo(() => prioritiesOf(db, date), [db, date])
  const groups = useMemo(() => suggestionsFor(db, date), [db, date])
  const [draft, setDraft] = useState('')
  const full = list.length >= MAX_PRIORITIES
  const chosen = new Set(list.map((p) => (p.ref ? `${p.ref.type}:${p.ref.id}` : p.title.toLowerCase())))

  const add = (title: string, ref?: Suggestion['ref']) => {
    const res = addPriority(date, title, ref)
    if (res.ok) {
      haptic('light')
      setDraft('')
    } else if (res.reason === 'full') toast(FULL_COPY)
    else if (res.reason === 'duplicate') toast('Essa já está nas suas 3 ✓')
  }

  const isToday = date === todayKey()

  return (
    <SheetLayout eyebrow={isToday ? formatLongDate(date) : relativeDay(date)} title="Minhas 3 prioridades" onClose={closeSheet} primary={{ label: 'Pronto', onClick: closeSheet }}>
      {list.length > 0 ? (
        <SortableList
          items={list}
          onReorder={(ids) => actions.reorder('priorities', ids)}
          className="space-y-2"
          renderItem={(p, handle) => (
            <div className="flex items-center gap-2 bg-surface-2 rounded-2xl pl-3.5 pr-1 min-h-[56px]">
              <Checkbox checked={p.done} onChange={(v) => setPriorityDone(p.id, v)} label={`Concluir ${p.title}`} />
              <input
                value={p.title}
                onChange={(e) => actions.update('priorities', p.id, { title: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && actions.update('priorities', p.id, { title: 'Prioridade' })}
                aria-label="Título da prioridade"
                className={cn('flex-1 min-w-0 bg-transparent outline-none py-2 pl-1 text-[16px]', p.done && 'text-muted line-through')}
              />
              {handle}
              <button
                type="button"
                aria-label="Remover"
                onClick={() => {
                  const removed = actions.remove('priorities', p.id)
                  if (removed) toast('Removida', { action: { label: 'Desfazer', run: () => actions.restore('priorities', removed) } })
                }}
                className="h-11 w-9 inline-flex items-center justify-center text-muted"
              >
                <X size={17} />
              </button>
            </div>
          )}
        />
      ) : (
        <p className="font-display text-[19px] leading-snug text-ink-2">Se o dia só tivesse espaço pra três coisas, quais seriam?</p>
      )}

      {full ? (
        <div className="rounded-2xl bg-sand-soft px-4 py-3 text-[14px] text-ink-2">{FULL_COPY}</div>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              add(draft)
            }}
            className="flex items-center gap-2 rounded-2xl bg-surface-2 pl-4 pr-1.5 min-h-[52px]"
          >
            <input
              autoFocus={list.length === 0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Escrever a ${list.length + 1}ª…`}
              enterKeyHint="done"
              className="flex-1 min-w-0 bg-transparent outline-none py-3"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Adicionar" className="h-10 w-10 rounded-full bg-ink text-bg inline-flex items-center justify-center disabled:opacity-30 transition">
              <ArrowUp size={18} />
            </button>
          </form>

          {groups.length > 0 && (
            <div className="space-y-4 pt-1">
              <div className="eyebrow">ou escolher de</div>
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="text-[12.5px] text-muted mb-1.5 px-0.5">{g.label}</div>
                  <div className="flex flex-col gap-1.5">
                    {g.items.map((s) => {
                      const already = chosen.has(s.ref ? `${s.ref.type}:${s.ref.id}` : s.title.toLowerCase())
                      return (
                        <button
                          key={s.key}
                          type="button"
                          disabled={already}
                          onClick={() => add(s.title, s.ref)}
                          className="flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-xl border border-line text-left text-[14.5px] active:bg-surface-2 disabled:opacity-40 transition"
                        >
                          <span aria-hidden className="w-5 text-center">
                            {s.emoji}
                          </span>
                          <span className="flex-1 min-w-0 truncate">{s.title}</span>
                          <span className="text-[12px] text-muted">{already ? 'escolhida' : '+'}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SheetLayout>
  )
}
