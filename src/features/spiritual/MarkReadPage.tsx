/**
 * "Li e não registrei": choose several chapters of a plan and mark them as concluded — with a date she picks
 * or "data desconhecida" (never invented). Chapters already concluded are shown as such and left alone.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, DateInput, Page, PageHeader, Segmented } from '@/components/ui'
import { persist, useDB } from '@/data/store'
import { plansOf, sessionsOf } from '@/data/spiritual/model'
import { markSessionsDone } from '@/data/spiritual/ops'
import { todayKey } from '@/lib/date'
import { cn } from '@/lib/cn'

export default function MarkReadPage() {
  const db = useDB()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const plans = useMemo(() => plansOf(db), [db])
  const [planId, setPlanId] = useState(params.get('plano') ?? plans[0]?.id ?? '')
  const sessions = useMemo(() => sessionsOf(db, planId), [db, planId])
  // One book (Êxodo 1–40): a compact grid of chapter numbers; mixed references: two columns.
  const oneBook = sessions.length > 8 && new Set(sessions.map((x) => x.scriptureReference.replace(/\s*\d+.*$/, ''))).size === 1
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [when, setWhen] = useState<'desconhecida' | 'data'>('desconhecida')
  const [date, setDate] = useState<string | undefined>(todayKey())

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const apply = () => {
    const n = markSessionsDone([...picked], when === 'data' ? date : undefined)
    void persist()
    toast(`${n} ${n === 1 ? 'capítulo marcado' : 'capítulos marcados'} como concluído${when === 'desconhecida' ? ' (data desconhecida)' : ''}`)
    setPicked(new Set())
    nav(ROUTES.bible)
  }

  return (
    <Page>
      <PageHeader title="Marcar leituras" eyebrow="Bíblia" subtitle="Capítulos que você leu e não registrou." back backTo={ROUTES.bible} />
      <Segmented
        variant="tabs"
        value={planId}
        onChange={(v) => {
          setPlanId(v)
          setPicked(new Set())
        }}
        options={plans.map((p) => ({ value: p.id, label: p.bookOrTheme }))}
      />
      <Card className="mt-3 p-2">
        {oneBook && <div className="text-[12px] text-muted px-2 pt-1 pb-2">{sessions[0].scriptureReference.replace(/\s*\d+.*$/, '')} · toque nos capítulos</div>}
        <div className={cn('grid gap-1', oneBook ? 'grid-cols-5' : 'grid-cols-2')}>
          {sessions.map((s) => {
            const done = s.status === 'concluido'
            const on = picked.has(s.id)
            return (
              <button
                key={s.id}
                type="button"
                disabled={done}
                aria-pressed={on}
                aria-label={done ? `${s.scriptureReference} (concluído)` : s.scriptureReference}
                onClick={() => toggle(s.id)}
                className={cn(
                  'h-11 rounded-xl text-[14px] flex items-center gap-2',
                  oneBook ? 'justify-center' : 'px-3 text-left',
                  done ? 'text-muted' : on ? 'bg-plum-soft text-ink font-medium' : 'text-ink-2',
                  oneBook && done && 'line-through',
                  oneBook && !done && !on && 'border border-line',
                )}
              >
                {oneBook ? (
                  s.chapterNumber ?? s.sortOrder
                ) : (
                  <>
                <span className={cn('size-4 rounded-full border shrink-0', done ? 'bg-line border-line' : on ? 'bg-plum border-plum' : 'border-muted')} />
                <span className="truncate">{s.scriptureReference}</span>
                {done && <span className="text-[11px] ml-auto">feito</span>}
                  </>
                )}
              </button>
            )
          })}
        </div>
      </Card>
      <Card className="mt-3 space-y-3">
        <Segmented
          value={when}
          onChange={setWhen}
          options={[
            { value: 'desconhecida', label: 'Data desconhecida' },
            { value: 'data', label: 'Escolher data' },
          ]}
        />
        {when === 'data' && <DateInput value={date} onChange={setDate} max={todayKey()} aria-label="Data da leitura" />}
        <Button variant="primary" block disabled={!picked.size || (when === 'data' && !date)} onClick={apply}>
          Marcar {picked.size || ''} como {picked.size === 1 ? 'concluído' : 'concluídos'}
        </Button>
      </Card>
    </Page>
  )
}
