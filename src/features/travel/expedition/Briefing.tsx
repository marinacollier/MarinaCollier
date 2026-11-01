/**
 * Expedição · "Briefing do dia" (06:15) and "Revisão da noite" (20:30) — brief operacional 01/11.
 * NOT reminders: nothing is scheduled. Both views render the same stored data Lumos reads (daily blocks,
 * the day's items, spend, tomorrow's checklist, what is left to book, conflicts). The forecast comes from the
 * existing Open-Meteo card logic; when it fails the view says so — never a guessed value.
 * Also the financial close card used in Reservas e pagamentos.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, CloudSun, ExternalLink } from 'lucide-react'
import type { DateKey, Expense, Trip, TripExpedition, TripItem } from '@/data/types'
import { useDB } from '@/data/store'
import { openSheet } from '@/app/ui-store'
import { Card, Segmented } from '@/components/ui'
import { useNow } from '@/hooks/useToday'
import { addDays, formatLongDate, formatShortDate } from '@/lib/date'
import { BOOKING_STATUS_META, bookingStatusOf as bookingOf, dayPriorities } from './command'
import { DailyBlocksList, useDailyPlan } from './DailyBlocks'
import { classOn, findConflicts, formatMoney, isActive, itemsOnDay, localNow, tripDays } from './logic'
import { RISK_LABEL, daySpend, financialClose, toBook, tomorrowChecklist, type DayChecklist } from './ops'
import { useForecast } from './weather'
import { ItemChecklist, MoneyPair } from './ui'

type ExpTrip = Trip & { expedition: TripExpedition }
interface Props {
  trip: ExpTrip
  items: TripItem[]
  expenses: Expense[]
}

const dm = (d: DateKey) => `${d.slice(8)}/${d.slice(5, 7)}`

function useLocalDay(trip: ExpTrip) {
  const { now } = useNow()
  const local = localNow(trip.expedition.timeZone, now)
  const days = tripDays(trip)
  const day = !days.length ? local.date : local.date < days[0] ? days[0] : local.date > days[days.length - 1] ? days[days.length - 1] : local.date
  return { local, day }
}

export function BriefingView({ trip, items, expenses }: Props) {
  const { local, day } = useLocalDay(trip)
  const [view, setView] = useState<'manha' | 'noite'>(() => (local.minutes >= 17 * 60 ? 'noite' : 'manha'))
  return (
    <div className="space-y-4">
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'manha', label: 'Briefing do dia · 06:15' },
          { value: 'noite', label: 'Revisão da noite · 20:30' },
        ]}
      />
      <p className="text-[12px] text-muted px-1">Sem lembrete automático: abra aqui às 06:15 e às 20:30. Tudo vem do que está salvo na viagem.</p>
      {view === 'manha' ? <Morning trip={trip} items={items} expenses={expenses} day={day} /> : <Evening trip={trip} items={items} expenses={expenses} day={day} />}
    </div>
  )
}

// ─── 06:15 ─────────────────────────────────────────────────────────────────

function Morning({ trip, items, day }: Props & { day: DateKey }) {
  const plan = useDailyPlan(trip, items, day)
  const tasks = useDB((db) => db.tasks)
  const workouts = useDB((db) => db.workouts)
  const list = useMemo(() => itemsOnDay(items.filter(isActive), day).filter((i) => i.section !== 'hospedagem' || i.date === day), [items, day])
  const conflicts = useMemo(() => findConflicts(trip, items, workouts).filter((c) => c.date === day), [trip, items, workouts, day])
  const priorities = useMemo(() => dayPriorities(trip, items, tasks, day), [trip, items, tasks, day])
  const block = classOn(trip.expedition, day)
  const withChecklist = list.filter((i) => i.checklistKind && i.date === day && i.status !== 'feito')
  return (
    <>
      <div className="px-1">
        <div className="eyebrow">briefing do dia</div>
        <h2 className="font-display text-[26px] leading-tight mt-1 first-letter:uppercase">{formatLongDate(day)}</h2>
      </div>
      <WeatherLine trip={trip} day={day} />
      {conflicts.map((c) => (
        <div key={c.key} className="rounded-xl bg-sand-soft px-3 py-2 text-[12.5px] text-ink-2 flex gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {c.text}
        </div>
      ))}
      <section>
        <h3 className="eyebrow px-1 mb-2">agenda</h3>
        <div className="card divide-y divide-line/70">
          {block && (
            <div className="px-4 py-2.5 text-[14px]">
              <span className="font-sport text-ocean mr-2">{block.start}</span>Aula até {block.end}
            </div>
          )}
          {list.map((i) => (
            <AgendaRow key={i.id} item={i} day={day} />
          ))}
          {!block && !list.length && <div className="px-4 py-3 text-[13.5px] text-muted">Nada marcado hoje.</div>}
        </div>
      </section>
      {plan && <DailyBlocksList trip={trip} plan={plan} />}
      {priorities.length > 0 && (
        <Card>
          <div className="eyebrow">prioridades</div>
          <ol className="mt-1.5 space-y-1 text-[14px]">
            {priorities.map((p, n) => (
              <li key={p.key}>
                {n + 1}. {p.title}
                {p.due ? <span className="text-muted text-[12px]"> · {dm(p.due)}</span> : null}
              </li>
            ))}
          </ol>
        </Card>
      )}
      {withChecklist.map((i) => (
        <ItemChecklist key={i.id} item={i} />
      ))}
    </>
  )
}

function AgendaRow({ item: i, day }: { item: TripItem; day: DateKey }) {
  const at = i.date === day ? i.leaveTime ?? i.time : undefined
  return (
    <div className="px-4 py-2.5">
      <button type="button" onClick={() => openSheet('tripItem', { id: i.id })} className="w-full text-left flex items-baseline gap-2">
        <span className="font-sport text-[14px] w-12 shrink-0 text-ink-2">{at ?? '—'}</span>
        <span className="flex-1 min-w-0 text-[14px]">{i.title}</span>
        <span className="text-[10.5px] text-muted shrink-0">{BOOKING_STATUS_META[bookingOf(i)].label}</span>
      </button>
      {(i.address || i.url) && (
        <div className="pl-14 text-[12px] text-muted flex flex-wrap gap-x-3">
          {i.address && <span>{i.address}</span>}
          {i.url && (
            <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
              <ExternalLink size={11} aria-hidden /> link
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function WeatherLine({ trip, day }: { trip: ExpTrip; day: DateKey }) {
  const f = useForecast(trip.expedition.weather, trip.expedition.timeZone)
  const d = f.status === 'ok' ? f.data.days.find((x) => x.date === day) : undefined
  const r = (v?: number) => (v == null ? '—' : Math.round(v))
  return (
    <div className="card px-4 py-3 flex items-start gap-3 text-[13.5px]">
      <CloudSun size={18} className="mt-0.5 text-muted shrink-0" aria-hidden />
      {f.status === 'loading' ? (
        <span className="text-muted">Buscando a previsão…</span>
      ) : d ? (
        <span className="text-ink-2">
          {trip.expedition.weather?.label}: {r(d.tMin)}° / {r(d.tMax)}° · vento {r(d.windMax)} km/h{d.gustMax != null ? ` (rajadas ${r(d.gustMax)})` : ''}
          {d.rainProb != null ? ` · chuva ${d.rainProb}%` : ''}
          <span className="block text-[11.5px] text-muted">Open-Meteo · previsão, não garantia.</span>
        </span>
      ) : (
        <span className="text-ink-2">Previsão indisponível — conferir antes de sair.</span>
      )}
    </div>
  )
}

// ─── 20:30 ─────────────────────────────────────────────────────────────────

function Evening({ trip, items, expenses, day }: Props & { day: DateKey }) {
  const plan = useDailyPlan(trip, items, day)
  const workouts = useDB((db) => db.workouts)
  const occurrences = useDB((db) => db.occurrences)
  const spend = useMemo(() => daySpend(trip, items, expenses, day), [trip, items, expenses, day])
  const check = useMemo(() => tomorrowChecklist(trip, items, workouts, occurrences, day), [trip, items, workouts, occurrences, day])
  const tomorrow = addDays(day, 1)
  const soon = useMemo(() => toBook(trip, items, day).rows.filter((r) => r.overdue || (r.deadline && r.deadline <= addDays(day, 2)) || r.item.date === tomorrow), [trip, items, day, tomorrow])
  const conflicts = useMemo(() => findConflicts(trip, items, workouts).filter((c) => c.date === tomorrow), [trip, items, workouts, tomorrow])
  return (
    <>
      <div className="px-1">
        <div className="eyebrow">revisão da noite</div>
        <h2 className="font-display text-[26px] leading-tight mt-1 first-letter:uppercase">{formatLongDate(day)}</h2>
      </div>
      {plan && <DailyBlocksList trip={trip} plan={plan} />}
      <Card>
        <div className="eyebrow">gasto de hoje</div>
        <div className="font-display text-[22px] mt-1">{spend ? formatMoney(spend.cents, trip.expedition.currency) : 'Nada registrado'}</div>
        {spend && <div className="text-[12px] text-muted">{spend.source === 'extrato' ? 'pelo extrato (o pago dos itens do dia não soma de novo)' : 'pelo pago registrado nos itens'}</div>}
      </Card>
      {conflicts.map((c) => (
        <div key={c.key} className="rounded-xl bg-sand-soft px-3 py-2 text-[12.5px] text-ink-2 flex gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> Amanhã: {c.text}
        </div>
      ))}
      <ChecklistCard check={check} />
      {soon.length > 0 && (
        <section>
          <h3 className="eyebrow px-1 mb-2">reservas com prazo agora</h3>
          <div className="card divide-y divide-line/70">
            {soon.map((r) => (
              <button key={r.item.id} type="button" onClick={() => openSheet('tripItem', { id: r.item.id })} className="w-full text-left px-4 py-2.5">
                <span className="block text-[14px]">
                  {r.item.priority ? `${r.item.priority} · ` : ''}
                  {r.item.title}
                </span>
                <span className="block text-[12px] text-muted">
                  {[BOOKING_STATUS_META[r.status].label, r.deadline && `${r.overdue ? 'prazo vencido' : 'até'} ${dm(r.deadline)}`, r.item.nextAction].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export function ChecklistCard({ check }: { check: DayChecklist }) {
  const groups: [string, string[]][] = [
    ['roupas e equipamentos', check.gear],
    ['documentos', check.documents],
    ['comida e água', check.food],
    ['transporte', check.transport],
    ['reservas', check.bookings],
    ['blocos obrigatórios', check.blocks],
  ]
  return (
    <Card>
      <div className="eyebrow">checklist de amanhã · {formatShortDate(check.date)}</div>
      <p className="text-[14px] mt-1">
        {check.departure ? (
          <>
            Saída <b className="font-sport">{check.departure.at}</b> · {check.departure.title}
            {check.departure.wake ? ` (acordar ${check.departure.wake})` : ''}
          </>
        ) : (
          'Sem horário de saída registrado.'
        )}
      </p>
      {groups
        .filter(([, xs]) => xs.length)
        .map(([title, xs]) => (
          <div key={title} className="mt-2.5">
            <div className="text-[11.5px] text-muted uppercase tracking-wide">{title}</div>
            <ul className="text-[13.5px] text-ink-2 list-disc pl-4 mt-0.5 space-y-0.5">
              {xs.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
    </Card>
  )
}

// ─── Financial close ────────────────────────────────────────────────────────

export function FinancialCloseCard({ trip, items, expenses }: Props) {
  const f = useMemo(() => financialClose(trip, items, expenses), [trip, items, expenses])
  const cur = f.currency
  return (
    <Card>
      <div className="eyebrow">fechamento financeiro</div>
      <dl className="grid grid-cols-2 gap-2 mt-2.5 text-[12.5px]">
        <Cell label="pago até agora" cents={f.paid} trip={trip} />
        <Cell label="comprometido (reservado, não pago)" cents={f.committed} trip={trip} />
        <Cell label="estimado (planejado/cotado)" cents={f.estimated} trip={trip} />
        <Cell label="total projetado" cents={f.projected} trip={trip} />
      </dl>
      {f.budget && (
        <div className="mt-3 text-[13px] text-ink-2">
          Orçamento original {formatMoney(f.budget.cents, f.currency)}
          {f.budget.inTrip != null && cur !== 'BRL' ? ` (≈ ${formatMoney(f.budget.inTrip, cur)})` : ''} — referência, não saldo.
          {f.budget.remaining != null && (
            <span className="block">
              Sobra depois do projetado: <b>{formatMoney(f.budget.remaining, cur)}</b>
            </span>
          )}
        </div>
      )}
      <p className="text-[13px] font-medium mt-2">{RISK_LABEL[f.risk]}</p>
      {f.withoutValue.length > 0 && <p className="text-[12px] text-muted mt-1">{f.withoutValue.length} itens no roteiro ainda sem valor — o total sobe quando entrarem.</p>}
      {f.unconverted.map((u) => (
        <p key={u.currency} className="text-[12px] text-muted mt-1">
          {formatMoney(u.cents, u.currency as typeof cur)} no extrato sem cotação: fora da conta até ter cotação.
        </p>
      ))}
      <ul className="mt-2.5 text-[12.5px] text-ink-2 list-disc pl-4 space-y-0.5">
        {f.savings.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="text-[11.5px] text-muted mt-2">Só entra o que está registrado no app: gastos de antes da viagem que não foram lançados aqui não estão descontados.</p>
    </Card>
  )
}

function Cell({ label, cents, trip }: { label: string; cents: number; trip: Trip }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5">
        <MoneyPair trip={trip} cents={cents} className="font-sport text-[15px] text-ink" />
      </dd>
    </div>
  )
}
