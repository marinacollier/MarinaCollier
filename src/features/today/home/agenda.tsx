/**
 * AGORA · HOJE · PRÓXIMOS DIAS — every list on Home is the standard ItemRow:
 *   check · title · area tag + one fact · time on the right · priority dot.
 * Tapping a row (not the check) opens the one quick-edit sheet (Dia · Hora · Obs · Abrir completo).
 * Rows come from the ActionItem projection (data/agenda/items.ts); the split/meta is ./rows.ts.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { RowArea } from '@/components/ui/ItemRow'
import { AREA_TAG, ItemList, ItemRow } from '@/components/ui'
import { openSheet, toast } from '@/app/ui-store'
import type { ActionItem, UpcomingDay } from '@/data/agenda/items'
import { persist, useDB } from '@/data/store'
import type { DateKey, DayPriority } from '@/data/types'
import { WEEKDAY_SHORT, weekday } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { setPriorityDone } from '../priorities'
import { openPriorities } from '../open-priorities'
import { checkItem } from './act'
import { areaOf, daySummary, rowView, type HomeLists } from './rows'

export function Eyebrow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between min-h-9 mb-0.5">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** One ActionItem as the standard row. */
export function HomeRow({ item, today, minutes, showWhen = true }: { item: ActionItem; today: DateKey; minutes: number; showWhen?: boolean }) {
  const db = useDB()
  const v = rowView(db, item, today, minutes)
  const done = item.status === 'done'
  return (
    <ItemRow
      title={item.title}
      area={v.area}
      meta={v.meta}
      late={v.late}
      priority={v.priority}
      when={showWhen ? item.start : undefined}
      checked={done}
      onCheck={item.check === 'none' ? undefined : () => checkItem(item)}
      onOpen={() => openSheet('itemEdit', { item, today })}
    />
  )
}

function Fold({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="min-h-11 w-full flex items-center gap-1.5 text-left text-[13.5px] text-muted active:opacity-70">
        <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && children}
    </div>
  )
}

// ─── AGORA ──────────────────────────────────────────────────────────────────

export function AgoraBlock({ items, today, minutes }: { items: ActionItem[]; today: DateKey; minutes: number }) {
  if (!items.length) return null
  return (
    <section aria-label="Agora">
      <Eyebrow>
        <span className="text-accent">Agora</span>
      </Eyebrow>
      <ItemList>
        {items.map((i) => (
          <HomeRow key={i.key} item={i} today={today} minutes={minutes} />
        ))}
      </ItemList>
    </section>
  )
}

// ─── HOJE ───────────────────────────────────────────────────────────────────

type Filter = 'tudo' | RowArea
const FILTER_KEY = 'marina.home.filter'
function readFilter(): Filter {
  try {
    return (localStorage.getItem(FILTER_KEY) as Filter | null) ?? 'tudo'
  } catch {
    return 'tudo'
  }
}
function writeFilter(f: Filter) {
  try {
    localStorage.setItem(FILTER_KEY, f)
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/** Area chip order. */
const ORDER: RowArea[] = ['trabalho', 'creator', 'corpo', 'vida', 'casa', 'luna', 'dinheiro', 'viagem', 'estudo', 'fe']

function LooseRow({ p, today }: { p: DayPriority; today: DateKey }) {
  return (
    <ItemRow
      title={p.title}
      meta="importante hoje"
      priority={1}
      checked={p.done}
      onCheck={(next) => {
        setPriorityDone(p.id, next)
        void persist()
        if (next) {
          haptic('success')
          toast(`${p.title} ✓`, { action: { label: 'Desfazer', run: () => (setPriorityDone(p.id, false), void persist()) } })
        }
      }}
      onOpen={() => openPriorities(today)}
    />
  )
}

export function HojeBlock({ lists, loose, today, minutes }: { lists: HomeLists; loose: DayPriority[]; today: DateKey; minutes: number }) {
  const [filter, setFilterState] = useState<Filter>(readFilter)
  const areas = useMemo(() => {
    const set = new Set([...lists.agora, ...lists.hoje, ...lists.done].map(areaOf))
    return ORDER.filter((a) => set.has(a))
  }, [lists])
  const active: Filter = filter !== 'tudo' && !areas.includes(filter) ? 'tudo' : filter
  const keep = (i: ActionItem) => active === 'tudo' || areaOf(i) === active
  const open = lists.hoje.filter(keep)
  const done = lists.done.filter(keep)
  const looseOpen = active === 'tudo' ? loose.filter((p) => !p.done) : []
  const looseDone = active === 'tudo' ? loose.filter((p) => p.done) : []
  const setFilter = (f: Filter) => {
    setFilterState(f)
    writeFilter(f)
  }
  if (!lists.hoje.length && !lists.done.length && !loose.length) return null
  const pending = open.length + looseOpen.length
  return (
    <section aria-label="Hoje">
      <Eyebrow action={pending ? <span className="text-[13px] text-muted">{plural(pending, 'aberta', 'abertas')}</span> : undefined}>Hoje</Eyebrow>
      {areas.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1" role="tablist" aria-label="Filtrar por área">
          {(['tudo', ...areas] as Filter[]).map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={active === a}
              onClick={() => setFilter(a)}
              className={cn('h-8 px-3 rounded-full text-[13px] shrink-0 transition-colors', active === a ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 active:bg-line')}
            >
              {a === 'tudo' ? 'Tudo' : AREA_TAG[a].label}
            </button>
          ))}
        </div>
      )}
      {pending === 0 && <p className="text-[15px] text-ink-2 py-3">{done.length || looseDone.length ? 'Tudo feito por aqui ✨' : 'Nada aberto aqui ✨'}</p>}
      <ItemList>
        {looseOpen.map((p) => (
          <LooseRow key={p.id} p={p} today={today} />
        ))}
        {open.map((i) => (
          <HomeRow key={i.key} item={i} today={today} minutes={minutes} />
        ))}
      </ItemList>
      {done.length + looseDone.length > 0 && (
        <div className="mt-1 border-t border-line/60">
          <Fold label={`Feitos hoje · ${done.length + looseDone.length}`}>
            <ItemList>
              {looseDone.map((p) => (
                <LooseRow key={p.id} p={p} today={today} />
              ))}
              {done.map((i) => (
                <HomeRow key={i.key} item={i} today={today} minutes={minutes} />
              ))}
            </ItemList>
          </Fold>
        </div>
      )}
    </section>
  )
}

// ─── PRÓXIMOS DIAS ──────────────────────────────────────────────────────────

function dayName(date: DateKey, index: number): string {
  if (index === 0) return 'Amanhã'
  const w = WEEKDAY_SHORT[weekday(date)].toLocaleLowerCase('pt-BR')
  return `${w.charAt(0).toLocaleUpperCase('pt-BR')}${w.slice(1)} ${Number(date.slice(8, 10))}`
}

function DayLine({ day, today, index }: { day: UpcomingDay; today: DateKey; index: number }) {
  const [open, setOpen] = useState(false)
  const summary = daySummary(day.items, day.highlights)
  const empty = day.count === 0
  return (
    <li>
      <button type="button" aria-expanded={empty ? undefined : open} disabled={empty} onClick={() => setOpen((o) => !o)} className="w-full min-h-[52px] flex items-center gap-3 text-left enabled:active:opacity-70">
        <span className={cn('w-[78px] shrink-0 text-[15px]', empty ? 'text-muted' : 'text-ink')}>{dayName(day.date, index)}</span>
        <span className={cn('flex-1 min-w-0 truncate text-[13.5px]', empty ? 'text-muted/70' : 'text-ink-2')}>{summary}</span>
        {!empty && <ChevronDown size={15} className={cn('text-muted shrink-0 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && (
        <ItemList className="pb-2 border-t border-line/60">
          {day.items.map((i) => (
            <HomeRow key={i.key} item={i} today={today} minutes={0} />
          ))}
        </ItemList>
      )}
    </li>
  )
}

export function ProximosBlock({ days, undated, radar = [], today }: { days: UpcomingDay[]; undated: ActionItem[]; radar?: ActionItem[]; today: DateKey }) {
  if (!days.length && !undated.length && !radar.length) return null
  return (
    <section aria-label="Próximos dias">
      <Eyebrow>Próximos dias</Eyebrow>
      <ul className="divide-y divide-line/60">
        {days.map((d, i) => (
          <DayLine key={d.date} day={d} today={today} index={i} />
        ))}
      </ul>
      {radar.length > 0 && (
        <div className="border-t border-line/60">
          <Fold label={`No radar · ${plural(radar.length, 'ideia futura', 'ideias futuras')}`}>
            <ItemList>
              {radar.map((i) => (
                <HomeRow key={i.key} item={i} today={today} minutes={0} showWhen={false} />
              ))}
            </ItemList>
          </Fold>
        </div>
      )}
      {undated.length > 0 && (
        <div className="border-t border-line/60">
          <Fold label={`Sem dia · ${plural(undated.length, 'coisa', 'coisas')}`}>
            <ItemList>
              {undated.map((i) => (
                <HomeRow key={i.key} item={i} today={today} minutes={0} showWhen={false} />
              ))}
            </ItemList>
          </Fold>
        </div>
      )}
    </section>
  )
}

