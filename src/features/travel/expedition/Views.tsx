/**
 * Expedição — the tabs inside the trip page: Hoje, Dias, Pendências, Custos, Escola, Checklists, Segurança.
 * Everything reads from the store and writes through `actions`; nothing changes on its own.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarArrowDown, ChevronRight, CloudSun, FileDown, Phone, Plus, Printer, Share2, Trash2, Wind } from 'lucide-react'
import type { DateKey, Expense, Person, Trip, TripExpedition, TripItem, Weekday } from '@/data/types'
import { actions } from '@/data/store'
import { openSheet, toast } from '@/app/ui-store'
import { Button, Card, Checkbox, DateInput, EmptyState, Field, Segmented, TextArea, TextInput, TimeInput } from '@/components/ui'
import { useNow } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { copyText } from '@/lib/clipboard'
import { addDays, formatLongDate, formatShortDate, hmToMinutes, inMinutesLabel, weekday, WEEKDAY_SHORT } from '@/lib/date'
import {
  CANCEL_REASON_LABEL,
  CHECKLIST_LABEL,
  NO_FLY_AFTER_DIVE_HOURS,
  WEATHER_REASONS,
  certaintyOf,
  classOn,
  dayCost,
  expeditionBudget,
  expeditionCSV,
  expeditionICS,
  findConflicts,
  formatMoney,
  isActive,
  itemsOnDay,
  itineraryText,
  localNow,
  nextDeparture,
  pendencies,
  replanSuggestions,
  schoolDays,
  schoolSummary,
  tripDays,
  type Conflict,
  type ReplanSuggestion,
} from './logic'
import { useForecast } from './weather'
import { CertaintyBadge, DayItem, ItemChecklist, MapLinks, MoneyPair } from './ui'

export type ExpeditionTab = 'hoje' | 'dias' | 'pendencias' | 'custos' | 'escola' | 'checklists' | 'seguranca'
export const EXPEDITION_TABS: ExpeditionTab[] = ['hoje', 'dias', 'pendencias', 'custos', 'escola', 'checklists', 'seguranca']

interface ViewProps {
  trip: Trip & { expedition: TripExpedition }
  items: TripItem[]
  expenses: Expense[]
  onGo: (tab: ExpeditionTab) => void
}

export function ExpeditionView({ tab, ...p }: ViewProps & { tab: ExpeditionTab }) {
  switch (tab) {
    case 'hoje':
      return <Hoje {...p} />
    case 'dias':
      return <Dias {...p} />
    case 'pendencias':
      return <Pendencias {...p} />
    case 'custos':
      return <Custos {...p} />
    case 'escola':
      return <Escola {...p} />
    case 'checklists':
      return <Checklists {...p} />
    case 'seguranca':
      return <Seguranca {...p} />
  }
}

const setExp = (trip: Trip & { expedition: TripExpedition }, patch: Partial<TripExpedition>) => actions.update('trips', trip.id, { expedition: { ...trip.expedition, ...patch } })

/** The trip day to show: today where she is, kept inside the trip. */
function useTripDay(trip: ViewProps['trip']) {
  const { now, today: spToday } = useNow()
  const local = localNow(trip.expedition.timeZone, now)
  const days = tripDays(trip)
  const day = !days.length ? local.date : local.date < days[0] ? days[0] : local.date > days[days.length - 1] ? days[days.length - 1] : local.date
  return { local, day, isToday: day === local.date, spToday, now }
}

const placeOf = (trip: Trip) => trip.expedition?.weather?.label ?? trip.place ?? trip.name

// ─── Hoje ───────────────────────────────────────────────────────────────────

function Hoje({ trip, items, onGo }: ViewProps) {
  const { local, day, isToday, now } = useTripDay(trip)
  const spTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(now)
  const next = useMemo(() => nextDeparture(items, isToday ? local : { date: day, minutes: 0 }), [items, local, day, isToday])
  const tomorrow = addDays(day, 1)
  const alerts = useMemo(() => dayAlerts(trip, items, day), [trip, items, day])
  const today = useMemo(() => itemsOnDay(items, day), [items, day])
  const cost = useMemo(() => dayCost(trip, items, day), [trip, items, day])
  const pend = useMemo(() => pendencies(trip, items, day), [trip, items, day])
  const withChecklist = today.filter((i) => isActive(i) && i.checklistKind && i.date === day)

  return (
    <div className="space-y-4">
      <div className="px-1">
        <div className="eyebrow">{isToday ? `hoje em ${placeOf(trip)}` : day < local.date ? 'último dia da viagem' : 'primeiro dia da viagem'}</div>
        <h2 className="font-display text-[28px] leading-tight mt-1 first-letter:uppercase">{formatLongDate(day)}</h2>
        {isToday && (
          <p className="text-[13px] text-muted mt-1">
            <b className="font-sport text-[15px] text-ink-2">{local.time}</b> aí · {spTime} em São Paulo
          </p>
        )}
      </div>

      <WeatherCard trip={trip} day={day} />

      {next && (
        <Card className="bg-ink text-bg border-transparent" onPress={() => openSheet('tripItem', { id: next.item.id })}>
          <div className="eyebrow" style={{ color: 'color-mix(in oklab, var(--bg) 70%, transparent)' }}>
            próxima saída{next.date !== local.date ? ` · ${formatShortDate(next.date)}` : ''}
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="font-sport text-[40px] leading-none">{next.at}</span>
            {next.date === local.date && isToday && <span className="text-[13px] opacity-75">{inMinutesLabel(next.inMinutes)}</span>}
          </div>
          <div className="font-display text-[19px] mt-2 leading-snug">{next.item.title}</div>
          <div className="mt-2 flex items-center gap-2">
            <CertaintyBadge item={next.item} />
            {next.item.leaveTime && next.item.time && <span className="text-[12.5px] opacity-75">começa {next.item.time}</span>}
          </div>
        </Card>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => (a.item ? openSheet('tripItem', { id: a.item.id }) : onGo('pendencias'))}
              className="w-full flex items-start gap-3 rounded-2xl bg-sand-soft px-4 py-3 text-left text-[13.5px] active:scale-[0.99] transition"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
              <span className="flex-1 text-ink-2">
                {a.when && <b className="font-semibold text-ink">{a.when}: </b>}
                {a.text}
              </span>
            </button>
          ))}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between px-1 mb-2">
          <h3 className="eyebrow">o dia</h3>
          {cost.cents + cost.uber > 0 && (
            <span className="text-[12.5px] text-muted">
              previsto <MoneyPair trip={trip} cents={cost.cents + cost.uber} className="text-ink-2 font-medium" />
            </span>
          )}
        </div>
        <DayTimeline trip={trip} items={items} date={day} />
        {cost.missing > 0 && <p className="text-[12px] text-muted px-1 mt-1.5">{cost.missing === 1 ? '1 atividade' : `${cost.missing} atividades`} do dia ainda sem valor.</p>}
      </section>

      {withChecklist.length > 0 && (
        <section className="space-y-3">
          <h3 className="eyebrow px-1">checklists de hoje</h3>
          {withChecklist.map((i) => (
            <ItemChecklist key={i.id} item={i} />
          ))}
        </section>
      )}

      <button type="button" onClick={() => onGo('dias')} className="w-full card p-4 text-left flex items-center gap-3 active:scale-[0.99] transition">
        <span className="flex-1 min-w-0">
          <span className="eyebrow block">amanhã · {formatShortDate(tomorrow)}</span>
          <span className="block text-[14px] text-ink-2 mt-1 truncate">{summaryOf(trip, items, tomorrow) || 'Dia livre por enquanto.'}</span>
        </span>
        <ChevronRight size={16} className="text-muted shrink-0" />
      </button>

      {pend.total > 0 && (
        <button type="button" onClick={() => onGo('pendencias')} className="w-full flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-left text-[13.5px] active:scale-[0.99] transition">
          <span className="flex-1 text-ink-2">
            <b className="font-semibold text-ink">{pend.total}</b> {pend.total === 1 ? 'pendência' : 'pendências'} na viagem — reservas, clima, liberação, pickup.
          </span>
          <ChevronRight size={16} className="text-muted shrink-0" />
        </button>
      )}
    </div>
  )
}

function summaryOf(trip: Trip, items: TripItem[], date: DateKey): string {
  const block = classOn(trip.expedition, date)
  const list = itemsOnDay(items.filter(isActive), date).filter((i) => i.section !== 'hospedagem' || i.date === date)
  return [block && `aula ${block.start}–${block.end}`, ...list.map((i) => (i.time && i.date === date ? `${i.time} ${i.title}` : i.title))].filter(Boolean).join(' · ')
}

interface DayAlert {
  key: string
  when?: string
  text: string
  item?: TripItem
}

/** Today's and tomorrow's things that need attention (conflicts, weather, clearance, pickup, booking). */
function dayAlerts(trip: Trip, items: TripItem[], day: DateKey): DayAlert[] {
  const out: DayAlert[] = []
  const days = [day, addDays(day, 1)]
  const label = (d: DateKey) => (d === day ? 'Hoje' : 'Amanhã')
  for (const c of findConflicts(trip, items).filter((c) => days.includes(c.date))) out.push({ key: c.key, when: label(c.date), text: c.text, item: c.items[0] })
  for (const d of days) {
    for (const i of itemsOnDay(items, d)) {
      if (!isActive(i) || i.status === 'feito' || i.date !== d) continue
      if (certaintyOf(i) === 'clima') out.push({ key: `clima:${i.id}`, when: label(d), text: `${i.title} depende do clima — confira antes de sair.`, item: i })
      if (i.clearance === 'pendente' || i.clearance === 'nao_liberada') out.push({ key: `lib:${i.id}`, when: label(d), text: `${i.title}: liberação médica ${i.clearance === 'pendente' ? 'ainda pendente' : 'não liberada'}.`, item: i })
      if (i.needsPickup && !i.pickupConfirmed) out.push({ key: `pick:${i.id}`, when: label(d), text: `${i.title}: pickup ainda não confirmado.`, item: i })
      if (i.status === 'a_confirmar' && certaintyOf(i) === 'pendente' && !i.clearance) out.push({ key: `conf:${i.id}`, when: label(d), text: `${i.title} ainda não está confirmado.`, item: i })
    }
  }
  return out
}

function WeatherCard({ trip, day }: { trip: ViewProps['trip']; day: DateKey }) {
  const f = useForecast(trip.expedition.weather, trip.expedition.timeZone)
  const label = trip.expedition.weather?.label
  if (!trip.expedition.weather) return null
  if (f.status !== 'ok') {
    return (
      <div className="card px-4 py-3 flex items-center gap-3 text-[13.5px] text-muted">
        <CloudSun size={18} aria-hidden />
        {f.status === 'loading' ? 'Buscando a previsão…' : 'Sem previsão agora. Confira num app de clima antes de sair.'}
      </div>
    )
  }
  const d = f.data.days.find((x) => x.date === day)
  const at = new Date(f.data.fetchedAt)
  const atLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: trip.expedition.timeZone, hour: '2-digit', minute: '2-digit' }).format(at)
  const cur = f.data.current
  const fmt = (v: number | undefined, unit: string) => (v == null ? '—' : `${Math.round(v)}${unit}`)
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">previsão · {label}</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-display text-[34px] leading-none">{fmt(cur?.temp, '°')}</span>
            {d && (
              <span className="text-[13px] text-muted">
                {fmt(d.tMin, '°')} / {fmt(d.tMax, '°')}
              </span>
            )}
          </div>
        </div>
        <Wind size={22} className="text-muted mt-1" aria-hidden />
      </div>
      <dl className="grid grid-cols-3 gap-2 mt-3 text-[12.5px]">
        <Stat label="vento" value={`${fmt(cur?.wind ?? d?.windMax, '')} km/h`} sub={d?.gustMax != null ? `rajadas ${fmt(d.gustMax, '')}` : undefined} />
        <Stat label="ondas" value={d?.waveMax != null ? `${d.waveMax.toFixed(1)} m` : '—'} sub={d?.rainProb != null ? `chuva ${d.rainProb}%` : undefined} />
        <Stat label="sol" value={d?.sunrise ?? '—'} sub={d?.sunset ? `pôr ${d.sunset}` : undefined} />
      </dl>
      <p className="text-[11.5px] text-muted mt-3">Fonte: Open-Meteo · atualizado às {atLabel} (hora local). Previsão, não garantia.</p>
    </Card>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2.5 py-2">
      <dt className="eyebrow text-[11px]">{label}</dt>
      <dd className="font-sport text-[16px] text-ink mt-0.5">{value}</dd>
      {sub && <dd className="text-[11.5px] text-muted">{sub}</dd>}
    </div>
  )
}

// ─── A day ──────────────────────────────────────────────────────────────────

function DayTimeline({ trip, items, date }: { trip: ViewProps['trip']; items: TripItem[]; date: DateKey }) {
  const block = classOn(trip.expedition, date)
  const list = itemsOnDay(items, date).filter((i) => i.section !== 'hospedagem' || i.date === date || i.endDate === date)
  const absence = list.find((i) => isActive(i) && i.schoolImpact)
  const rows: { at: string; node: ReactNode }[] = list.map((i) => ({
    at: i.date === date ? i.leaveTime ?? i.time ?? '99' : '00',
    node: (
      <DayItem key={i.id} trip={trip} item={i} date={date}>
        {i.status === 'cancelado' && i.cancelReason && WEATHER_REASONS.includes(i.cancelReason) && <Replan trip={trip} items={items} item={i} />}
      </DayItem>
    ),
  }))
  if (block) {
    rows.push({
      at: block.start,
      node: (
        <div key="aula" className="flex gap-3 py-3">
          <div className="w-12 shrink-0 font-sport text-[17px] leading-6 text-ocean">{block.start}</div>
          <div className="flex-1 min-w-0">
            <div className={cn('text-[15px]', absence?.schoolImpact === 'dia' && 'line-through text-muted')}>
              Aula · {trip.expedition.school?.name}
            </div>
            <div className="text-[12.5px] text-muted mt-0.5">
              até {block.end}
              {absence ? ` · ${absence.schoolImpact === 'dia' ? 'ausência planejada' : 'ausência parcial'}${certaintyOf(absence) !== 'confirmado' ? ' (depende de confirmação)' : ''}` : ''}
            </div>
          </div>
        </div>
      ),
    })
  }
  rows.sort((a, b) => a.at.localeCompare(b.at))
  if (!rows.length) return <div className="card px-4 py-5 text-[14px] text-muted text-center">Dia livre. Descansar também é roteiro 🌿</div>
  return <div className="card px-4 divide-y divide-line/70">{rows.map((r) => r.node)}</div>
}

function Replan({ trip, items, item }: { trip: Trip; items: TripItem[]; item: TripItem }) {
  const { today } = useNow()
  const list = useMemo(() => replanSuggestions(trip, items, item, today), [trip, items, item, today])
  return (
    <div className="mt-2 rounded-xl bg-ocean-soft p-3">
      <div className="text-[12.5px] text-ink-2">
        Cancelado por {CANCEL_REASON_LABEL[item.cancelReason!]}.{' '}
        {list.length ? `Sugestões para a janela livre (${list[0].window.start}–${list[0].window.end}) — você decide:` : 'Sem troca que caiba sem cruzar aula, voo ou reserva. Um descanso também vale.'}
      </div>
      {list.map((s) => (
        <SuggestionRow key={s.item.id} s={s} />
      ))}
    </div>
  )
}

function SuggestionRow({ s }: { s: ReplanSuggestion }) {
  const bring = () => {
    const prev = { date: s.item.date, time: s.item.time, endTime: s.item.endTime }
    const dur = s.item.time && s.item.endTime ? hmToMinutes(s.item.endTime) - hmToMinutes(s.item.time) : undefined
    const start = s.window.start
    const end = dur != null ? `${String(Math.floor((hmToMinutes(start) + dur) / 60)).padStart(2, '0')}:${String((hmToMinutes(start) + dur) % 60).padStart(2, '0')}` : s.item.endTime
    actions.update('tripItems', s.item.id, { date: s.window.date, time: start, endTime: dur != null ? end : undefined })
    toast(`${s.item.title} → ${formatShortDate(s.window.date)} ${start}`, { action: { label: 'Desfazer', run: () => actions.update('tripItems', s.item.id, prev) } })
  }
  return (
    <div className="flex items-center gap-2 mt-2">
      <button type="button" onClick={() => openSheet('tripItem', { id: s.item.id })} className="flex-1 min-w-0 text-left">
        <span className="block text-[14px] truncate">{s.item.title}</span>
        <span className="block text-[12px] text-muted">
          {s.why}
          {s.item.date ? ` · hoje em ${formatShortDate(s.item.date)}` : ''}
        </span>
      </button>
      <Button size="sm" variant="soft" onClick={bring}>
        Trazer
      </Button>
    </div>
  )
}

// ─── Dias ───────────────────────────────────────────────────────────────────

function Dias({ trip, items }: ViewProps) {
  const [view, setView] = useState<'linha' | 'semana'>('linha')
  const { day } = useTripDay(trip)
  const days = useMemo(() => tripDays(trip), [trip])
  const conflicts = useMemo(() => findConflicts(trip, items), [trip, items])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.scrollIntoView({ block: 'start' })
  }, [day, view])
  const weeks = useMemo(() => {
    const out: DateKey[][] = []
    for (const d of days) {
      if (!out.length || weekday(d) === 1) out.push([])
      out[out.length - 1].push(d)
    }
    return out
  }, [days])
  return (
    <div className="space-y-4" ref={ref}>
      <Segmented value={view} onChange={setView} options={[{ value: 'linha', label: 'Linha do tempo' }, { value: 'semana', label: 'Semana' }]} />
      <ExportBar trip={trip} items={items} />
      {weeks.map((w, wi) => (
        <section key={w[0]} className="space-y-2.5">
          <h3 className="eyebrow px-1">
            semana {wi + 1} · {formatShortDate(w[0])} → {formatShortDate(w[w.length - 1])}
          </h3>
          {view === 'semana' ? (
            <div className="card divide-y divide-line/70">
              {w.map((d) => (
                <WeekRow key={d} trip={trip} items={items} date={d} today={d === day} conflicts={conflicts.filter((c) => c.date === d)} />
              ))}
            </div>
          ) : (
            w.map((d) => <DayCard key={d} trip={trip} items={items} date={d} today={d === day} conflicts={conflicts.filter((c) => c.date === d)} />)
          )}
        </section>
      ))}
      <PrintItinerary trip={trip} items={items} />
    </div>
  )
}

function DayHead({ date, today, trip, items }: { date: DateKey; today: boolean; trip: ViewProps['trip']; items: TripItem[] }) {
  const cost = dayCost(trip, items, date)
  const block = classOn(trip.expedition, date)
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 text-center shrink-0">
        <div className="eyebrow text-[11px]">{WEEKDAY_SHORT[weekday(date)]}</div>
        <div className="font-display text-[26px] leading-none">{Number(date.slice(8))}</div>
      </div>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
        {today && <span className="h-6 px-2 rounded-full bg-accent text-bg text-[11.5px] font-semibold inline-flex items-center">hoje</span>}
        {block && <span className="h-6 px-2 rounded-full bg-ocean-soft text-ink-2 text-[11.5px] inline-flex items-center">aula {block.start}–{block.end}</span>}
        {cost.cents + cost.uber > 0 && <MoneyPair trip={trip} cents={cost.cents + cost.uber} className="text-[12px] text-muted" />}
      </div>
    </div>
  )
}

function DayCard({ trip, items, date, today, conflicts }: { trip: ViewProps['trip']; items: TripItem[]; date: DateKey; today: boolean; conflicts: Conflict[] }) {
  return (
    <div data-day={date} className={cn('scroll-mt-28 space-y-2', today && 'rounded-[22px] ring-2 ring-accent/40 ring-offset-4 ring-offset-bg')}>
      <DayHead date={date} today={today} trip={trip} items={items} />
      {conflicts.map((c) => (
        <div key={c.key} className="rounded-xl bg-sand-soft px-3 py-2 text-[12.5px] text-ink-2 flex gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {c.text}
        </div>
      ))}
      <DayTimeline trip={trip} items={items} date={date} />
      <div className="text-right">
        <button type="button" className="text-[12.5px] text-muted h-8 px-1" onClick={() => openSheet('tripItem', { tripId: trip.id, section: 'roteiro' })}>
          + atividade
        </button>
      </div>
    </div>
  )
}

function WeekRow({ trip, items, date, today, conflicts }: { trip: ViewProps['trip']; items: TripItem[]; date: DateKey; today: boolean; conflicts: Conflict[] }) {
  const list = itemsOnDay(items.filter(isActive), date).filter((i) => i.section !== 'hospedagem' || i.date === date)
  const block = classOn(trip.expedition, date)
  return (
    <div data-day={date} className={cn('flex gap-3 px-4 py-3 scroll-mt-28', today && 'bg-accent-soft/60')}>
      <div className="w-10 shrink-0 text-center">
        <div className="eyebrow text-[10.5px]">{WEEKDAY_SHORT[weekday(date)]}</div>
        <div className="font-display text-[20px] leading-none">{Number(date.slice(8))}</div>
      </div>
      <div className="flex-1 min-w-0 space-y-1 text-[13px]">
        {block && <div className="text-ocean">aula {block.start}–{block.end}</div>}
        {list.map((i) => (
          <button key={i.id} type="button" onClick={() => openSheet('tripItem', { id: i.id })} className="flex w-full items-center gap-2 text-left">
            <span className="font-sport text-[13.5px] w-10 shrink-0 text-ink-2">{i.date === date ? i.time ?? '' : '·'}</span>
            <span className="flex-1 min-w-0 truncate">{i.title}</span>
            <span className={cn('h-2 w-2 rounded-full shrink-0', DOT[certaintyOf(i)])} aria-label={certaintyOf(i)} />
          </button>
        ))}
        {!block && !list.length && <div className="text-muted">livre</div>}
        {conflicts.length > 0 && <div className="text-[12px] text-ink-2">⚠︎ {conflicts.length === 1 ? '1 conflito' : `${conflicts.length} conflitos`}</div>}
      </div>
    </div>
  )
}
const DOT = { confirmado: 'bg-sage', estimado: 'bg-muted/50', clima: 'bg-ocean', pendente: 'bg-sand' } as const

// ─── Exports ────────────────────────────────────────────────────────────────

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ExportBar({ trip, items }: { trip: Trip; items: TripItem[] }) {
  const slug = 'expedicao-africa-do-sul'
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
      <Button size="sm" variant="soft" icon={<CalendarArrowDown size={15} />} onClick={() => (download(`${slug}.ics`, expeditionICS(trip, items), 'text/calendar;charset=utf-8'), toast('Agenda exportada (.ics) 📅'))}>
        Agenda .ics
      </Button>
      <Button size="sm" variant="soft" icon={<FileDown size={15} />} onClick={() => (download(`${slug}.csv`, expeditionCSV(trip, items), 'text/csv;charset=utf-8'), toast('Planilha exportada (.csv)'))}>
        Planilha .csv
      </Button>
      <Button size="sm" variant="soft" icon={<Printer size={15} />} onClick={() => window.print()}>
        PDF / imprimir
      </Button>
    </div>
  )
}

/** Only visible when printing (the browser's "Salvar como PDF"). */
function PrintItinerary({ trip, items }: { trip: Trip; items: TripItem[] }) {
  return (
    <>
      <style>{`@media print{body *{visibility:hidden!important}#expedicao-print,#expedicao-print *{visibility:visible!important}#expedicao-print{position:absolute;left:0;top:0;width:100%;display:block!important;padding:16px;color:#000;background:#fff}}`}</style>
      <div id="expedicao-print" className="hidden">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', fontSize: 12, lineHeight: 1.5 }}>{itineraryText(trip, items)}</pre>
      </div>
    </>
  )
}

// ─── Pendências ─────────────────────────────────────────────────────────────

function Pendencias({ trip, items }: ViewProps) {
  const { day } = useTripDay(trip)
  const p = useMemo(() => pendencies(trip, items, day), [trip, items, day])
  const group = (title: string, hint: string, list: TripItem[], extra?: (i: TripItem) => string | undefined) =>
    list.length > 0 && (
      <section key={title}>
        <div className="flex items-baseline justify-between px-1 mb-2">
          <h3 className="eyebrow">{title}</h3>
          <span className="text-[12px] text-muted tabular-nums">{list.length}</span>
        </div>
        <p className="text-[12.5px] text-muted px-1 -mt-1 mb-2">{hint}</p>
        <div className="card divide-y divide-line/70">
          {list.map((i) => (
            <PendRow key={i.id} item={i} sub={extra?.(i)} />
          ))}
        </div>
      </section>
    )
  if (!p.total && !p.extras.length) {
    return (
      <div className="card">
        <EmptyState compact emoji="🌿" title="Nada pendente" text="Sem conflito, reserva solta ou liberação faltando daqui pra frente." />
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Tile n={p.conflicts.length} label="conflitos" />
        <Tile n={p.bookings.length + p.payments.length + p.pickups.length} label="reservas" />
        <Tile n={p.weather.length + p.clearance.length} label="clima e liberação" />
      </div>
      {p.conflicts.length > 0 && (
        <section>
          <h3 className="eyebrow px-1 mb-2">conflitos</h3>
          <div className="card divide-y divide-line/70">
            {p.conflicts.map((c) => (
              <button key={c.key} type="button" onClick={() => openSheet('tripItem', { id: c.items[0].id })} className="w-full text-left px-4 py-3 flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px]">{c.text}</span>
                  <span className="block text-[12px] text-muted">{formatLongDate(c.date)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {group('liberação médica', 'Não entra como garantido sem a liberação.', p.clearance)}
      {group('dependem do clima', 'Vento, mar ou chuva decidem no dia. Se cancelar, o dia mostra trocas possíveis.', p.weather, (i) => i.planB && `plano B: ${i.planB}`)}
      {group('reservas a confirmar', 'Ainda sem confirmação do fornecedor.', p.bookings)}
      {group('pagamento pendente', 'Confirmado, falta pagar (ou registrar o pagamento).', p.payments)}
      {group('pickup a confirmar', 'Ponto e horário de busca ainda em aberto.', p.pickups, (i) => i.pickup)}
      {group('extras não confirmados', 'Opcionais: só entram se couberem. Nunca contam como feitos sem confirmação.', p.extras, (i) => i.opportunityCost)}
    </div>
  )
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="font-sport text-[28px] leading-none">{n}</div>
      <div className="text-[11.5px] text-muted mt-1">{label}</div>
    </div>
  )
}

function PendRow({ item, sub }: { item: TripItem; sub?: string }) {
  return (
    <button type="button" onClick={() => openSheet('tripItem', { id: item.id })} className="w-full flex items-center gap-3 px-4 py-3 text-left">
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px]">{item.title}</span>
        <span className="block text-[12px] text-muted">{[item.date && `${formatShortDate(item.date)}${item.time ? ` ${item.time}` : ''}`, sub].filter(Boolean).join(' · ') || 'sem data'}</span>
      </span>
      <CertaintyBadge item={item} />
    </button>
  )
}

// ─── Custos ─────────────────────────────────────────────────────────────────

function Custos({ trip, items, expenses }: ViewProps) {
  const b = useMemo(() => expeditionBudget(trip, items, expenses)!, [trip, items, expenses])
  const exp = trip.expedition
  const [rate, setRate] = useState(exp.rateToBRL != null ? String(exp.rateToBRL).replace('.', ',') : '')
  const priced = items.filter((i) => isActive(i) && (i.estimatedCents ?? i.quotedCents ?? i.paidCents ?? i.uberCents) != null).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  const cur = exp.currency
  return (
    <div className="space-y-4">
      <Card>
        <div className="eyebrow">total previsto com margem de {exp.marginPct}%</div>
        <div className="font-display text-[34px] leading-none mt-1.5">{formatMoney(b.totalWithMargin, cur)}</div>
        <div className="text-[13.5px] text-muted mt-1.5">
          {exp.rateToBRL ? <>≈ {formatMoney(Math.round(b.totalWithMargin * exp.rateToBRL), 'BRL')} pela sua cotação</> : 'Defina a cotação abaixo para ver em reais.'}
        </div>
        <dl className="grid grid-cols-2 gap-2 mt-4 text-[12.5px]">
          <Money label="estimado" cents={b.estimated} trip={trip} />
          <Money label="cotado" cents={b.quoted} trip={trip} />
          <Money label="pago" cents={b.paid} trip={trip} />
          <Money label="Uber (à parte)" cents={b.uber} trip={trip} />
        </dl>
        <p className="text-[12px] text-muted mt-3">Cada item conta pelo valor mais firme: pago, senão cotado, senão estimado. Extras ficam fora do total.</p>
      </Card>

      <Card className="space-y-3">
        <div className="eyebrow">cotação e margem</div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={`1 ${cur} = R$`}>
            <input
              className="input"
              inputMode="decimal"
              placeholder="ex.: 0,31"
              value={rate}
              aria-label="Cotação"
              onChange={(e) => setRate(e.target.value)}
              onBlur={() => {
                const n = Number(rate.replace(',', '.'))
                setExp(trip, { rateToBRL: rate.trim() && Number.isFinite(n) && n > 0 ? n : undefined })
              }}
            />
          </Field>
          <Field label="Margem (%)">
            <input
              className="input"
              inputMode="numeric"
              defaultValue={exp.marginPct}
              aria-label="Margem"
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 0 && n <= 100) setExp(trip, { marginPct: n })
              }}
            />
          </Field>
        </div>
        <p className="text-[12px] text-muted">A cotação é a que você digitar — o app não busca câmbio ao vivo.</p>
      </Card>

      {(b.extras > 0 || b.unconverted > 0) && (
        <div className="grid grid-cols-2 gap-2.5">
          {b.extras > 0 && (
            <div className="card p-3.5">
              <div className="eyebrow">se fizer os extras</div>
              <MoneyPair trip={trip} cents={b.extras} className="block font-display text-[19px] mt-1" />
            </div>
          )}
          {b.unconverted > 0 && (
            <div className="card p-3.5">
              <div className="eyebrow">sem cotação</div>
              <div className="font-display text-[19px] mt-1">{formatMoney(b.unconverted, cur === 'ZAR' ? 'BRL' : 'ZAR')}</div>
              <div className="text-[11.5px] text-muted">fora do total até ter cotação</div>
            </div>
          )}
        </div>
      )}

      <section>
        <h3 className="eyebrow px-1 mb-2">por item</h3>
        {priced.length ? (
          <div className="card divide-y divide-line/70">
            {priced.map((i) => (
              <button key={i.id} type="button" onClick={() => openSheet('tripItem', { id: i.id })} className="w-full px-4 py-3 text-left">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1 min-w-0 truncate text-[14.5px]">{i.title}</span>
                  {i.optional && <span className="text-[11.5px] text-muted">extra</span>}
                </div>
                <div className="text-[12px] text-muted mt-0.5 flex flex-wrap gap-x-3">
                  {i.date && <span>{formatShortDate(i.date)}</span>}
                  {i.estimatedCents != null && <span>est. {formatMoney(i.estimatedCents, i.currency ?? cur)}</span>}
                  {i.quotedCents != null && <span>cot. {formatMoney(i.quotedCents, i.currency ?? cur)}</span>}
                  {i.paidCents != null && <span className="text-ink-2">pago {formatMoney(i.paidCents, i.currency ?? cur)}</span>}
                  {i.uberCents != null && <span>Uber {formatMoney(i.uberCents, i.currency ?? cur)}</span>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="card px-4 py-4 text-[13.5px] text-muted">Nenhum valor ainda. Abra uma atividade e anote estimado, cotado ou pago.</div>
        )}
        {b.withoutValue.length > 0 && <p className="text-[12px] text-muted px-1 mt-2">{b.withoutValue.length} atividades no roteiro ainda sem valor — o total vai subir quando entrarem.</p>}
      </section>

      <Card>
        <div className="eyebrow">gastos reais</div>
        <div className="font-display text-[24px] mt-1">{formatMoney(b.realBRL, 'BRL')}</div>
        <div className="text-[12.5px] text-muted mt-0.5">
          {b.realInTripCurrency != null && cur !== 'BRL' ? `≈ ${formatMoney(b.realInTripCurrency, cur)} · ` : ''}registrados em Dinheiro com esta viagem
        </div>
        <Button className="mt-3" block variant="soft" icon={<Plus size={16} />} onClick={() => openSheet('expense', { defaults: { tripId: trip.id, categoryId: 'cat-viagem' } })}>
          Registrar gasto
        </Button>
      </Card>
    </div>
  )
}

function Money({ label, cents, trip }: { label: string; cents: number; trip: Trip }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <dt className="eyebrow text-[11px]">{label}</dt>
      <dd className="mt-0.5">
        <MoneyPair trip={trip} cents={cents} className="font-sport text-[15px] text-ink" />
      </dd>
    </div>
  )
}

// ─── Escola ─────────────────────────────────────────────────────────────────

function Escola({ trip, items }: ViewProps) {
  const school = trip.expedition.school
  const days = useMemo(() => schoolDays(trip, items), [trip, items])
  const s = useMemo(() => schoolSummary(days), [days])
  const [editing, setEditing] = useState(false)
  if (!school) {
    return (
      <div className="card">
        <EmptyState compact emoji="📚" title="Sem escola nesta viagem" action={<Button variant="soft" size="sm" onClick={() => setExp(trip, { school: { name: 'Escola', from: trip.startDate ?? '', until: trip.endDate ?? '', days: [] } })}>Adicionar escola</Button>} />
      </div>
    )
  }
  const affected = days.filter((d) => d.impact !== 'nenhum' || d.conflicts.length)
  return (
    <div className="space-y-4">
      <Card>
        <div className="eyebrow">{school.name}</div>
        <div className="grid grid-cols-4 gap-2 mt-3">
          <Count n={s.preserved} label="preservadas" />
          <Count n={s.partial} label="parciais" />
          <Count n={s.lost} label="perdidas" />
          <Count n={s.madeUp} label="repostas" />
        </div>
        <p className="text-[12.5px] text-muted mt-3">
          {s.total} dias de aula de {formatShortDate(school.from)} a {formatShortDate(school.until)}.
          {s.uncertain > 0 && ` ${s.uncertain} ${s.uncertain === 1 ? 'ausência depende' : 'ausências dependem'} de reserva, clima ou liberação.`}
        </p>
        {school.address && (
          <div className="mt-3">
            <MapLinks trip={{ ...trip, expedition: { ...trip.expedition, school: undefined } }} address={school.address} />
          </div>
        )}
      </Card>

      {affected.length > 0 && (
        <section>
          <h3 className="eyebrow px-1 mb-2">dias afetados</h3>
          <div className="card divide-y divide-line/70">
            {affected.map((d) => (
              <div key={d.date} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14.5px] first-letter:uppercase">{formatLongDate(d.date)}</span>
                  <span className="text-[12px] text-muted">
                    {d.block.start}–{d.block.end}
                  </span>
                </div>
                {d.absences.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 mt-1.5">
                    <button type="button" className="flex-1 min-w-0 text-left text-[13px] text-ink-2" onClick={() => openSheet('tripItem', { id: i.id })}>
                      {i.schoolImpact === 'dia' ? 'Dia inteiro' : 'Parte da aula'} · {i.title}
                      {certaintyOf(i) !== 'confirmado' && <span className="text-muted"> (a confirmar)</span>}
                    </button>
                    <label className="flex items-center gap-2 text-[12.5px] text-muted shrink-0">
                      <Checkbox size="sm" checked={!!i.schoolMadeUp} label={`Aula reposta — ${i.title}`} onChange={(v) => actions.update('tripItems', i.id, { schoolMadeUp: v || undefined })} />
                      reposta
                    </label>
                  </div>
                ))}
                {d.conflicts.map((i) => (
                  <button key={i.id} type="button" onClick={() => openSheet('tripItem', { id: i.id })} className="mt-1.5 w-full text-left text-[12.5px] rounded-lg bg-sand-soft px-2.5 py-1.5 text-ink-2">
                    ⚠︎ {i.title} cruza a aula — marque o impacto na escola ou mude o horário.
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="eyebrow">horário das aulas</div>
          <button type="button" className="text-[13px] text-accent h-9 px-1" onClick={() => setEditing((e) => !e)}>
            {editing ? 'pronto' : 'editar'}
          </button>
        </div>
        {editing ? <SchoolEditor trip={trip} /> : (
          <ul className="text-[13.5px] space-y-1">
            {school.days.map((d) => (
              <li key={d.weekday} className="flex justify-between">
                <span>{WEEKDAY_SHORT[d.weekday]}</span>
                <span className="font-sport text-[15px]">
                  {d.start}–{d.end}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl bg-surface-2 py-2.5 text-center">
      <div className="font-sport text-[26px] leading-none">{n}</div>
      <div className="text-[11px] text-muted mt-1">{label}</div>
    </div>
  )
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

function SchoolEditor({ trip }: { trip: ViewProps['trip'] }) {
  const school = trip.expedition.school!
  const save = (patch: Partial<typeof school>) => setExp(trip, { school: { ...school, ...patch } })
  const setDay = (w: Weekday, patch: { start?: string; end?: string } | null) => {
    const rest = school.days.filter((d) => d.weekday !== w)
    const cur = school.days.find((d) => d.weekday === w) ?? { weekday: w, start: '09:00', end: '15:00' }
    save({ days: patch === null ? rest : [...rest, { ...cur, ...patch }].sort((a, b) => WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday)) })
  }
  return (
    <div className="space-y-3">
      <Field label="Escola">
        <TextInput defaultValue={school.name} onBlur={(e) => e.target.value.trim() && save({ name: e.target.value.trim() })} />
      </Field>
      <Field label="Endereço">
        <TextInput defaultValue={school.address} onBlur={(e) => save({ address: e.target.value.trim() || undefined })} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Primeiro dia">
          <DateInput value={school.from} onChange={(v) => v && save({ from: v })} />
        </Field>
        <Field label="Último dia">
          <DateInput value={school.until} onChange={(v) => v && save({ until: v })} />
        </Field>
      </div>
      {WEEKDAYS.map((w) => {
        const d = school.days.find((x) => x.weekday === w)
        return (
          <div key={w} className="flex items-center gap-2">
            <label className="flex items-center gap-2 w-16 shrink-0 text-[13px]">
              <Checkbox size="sm" checked={!!d} label={`Aula ${WEEKDAY_SHORT[w]}`} onChange={(v) => setDay(w, v ? {} : null)} />
              {WEEKDAY_SHORT[w]}
            </label>
            {d && (
              <>
                <TimeInput value={d.start} onChange={(v) => v && setDay(w, { start: v })} aria-label={`Início ${WEEKDAY_SHORT[w]}`} />
                <TimeInput value={d.end} onChange={(v) => v && setDay(w, { end: v })} aria-label={`Fim ${WEEKDAY_SHORT[w]}`} />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Checklists ─────────────────────────────────────────────────────────────

function Checklists({ trip, items }: ViewProps) {
  const { day } = useTripDay(trip)
  const list = items
    .filter((i) => isActive(i) && i.status !== 'feito' && i.checklistKind && (!i.date || (i.endDate ?? i.date) >= day))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99'))
  if (!list.length) {
    return (
      <div className="card">
        <EmptyState compact emoji="☑️" title="Nenhum checklist pela frente" text="Escolha o tipo da atividade (trilha, surf, voo…) ao editar e o checklist aparece aqui." />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {list.map((i) => (
        <div key={i.id}>
          <div className="text-[12px] text-muted px-1 mb-1.5">
            {i.date ? `${formatLongDate(i.date)}${i.time ? ` · ${i.time}` : ''}` : 'sem data'} · {CHECKLIST_LABEL[i.checklistKind!].label}
          </div>
          <ItemChecklist item={i} />
        </div>
      ))}
    </div>
  )
}

// ─── Segurança ──────────────────────────────────────────────────────────────

function Seguranca({ trip, items }: ViewProps) {
  const exp = trip.expedition
  const { local } = useTripDay(trip)
  const clearance = items.filter((i) => isActive(i) && i.clearance)
  const dives = items.filter((i) => isActive(i) && i.checklistKind === 'scuba')
  const community = items.filter((i) => isActive(i) && i.checklistKind === 'voluntariado')
  const share = async () => {
    const text = itineraryText(trip, items, local.date)
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ title: trip.name, text })
        return
      } catch {
        /* she closed the share sheet — fall back to copy */
      }
    }
    toast((await copyText(text)) ? 'Roteiro copiado — é só colar na conversa' : 'Não consegui copiar agora')
  }
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="eyebrow">contatos de emergência</div>
        <ContactList list={exp.emergencyContacts} onChange={(emergencyContacts) => setExp(trip, { emergencyContacts })} />
      </Card>

      <Card className="space-y-3">
        <div className="eyebrow">pessoa de confiança</div>
        <PersonFields value={exp.trustedContact} onChange={(trustedContact) => setExp(trip, { trustedContact })} />
        <Button block icon={<Share2 size={16} />} onClick={share}>
          Compartilhar roteiro
        </Button>
        <p className="text-[12px] text-muted">Envia o roteiro de hoje em diante (horários locais, endereços e o que está confirmado ou não).</p>
      </Card>

      <Card className="space-y-3">
        <div className="eyebrow">endereços</div>
        <Field label="Residência">
          <TextInput defaultValue={exp.residence?.address} placeholder="Endereço" onBlur={(e) => setExp(trip, { residence: { name: exp.residence?.name ?? 'Residência', address: e.target.value.trim() } })} />
        </Field>
        <Field label="Escola">
          <TextInput defaultValue={exp.school?.address} placeholder="Endereço" onBlur={(e) => exp.school && setExp(trip, { school: { ...exp.school, address: e.target.value.trim() || undefined } })} />
        </Field>
      </Card>

      <Card className="space-y-2">
        <div className="eyebrow">combinados</div>
        <TextArea rows={4} defaultValue={exp.safetyNotes} placeholder="Horários com luz do dia, quando ir acompanhada, o que fazer com vento forte…" onBlur={(e) => setExp(trip, { safetyNotes: e.target.value.trim() || undefined })} />
      </Card>

      {clearance.length > 0 && (
        <Card>
          <div className="eyebrow mb-2">liberação médica</div>
          {clearance.map((i) => (
            <button key={i.id} type="button" onClick={() => openSheet('tripItem', { id: i.id })} className="w-full flex items-center justify-between gap-3 min-h-11 text-left text-[14px]">
              {i.title}
              <span className={cn('text-[12.5px] px-2 h-6 inline-flex items-center rounded-full', i.clearance === 'liberada' ? 'bg-sage-soft' : 'bg-sand-soft')}>
                {i.clearance === 'liberada' ? 'liberada' : i.clearance === 'pendente' ? 'pendente' : 'não liberada'}
              </span>
            </button>
          ))}
          <p className="text-[12px] text-muted mt-1">Sem liberação, a atividade não aparece como confirmada.</p>
        </Card>
      )}

      {dives.length > 0 && (
        <Card>
          <div className="eyebrow mb-1.5">mergulho</div>
          <ul className="text-[13.5px] text-ink-2 space-y-1.5 list-disc pl-4">
            <li>Discover Scuba é sempre com instrutor; a profundidade máxima é a que ele definir.</li>
            <li>Regra geral (DAN): {NO_FLY_AFTER_DIVE_HOURS} h sem voar depois de mergulhar. O app avisa se um voo ficar perto demais.</li>
            <li>Questionário médico antes; qualquer “sim” pede liberação de um médico.</li>
          </ul>
        </Card>
      )}

      {community.length > 0 && (
        <Card>
          <div className="eyebrow mb-1.5">atividade comunitária</div>
          <ul className="text-[13.5px] text-ink-2 space-y-1.5 list-disc pl-4">
            <li>Só iniciativas éticas, guiadas pela própria comunidade.</li>
            <li>Regras de proteção infantil por escrito; sem fotos de crianças sem autorização.</li>
            <li>Visita educativa não é trabalho voluntário — marque qual é em cada atividade.</li>
          </ul>
        </Card>
      )}
    </div>
  )
}

function ContactList({ list, onChange }: { list: Person[]; onChange: (l: Person[]) => void }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  return (
    <div className="space-y-2">
      {list.map((p, i) => (
        <div key={`${p.name}-${i}`} className="flex items-center gap-2 min-h-11">
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] truncate">{p.name}</span>
            {p.role && <span className="block text-[12px] text-muted">{p.role}</span>}
          </span>
          {p.contact && (
            <a href={`tel:${p.contact.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-surface-2 font-sport text-[15px]">
              <Phone size={13} aria-hidden /> {p.contact}
            </a>
          )}
          <button type="button" aria-label={`Apagar ${p.name}`} className="h-9 w-9 inline-flex items-center justify-center text-muted" onClick={() => onChange(list.filter((_, j) => j !== i))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onChange([...list, { name: name.trim(), contact: contact.trim() || undefined }])
          setName('')
          setContact('')
        }}
      >
        <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do contato" />
        <input className="input" placeholder="Telefone" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} aria-label="Telefone do contato" />
        <Button type="submit" size="sm" disabled={!name.trim()} className="shrink-0 h-12">
          +
        </Button>
      </form>
    </div>
  )
}

function PersonFields({ value, onChange }: { value?: Person; onChange: (p: Person | undefined) => void }) {
  const save = (patch: Partial<Person>) => {
    const next = { name: '', ...value, ...patch }
    onChange(next.name.trim() || next.contact?.trim() ? next : undefined)
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <input className="input" placeholder="Nome" defaultValue={value?.name} aria-label="Nome da pessoa de confiança" onBlur={(e) => save({ name: e.target.value.trim() })} />
      <input className="input" placeholder="Telefone" inputMode="tel" defaultValue={value?.contact} aria-label="Telefone da pessoa de confiança" onBlur={(e) => save({ contact: e.target.value.trim() || undefined })} />
    </div>
  )
}
