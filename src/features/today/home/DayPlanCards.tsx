/**
 * Home · Check-in do dia, "O que faz sentido fazer agora?" and the optional end-of-day review.
 * Compact cards (never a modal wall). Every action can be undone; reasons are optional and skippable.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import type { CalendarEntry } from '@/data/calendar/universal'
import { dayCapacity } from '@/data/priority/capacity'
import type { Candidate, Energy } from '@/data/priority/contract'
import type { PlanItem } from '@/data/priority/engine'
import { useDB } from '@/data/store'
import type { DateKey, DayChangeAction } from '@/data/types'
import { addDays } from '@/lib/date'
import { nowISO } from '@/lib/id'
import { cn } from '@/lib/cn'
import { Eyebrow } from './CleanBlocks'
import {
  checkinOf,
  complete,
  ENERGY_LABEL,
  formatMin,
  FREE_CHIPS,
  INTEREST_CHIPS,
  logChange,
  planFor,
  postpone,
  reasonForLast,
  REVIEW_FROM_MIN,
  saveDayCheckin,
  split,
  yesterdayEnergy,
} from './day-checkin'

const chipCls = (on: boolean) => cn('h-9 px-3 rounded-full text-[13.5px] whitespace-nowrap active:scale-95 transition', on ? 'bg-accent text-bg' : 'bg-surface-2 text-ink-2')
const smallBtn = 'h-9 px-3 rounded-full text-[13px] bg-surface-2 text-ink-2 active:opacity-70'
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
    withUndo('Check-in salvo', undo)
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

// ─── O que faz sentido agora? ───────────────────────────────────────────────

type Panel = { key: string; kind: 'adiar' | 'dividir' } | { key: string; kind: 'reason' }

function ItemActions({ c, onAct }: { c: Candidate; onAct: (a: DayChangeAction | 'comecar' | 'adiar_panel' | 'dividir_panel', c: Candidate) => void }) {
  const btn = (label: string, a: Parameters<typeof onAct>[0]) => (
    <button type="button" className={smallBtn} onClick={() => onAct(a, c)} aria-label={`${label}: ${c.title}`}>
      {label}
    </button>
  )
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {btn('Começar agora', 'comecar')}
      {btn('Mais tarde', 'mais_tarde')}
      {btn('Adiar', 'adiar_panel')}
      {c.open?.kind === 'task' && btn('Dividir', 'dividir_panel')}
      {btn('Trocar', 'trocar')}
      {btn('Já concluí', 'concluir')}
      {btn('Hoje não', 'hoje_nao')}
    </div>
  )
}

function Item({ item, main, onAct, panel }: { item: PlanItem; main?: boolean; onAct: Parameters<typeof ItemActions>[0]['onAct']; panel?: ReactNode }) {
  const { c } = item
  return (
    <li className="py-2.5">
      <p className={cn('text-ink', main ? 'text-[17px] font-medium' : 'text-[15px]')}>{c.title}</p>
      <p className="text-[12.5px] text-muted mt-0.5">
        ~{formatMin(item.minutes)}
        {item.slot && ` · sugestão ${item.slot.start}–${item.slot.end}`}
        {c.reasons[0] && ` · ${c.reasons[0]}`}
      </p>
      {main && c.reasons.length > 1 && <p className="text-[12.5px] text-muted">{c.reasons.slice(1).join(' · ')}</p>}
      {c.nextStep && <p className="text-[13.5px] text-ink-2 mt-1">Próximo passo: {c.nextStep}</p>}
      <ItemActions c={c} onAct={onAct} />
      {panel}
    </li>
  )
}

export function NowPlanCard({ date, nowMin, entries }: { date: DateKey; nowMin: number; entries?: CalendarEntry[] }) {
  const db = useDB()
  const navigate = useNavigate()
  const plan = useMemo(() => planFor(db, date, nowMin, entries), [db, date, nowMin, entries])
  const checkin = checkinOf(db, date)
  const [panel, setPanel] = useState<Panel>()
  const [text, setText] = useState('')
  const [to, setTo] = useState<DateKey>(addDays(date, 1))
  const [showLater, setShowLater] = useState(false)

  const afterChange = (key: string, message: string, undo: () => void) => {
    withUndo(message, undo)
    setText('')
    setPanel({ key, kind: 'reason' })
  }

  const open = (c: Candidate) => {
    const o = c.open
    if (o?.kind === 'task' && o.id) openSheet('task', { id: o.id })
    else if (o?.kind === 'study') navigate(o.to ?? ROUTES.study)
    else if (o?.kind === 'routine') navigate(ROUTES.routineSettings)
    else if (o?.to) navigate(o.to)
  }

  const onAct: Parameters<typeof ItemActions>[0]['onAct'] = (a, c) => {
    if (a === 'comecar') return open(c)
    if (a === 'adiar_panel') return (setTo(addDays(date, 1)), setText(''), setPanel({ key: c.key, kind: 'adiar' }))
    if (a === 'dividir_panel') return (setText(''), setPanel({ key: c.key, kind: 'dividir' }))
    if (a === 'concluir') return afterChange(c.key, 'Feito ✓', complete(date, c.key))
    const msg: Partial<Record<DayChangeAction, string>> = {
      mais_tarde: 'Fica pra mais tarde',
      trocar: 'Trocado — olha a próxima ideia',
      hoje_nao: 'Ok, hoje não',
    }
    afterChange(c.key, msg[a] ?? 'Pronto', logChange(date, c.key, a))
  }

  const global = (a: 'sem_energia' | 'menos_tempo' | 'mais_tempo' | 'reorganizar') => {
    const energy = (checkin?.energy ?? 3) as Energy
    const free = checkin?.freeMin ?? plan.freeMin
    if (a === 'reorganizar') return toast('Plano refeito com o agora')
    if (a === 'sem_energia')
      return afterChange(
        'day',
        'Ajustei pra menos energia',
        logChange(date, 'day', a, {
          energy: Math.max(1, energy - 1) as Energy,
        }),
      )
    const next = Math.max(0, free + (a === 'mais_tempo' ? 30 : -30))
    afterChange('day', a === 'mais_tempo' ? 'Mais 30 min no plano' : 'Menos 30 min no plano', logChange(date, 'day', a, { freeMin: next }))
  }

  const panelFor = (key: string): ReactNode => {
    if (panel?.key !== key) return null
    if (panel.kind === 'reason') return null
    return editPanel(key, panel.kind)
  }

  const reasonPanel = (): ReactNode => {
    if (panel?.kind !== 'reason') return null
    return (
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          reasonForLast(date, text)
          setPanel(undefined)
        }}
      >
        <input className={input} aria-label="Motivo (opcional)" placeholder="Quer dizer por quê? (opcional)" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className={smallBtn}>
          {text.trim() ? 'Salvar' : 'Fechar'}
        </button>
      </form>
    )
  }

  const editPanel = (key: string, kind: 'adiar' | 'dividir'): ReactNode => {
    if (kind === 'adiar')
      return (
        <div className="mt-2 grid gap-1.5">
          <input type="date" className={input} aria-label="Adiar para" value={to} min={addDays(date, 1)} onChange={(e) => setTo(e.target.value || addDays(date, 1))} />
          <input className={input} aria-label="Motivo (opcional)" placeholder="Motivo (opcional)" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-1.5">
            <button
              type="button"
              className={smallBtn}
              onClick={() => {
                withUndo('Adiado, sem problema', postpone(date, key, to, text.trim() || undefined))
                setPanel(undefined)
              }}
            >
              Adiar
            </button>
            <button type="button" className={smallBtn} onClick={() => setPanel(undefined)}>
              Cancelar
            </button>
          </div>
        </div>
      )
    return (
      <div className="mt-2 grid gap-1.5">
        <textarea className={cn(input, 'min-h-20')} aria-label="Etapas" placeholder="Uma etapa por linha" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-1.5">
          <button
            type="button"
            className={smallBtn}
            disabled={!text.trim()}
            onClick={() => {
              const undo = split(date, key, text)
              if (undo) withUndo('Etapas criadas', undo)
              setPanel(undefined)
            }}
          >
            Criar etapas
          </button>
          <button type="button" className={smallBtn} onClick={() => setPanel(undefined)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <Card aria="O que faz sentido agora" label="Com calma" title="O que faz sentido fazer agora?">
      {plan.restHint && <p className="text-[14px] text-ink-2 mt-1">{plan.restHint}</p>}
      {plan.primary ? (
        <ul aria-label="Principal">
          <Item item={plan.primary} main onAct={onAct} panel={panelFor(plan.primary.c.key)} />
        </ul>
      ) : (
        <p className="text-[15px] text-ink-2 py-2">Nada precisa caber agora. Aproveita o espaço.</p>
      )}
      {plan.secondary.length > 0 && (
        <ul aria-label="Se sobrar tempo" className="divide-y divide-line/60 border-t border-line/60">
          {plan.secondary.map((i) => (
            <Item key={i.c.key} item={i} onAct={onAct} panel={panelFor(i.c.key)} />
          ))}
        </ul>
      )}
      {reasonPanel()}

      {plan.essentials.length > 0 && (
        <p aria-label="Essenciais" className="text-[13px] text-ink-2 mt-3">
          <span className="text-muted">Essenciais: </span>
          {plan.essentials.map((e) => e.title).join(' · ')}
        </p>
      )}
      <p className="text-[13px] text-ink-2 mt-1.5">Espaço livre: {formatMin(plan.freeSpaceMin)}</p>

      {plan.later.length > 0 && (
        <div className="mt-2">
          <button type="button" className="h-9 inline-flex items-center gap-1 text-[13px] text-muted" aria-expanded={showLater} onClick={() => setShowLater((v) => !v)}>
            Podem esperar ({plan.later.length})
            <ChevronDown size={14} aria-hidden className={cn('transition', showLater && 'rotate-180')} />
          </button>
          {showLater && (
            <ul aria-label="Podem esperar" className="text-[13px] text-ink-2">
              {plan.later.slice(0, 12).map((l) => (
                <li key={l.c.key} className="py-1">
                  {l.c.title} <span className="text-muted">· {l.why}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/60 pt-3">
        <button type="button" className={smallBtn} onClick={() => global('sem_energia')}>
          Estou sem energia
        </button>
        <button type="button" className={smallBtn} onClick={() => global('menos_tempo')}>
          Tenho menos tempo
        </button>
        <button type="button" className={smallBtn} onClick={() => global('mais_tempo')}>
          Tenho mais tempo
        </button>
        <button type="button" className={smallBtn} onClick={() => global('reorganizar')}>
          Reorganizar
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
