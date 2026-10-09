/**
 * HOJE + PRÓXIMOS — the Home as a command center, calm by progressive disclosure:
 *   Hoje       open: mais cedo (folded) · agora · depois · quando der hoje · feitos hoje (folded)
 *   Próximos   amanhã with its main items · each next day as one line (tap = everything) · sem dia (folded)
 * Rows come from the ActionItem projection (one record each). A small uppercase front label says where it
 * comes from; the action stays the biggest thing on the line.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import type { ActionItem, FrontGroup, TodaySections, UpcomingDay } from '@/data/agenda/items'
import type { DateKey } from '@/data/types'
import { WEEKDAY_SHORT, formatDayMonth, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { checkItem, openItem } from './act'
import { Eyebrow } from './blocks'

type Filter = 'tudo' | FrontGroup
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'trabalho', label: 'Trabalho' },
  { id: 'corpo', label: 'Corpo' },
  { id: 'vida', label: 'Vida' },
]
const keep = (f: Filter) => (i: ActionItem) => f === 'tudo' || i.front.group === f

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function CheckButton({ item, onDone }: { item: ActionItem; onDone?: () => void }) {
  const done = item.status === 'done'
  if (item.check === 'none') {
    return (
      <span className="h-11 w-9 shrink-0 inline-flex items-center justify-center" aria-hidden>
        <span className={cn('h-[7px] w-[7px] rounded-full', item.important ? 'bg-accent' : 'bg-line')} />
      </span>
    )
  }
  const verb = item.check === 'meal' ? 'Comi' : item.check === 'workout' ? 'Treino feito' : 'Concluir'
  return (
    <button
      type="button"
      aria-label={done ? `Desmarcar ${item.title}` : `${verb}: ${item.title}`}
      aria-pressed={done}
      onClick={() => {
        checkItem(item)
        onDone?.()
      }}
      className="h-11 w-9 shrink-0 -ml-1 inline-flex items-center justify-center active:scale-90 transition"
    >
      <span className={cn('h-[22px] w-[22px] rounded-full border-[1.5px] inline-flex items-center justify-center transition-colors', done ? 'bg-sage border-sage text-bg' : 'border-ink/30')}>
        {done && <Check size={13} strokeWidth={3} />}
      </span>
    </button>
  )
}

export function ActionRow({ item, today, showTime = true }: { item: ActionItem; today: DateKey; showTime?: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const done = item.status === 'done'
  const routine = item.check === 'routine' && !!item.children?.length
  return (
    <li>
      <div className="flex items-start gap-1.5 min-h-[52px]">
        {showTime && <span className={cn('w-[50px] shrink-0 pt-[13px] font-sport text-[16px] tabular-nums', done ? 'text-muted/60' : 'text-ink')}>{item.start ?? ''}</span>}
        <CheckButton item={item} />
        <button type="button" onClick={() => (routine ? setOpen((o) => !o) : openItem(item, today, navigate))} className="flex-1 min-w-0 text-left py-[7px] active:opacity-70">
          {(item.front.label || item.priority !== undefined) && (
            <span className="block text-[10.5px] tracking-[0.12em] uppercase text-muted font-semibold leading-4 truncate">
              {item.priority !== undefined && <span className="text-accent">Top {item.priority + 1}</span>}
              {item.priority !== undefined && item.front.label && ' · '}
              {item.front.label}
            </span>
          )}
          <span className={cn('block text-[15.5px] leading-snug', done ? 'text-muted line-through decoration-muted/40' : 'text-ink')}>
            {item.emoji && <span className="mr-1.5">{item.emoji}</span>}
            {item.title}
            {(item.sub || (done && item.doneAt)) && <span className="text-muted text-[13px]"> · {done && item.doneAt ? `✓ ${item.doneAt}` : item.sub}</span>}
          </span>
        </button>
        {routine && (
          <button type="button" aria-label={open ? `Recolher ${item.title}` : `Ver itens de ${item.title}`} onClick={() => setOpen((o) => !o)} className="h-11 w-9 shrink-0 inline-flex items-center justify-center text-muted">
            <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
          </button>
        )}
      </div>
      {routine && open && (
        <ul className={cn(showTime ? 'pl-[50px]' : 'pl-2')}>
          {item.children!.map((c) => (
            <ActionRow key={c.key} item={{ ...c, front: { label: '', group: c.front.group } }} today={today} showTime={false} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Fold({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="min-h-11 w-full flex items-center gap-1.5 text-left text-[13px] text-muted active:opacity-70">
        <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && children}
    </div>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] tracking-[0.18em] uppercase text-muted font-semibold mt-4 mb-0.5">{children}</div>
}

// ─── HOJE ───────────────────────────────────────────────────────────────────

export function HojeBlock({ sections, today }: { sections: TodaySections; today: DateKey }) {
  const [filter, setFilter] = useState<Filter>('tudo')
  const f = keep(filter)
  const s = useMemo(() => ({ earlier: sections.earlier.filter(f), now: sections.now.filter(f), later: sections.later.filter(f), anytime: sections.anytime.filter(f), done: sections.done.filter(f) }), [sections, f])
  const open = s.earlier.length + s.now.length + s.later.length + s.anytime.length
  const showFilters = sections.total > 8
  return (
    <section aria-label="Hoje">
      <Eyebrow action={<span className="text-[13px] text-muted">{open ? plural(open, 'pendente', 'pendentes') : ''}</span>}>Hoje</Eyebrow>
      {showFilters && (
        <div className="flex gap-1.5 -mt-0.5 mb-1" role="tablist" aria-label="Filtrar">
          {FILTERS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={filter === x.id} onClick={() => setFilter(x.id)} className={cn('h-8 px-3 rounded-full text-[12.5px] transition-colors', filter === x.id ? 'bg-ink text-bg' : 'text-muted active:bg-surface-2')}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      {open === 0 && <p className="text-[15px] text-ink-2 py-2">{s.done.length ? 'Tudo feito por hoje ✨' : 'Nada pendente hoje ✨'}</p>}
      {s.earlier.length > 0 && (
        <Fold label={`Mais cedo · ${plural(s.earlier.length, 'em aberto', 'em aberto')}`}>
          <ul>
            {s.earlier.map((i) => (
              <ActionRow key={i.key} item={i} today={today} />
            ))}
          </ul>
        </Fold>
      )}
      {s.now.length > 0 && (
        <>
          <Sub>Agora</Sub>
          <ul>
            {s.now.map((i) => (
              <ActionRow key={i.key} item={i} today={today} />
            ))}
          </ul>
        </>
      )}
      {s.later.length > 0 && (
        <>
          <Sub>Depois</Sub>
          <ul>
            {s.later.map((i) => (
              <ActionRow key={i.key} item={i} today={today} />
            ))}
          </ul>
        </>
      )}
      {s.anytime.length > 0 && (
        <>
          <Sub>Quando der hoje</Sub>
          <ul>
            {s.anytime.map((i) => (
              <ActionRow key={i.key} item={i} today={today} showTime={false} />
            ))}
          </ul>
        </>
      )}
      {s.done.length > 0 && (
        <div className="mt-2">
          <Fold label={`Feitos hoje · ${s.done.length}`}>
            <ul>
              {s.done.map((i) => (
                <ActionRow key={i.key} item={i} today={today} />
              ))}
            </ul>
          </Fold>
        </div>
      )}
    </section>
  )
}

// ─── PRÓXIMOS ───────────────────────────────────────────────────────────────

function dayName(date: DateKey, index: number): string {
  if (index === 0) return 'Amanhã'
  return `${WEEKDAY_SHORT[weekday(date)]} ${formatDayMonth(date)}`
}

function DayLine({ day, today, index }: { day: UpcomingDay; today: DateKey; index: number }) {
  const [open, setOpen] = useState(index === 0)
  const first = index === 0
  const [all, setAll] = useState(false)
  // Tomorrow opens with its first 4 (timed first, then Top 3 / what matters); the rest is one tap away.
  const list = first && !all ? day.items.slice(0, 4) : day.items
  const summary = day.highlights.map((h) => (h.start ? `${h.title.replace(/^.*?·\s*/, '')} ${h.start}` : h.title)).slice(0, 2).join(' · ')
  return (
    <li className="border-t border-line/70 first:border-t-0">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full min-h-[52px] flex items-baseline gap-3 py-2 text-left active:opacity-70">
        <span className={cn('w-[86px] shrink-0 text-[14px] font-semibold', first ? 'text-ink' : 'text-ink-2')}>{dayName(day.date, index)}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] text-muted">
            {day.count ? plural(day.count, 'item', 'itens') : 'livre'}
            {day.prioCount > 0 && ` · ${plural(day.prioCount, 'prioritário', 'prioritários')}`}
          </span>
          {!open && summary && <span className="block text-[13.5px] text-ink-2 truncate">{summary}</span>}
        </span>
        <ChevronDown size={15} className={cn('text-muted shrink-0 transition-transform self-center', open && 'rotate-180')} />
      </button>
      {open && day.items.length > 0 && (
        <ul className="pb-2">
          {list.map((i) => (
            <ActionRow key={i.key} item={i} today={today} />
          ))}
          {first && !all && day.items.length > 4 && (
            <li>
              <button type="button" onClick={() => setAll(true)} className="h-10 pl-[86px] text-[13px] text-accent font-medium">
                ver todos os {day.items.length}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

export function ProximosBlock({ days, undated, today }: { days: UpcomingDay[]; undated: ActionItem[]; today: DateKey }) {
  const byFront = useMemo(() => {
    const m = new Map<string, ActionItem[]>()
    for (const i of undated) m.set(i.front.label || 'GERAL', [...(m.get(i.front.label || 'GERAL') ?? []), i])
    return [...m.entries()]
  }, [undated])
  return (
    <section aria-label="Próximos">
      <Eyebrow>Próximos</Eyebrow>
      <ul>
        {days.map((d, i) => (
          <DayLine key={d.date} day={d} today={today} index={i} />
        ))}
      </ul>
      {undated.length > 0 && (
        <div className="border-t border-line/70">
          <Fold label={`Sem dia · ${plural(undated.length, 'coisa pra fazer', 'coisas pra fazer')}`}>
            {byFront.map(([front, list]) => (
              <div key={front}>
                <Sub>{front}</Sub>
                <ul>
                  {list.map((i) => (
                    <ActionRow key={i.key} item={{ ...i, front: { label: '', group: i.front.group } }} today={today} showTime={false} />
                  ))}
                </ul>
              </div>
            ))}
          </Fold>
        </div>
      )}
    </section>
  )
}
