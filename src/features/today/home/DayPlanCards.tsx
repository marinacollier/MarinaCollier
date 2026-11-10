/**
 * Home · Check-in do dia and the optional end-of-day review. (The plan itself lives on the ONE timeline —
 * see allocation.ts / DayAssist.tsx; there is no second planner card anymore.)
 * Compact cards (never a modal wall). Every action can be undone; reasons are optional and skippable.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from '@/app/ui-store'
import type { CalendarEntry } from '@/data/calendar/universal'
import { dayCapacity } from '@/data/priority/capacity'
import type { Energy } from '@/data/priority/contract'
import { getDB, useDB } from '@/data/store'
import { applyModeOf, replanRest } from './allocation'
import type { DateKey } from '@/data/types'
import { nowISO } from '@/lib/id'
import { cn } from '@/lib/cn'
import { Eyebrow } from './CleanBlocks'
import { ENERGY_LABEL, formatMin, FREE_CHIPS, INTEREST_CHIPS, REVIEW_FROM_MIN, saveDayCheckin, yesterdayEnergy } from './day-checkin'

const chipCls = (on: boolean) => cn('h-9 px-3 rounded-full text-[13.5px] whitespace-nowrap active:scale-95 transition', on ? 'bg-accent text-bg' : 'bg-surface-2 text-ink-2')
const input = 'w-full min-h-10 rounded-xl bg-surface-2 px-3 py-2 text-[15px] text-ink placeholder:text-muted outline-none'

function Card({ label, title, children, aria }: { label?: string; title: ReactNode; children: ReactNode; aria: string }) {
  return (
    <section aria-label={aria} className="rounded-2xl border border-line/70 bg-surface p-4">
      <Eyebrow label={label}>{title}</Eyebrow>
      {children}
    </section>
  )
}

const withUndo = (message: string, undo: () => void) => toast(message, { action: { label: 'Desfazer', run: undo } })

// ─── Check-in ───────────────────────────────────────────────────────────────

export function DayCheckinCard({ date, nowMin, entries }: { date: DateKey; nowMin: number; entries?: CalendarEntry[] }) {
  const db = useDB()
  const suggestedEnergy = yesterdayEnergy(db, date)
  const [energy, setEnergy] = useState<Energy | undefined>(suggestedEnergy)
  const cap = useMemo(() => dayCapacity(db, date, nowMin, energy ?? 3, entries), [db, date, nowMin, energy, entries])
  const [free, setFree] = useState<number | 'calc' | undefined>('calc')
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [mood, setMood] = useState('')
  const [note, setNote] = useState('')
  const [interest, setInterest] = useState('')

  const freeMin = free === 'calc' ? cap.freeMin : free
  const save = () => {
    const undo = saveDayCheckin(date, {
      freeMin,
      energy,
      mood: mood.trim() || undefined,
      note: note.trim() || undefined,
      interest: interest.trim() || undefined,
      skipped: false,
    })
    // The day's plan follows her answers (auto mode): the engine's blocks are redone; fixed things never move.
    const r = applyModeOf(getDB()) === 'auto' ? replanRest(date, nowMin, entries) : undefined
    withUndo(r?.changed ? `Check-in salvo. ${r.message}` : 'Check-in salvo', () => {
      r?.undo?.()
      undo()
    })
  }
  const skip = () => withUndo('Tudo bem, segue o dia', saveDayCheckin(date, { skipped: true }))
  const toggleInterest = (chip: string) => {
    const parts = interest
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    setInterest((parts.includes(chip) ? parts.filter((p) => p !== chip) : [...parts, chip]).join(', '))
  }

  return (
    <Card aria="Check-in do dia" label="Check-in" title="Como está teu dia?">
      <p className="text-[14px] text-ink-2 mt-1">Quanto tempo livre tu tem hoje para atividades flexíveis?</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Tempo livre">
        {FREE_CHIPS.map((c) => (
          <button key={c.min} type="button" className={chipCls(free === c.min)} aria-pressed={free === c.min} onClick={() => (setFree(c.min), setTyping(false))}>
            {c.label}
          </button>
        ))}
        <button type="button" className={chipCls(typing)} aria-pressed={typing} onClick={() => setTyping(true)}>
          Informar
        </button>
        <button type="button" className={chipCls(free === 'calc')} aria-pressed={free === 'calc'} onClick={() => (setFree('calc'), setTyping(false))}>
          Calcula pela agenda
        </button>
      </div>
      {typing && (
        <input
          className={cn(input, 'mt-2')}
          inputMode="numeric"
          aria-label="Minutos livres"
          placeholder="Minutos (ex.: 90)"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            const n = Number(e.target.value.replace(/\D/g, ''))
            setFree(Number.isFinite(n) && n > 0 ? n : undefined)
          }}
        />
      )}
      {free === 'calc' && <p className="text-[12.5px] text-muted mt-1.5">Pela agenda: ~{formatMin(cap.freeMin)} livres até dormir (já com folgas e margem).</p>}

      <p className="text-[14px] text-ink-2 mt-4">Energia</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Energia">
        {([1, 2, 3, 4, 5] as Energy[]).map((e) => (
          <button key={e} type="button" className={chipCls(energy === e)} aria-pressed={energy === e} onClick={() => setEnergy(e)}>
            {ENERGY_LABEL[e]}
          </button>
        ))}
      </div>
      {suggestedEnergy && energy === suggestedEnergy && <p className="text-[12.5px] text-muted mt-1.5">Sugestão a partir de ontem — muda se não for assim hoje.</p>}

      <div className="mt-4 grid gap-2">
        <input className={input} aria-label="Como tu está?" placeholder="Como tu está? (opcional)" value={mood} onChange={(e) => setMood(e.target.value)} />
        <input className={input} aria-label="Algo importante pra hoje?" placeholder="Algo importante pra hoje? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <input
          className={input}
          aria-label="Interesse de hoje"
          placeholder="Interesse de hoje (ex.: política, não quero idiomas)"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sugestões de interesse">
          {INTEREST_CHIPS.map((c) => (
            <button key={c} type="button" className={chipCls(interest.includes(c))} onClick={() => toggleInterest(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={save} className="flex-1 h-11 rounded-full bg-accent text-bg text-[15px] font-medium active:scale-[0.98]">
          Pronto
        </button>
        <button type="button" onClick={skip} className="h-11 px-5 rounded-full bg-surface-2 text-ink-2 text-[15px] active:opacity-70">
          Pular
        </button>
      </div>
    </Card>
  )
}

// ─── Revisão do fim do dia ──────────────────────────────────────────────────

const REVIEW: {
  key: 'aconteceu' | 'pendente' | 'mudou' | 'amanha'
  q: string
}[] = [
  { key: 'aconteceu', q: 'O que aconteceu?' },
  { key: 'pendente', q: 'O que ficou pendente?' },
  { key: 'mudou', q: 'O que mudou?' },
  { key: 'amanha', q: 'Algo importante pra amanhã?' },
]

export const showReview = (nowMin: number, review: { at?: string; dismissed?: boolean } | undefined) => nowMin >= REVIEW_FROM_MIN && !review?.at && !review?.dismissed

export function DayReviewCard({ date }: { date: DateKey }) {
  const [a, setA] = useState<Record<string, string>>({})
  const save = () => {
    const clean = Object.fromEntries(REVIEW.map((r) => [r.key, a[r.key]?.trim() || undefined]))
    withUndo('Guardado. Bom descanso', saveDayCheckin(date, { review: { ...clean, at: nowISO() } }))
  }
  return (
    <Card aria="Fim do dia" label="Fim do dia" title="Como foi hoje?">
      <div className="mt-2 grid gap-2">
        {REVIEW.map((r) => (
          <input key={r.key} className={input} aria-label={r.q} placeholder={r.q} value={a[r.key] ?? ''} onChange={(e) => setA((v) => ({ ...v, [r.key]: e.target.value }))} />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} className="flex-1 h-10 rounded-full bg-accent text-bg text-[14px] font-medium">
          Guardar
        </button>
        <button type="button" onClick={() => saveDayCheckin(date, { review: { dismissed: true } })} className="h-10 px-4 rounded-full bg-surface-2 text-ink-2 text-[14px]">
          Agora não
        </button>
      </div>
    </Card>
  )
}
