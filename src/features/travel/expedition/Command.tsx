/**
 * Expedição · command center views (Atualização mestre 31/10): the dashboard strip on top, and the views
 * Reservas e pagamentos, Treinos · estudos · trabalho, Compras · souvenirs · bagagem and the documents part
 * of Segurança. Reads the store; every change goes through `actions` (persistent, editable).
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import type { DateKey, Task, Trip, TripExpedition, TripItem, Workout } from '@/data/types'
import { actions, useDB } from '@/data/store'
import { openSheet } from '@/app/ui-store'
import { Card, Checkbox, Segmented } from '@/components/ui'
import { useNow } from '@/hooks/useToday'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/date'
import { formatMoney, isActive, localNow } from './logic'
import {
  CATEGORY_META,
  bookingStatusOf,
  budgetByCategory,
  tripLedger,
  daysLabel,
  inTripDates,
  isShopping,
  minutesLabel,
  shoppingBy,
  taskPriority,
  tripAlerts,
  tripDashboard,
  tripWorkouts,
  workBlocks,
} from './command'
import { MoneyPair, StatusBadge } from './ui'

type ExpTrip = Trip & { expedition: TripExpedition }
const dm = (d: DateKey) => `${d.slice(8)}/${d.slice(5, 7)}`

function useTripTasks(trip: Trip) {
  const tasks = useDB((db) => db.tasks)
  return useMemo(() => tasks.filter((t) => t.tripId === trip.id || (t.projectId && t.date && inTripDates(trip, t.date))), [tasks, trip])
}

// ─── Dashboard strip ────────────────────────────────────────────────────────

/** Top of the trip: next commitment, 3 priorities, pending bookings, awaited answers, spend, days to the flight. */
export function DashboardStrip({ trip, items }: { trip: ExpTrip; items: TripItem[] }) {
  const tasks = useDB((db) => db.tasks)
  const expenses = useDB((db) => db.expenses)
  const { now } = useNow()
  const local = localNow(trip.expedition.timeZone, now)
  const d = useMemo(() => tripDashboard(trip, items, tasks, local, expenses), [trip, items, tasks, local, expenses])
  const open = (p: { kind: 'task' | 'tripItem'; id: string }) => (p.kind === 'task' ? openSheet('task', { id: p.id }) : openSheet('tripItem', { id: p.id }))
  return (
    <section className="space-y-2.5" aria-label="Painel da viagem">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="próximo compromisso" onPress={d.next ? () => openSheet('tripItem', { id: d.next!.item.id }) : undefined}>
          {d.next ? (
            <>
              <span className="font-sport text-[17px] text-ink">{d.next.date === local.date ? d.next.at : `${dm(d.next.date)} ${d.next.at}`}</span>
              <span className="block text-[12.5px] text-ink-2 truncate">{d.next.item.title}</span>
            </>
          ) : (
            <span className="text-[13px] text-muted">nada marcado</span>
          )}
        </Tile>
        <Tile label="voo de volta">
          {d.daysToFlight != null ? (
            <>
              <span className="font-sport text-[17px] text-ink">{d.daysToFlight} dias</span>
              <span className="block text-[12.5px] text-muted">{d.flight?.date ? `${dm(d.flight.date)} · ${daysLabel(d.daysToFlight)}` : daysLabel(d.daysToFlight)}</span>
            </>
          ) : (
            <span className="text-[13px] text-muted">sem voo</span>
          )}
        </Tile>
        <Tile label="reservas pendentes">
          <span className="font-sport text-[17px] text-ink">{d.pendingBookings.length}</span>
          <span className="block text-[12.5px] text-muted truncate">{d.pendingBookings[0]?.title ?? 'nenhuma'}</span>
        </Tile>
        <Tile label="respostas aguardadas">
          <span className="font-sport text-[17px] text-ink">{d.awaiting.length}</span>
          <span className="block text-[12.5px] text-muted truncate">{d.awaiting.map((i) => i.supplier ?? i.title).join(' · ') || 'nenhuma'}</span>
        </Tile>
      </div>
      <Card>
        <div className="flex items-baseline justify-between">
          <div className="eyebrow">3 prioridades do dia</div>
          <span className="text-[12px] text-muted">
            gasto confirmado <MoneyPair trip={trip} cents={d.spentCents} className="text-ink-2 font-medium" />
          </span>
        </div>
        {d.priorities.length ? (
          <ol className="mt-2 space-y-1.5">
            {d.priorities.map((p, n) => (
              <li key={p.key}>
                <button type="button" onClick={() => open(p)} className="w-full flex items-start gap-2.5 text-left text-[14px]">
                  <span className="font-sport text-[15px] text-muted w-4 shrink-0">{n + 1}</span>
                  <span className="flex-1 min-w-0">{p.title}</span>
                  <span className="text-[11.5px] text-muted shrink-0">
                    {p.priority ?? ''}
                    {p.due ? ` · ${dm(p.due)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-muted mt-2">Nada urgente hoje. Aproveite 🌿</p>
        )}
      </Card>
    </section>
  )
}

function Tile({ label, children, onPress }: { label: string; children: React.ReactNode; onPress?: () => void }) {
  const cls = 'card p-3 text-left min-w-0'
  return onPress ? (
    <button type="button" onClick={onPress} className={cn(cls, 'active:scale-[0.99] transition')}>
      <span className="eyebrow block text-[10.5px]">{label}</span>
      {children}
    </button>
  ) : (
    <div className={cls}>
      <span className="eyebrow block text-[10.5px]">{label}</span>
      {children}
    </div>
  )
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

export function AlertList({ trip, limit }: { trip: Trip; limit?: number }) {
  const tasks = useDB((db) => db.tasks)
  const { today } = useNow()
  const list = useMemo(() => tripAlerts(trip, tasks), [trip, tasks])
  if (!list.length) return null
  const shown = limit ? list.slice(0, limit) : list
  return (
    <section>
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h3 className="eyebrow">alertas com prazo</h3>
        <span className="text-[12px] text-muted tabular-nums">{list.length}</span>
      </div>
      <div className="card divide-y divide-line/70">
        {shown.map((t) => (
          <TaskRow key={t.id} task={t} late={!!t.dueDate && t.dueDate < today} />
        ))}
      </div>
    </section>
  )
}

function TaskRow({ task, late, sub }: { task: Task; late?: boolean; sub?: string }) {
  const done = task.status === 'done'
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Checkbox
        size="sm"
        checked={done}
        label={task.title}
        onChange={(v) => actions.update('tasks', task.id, v ? { status: 'done', completedAt: new Date().toISOString() } : { status: 'todo', completedAt: undefined })}
      />
      <button type="button" onClick={() => openSheet('task', { id: task.id })} className="flex-1 min-w-0 text-left">
        <span className={cn('block text-[14px]', done && 'line-through text-muted')}>{task.title}</span>
        <span className={cn('block text-[12px]', late && !done ? 'text-[color-mix(in_oklab,var(--sand)_62%,var(--ink))] font-medium' : 'text-muted')}>
          {[taskPriority(task), task.dueDate && `prazo ${dm(task.dueDate)}`, task.date && task.date !== task.dueDate && `planejada ${dm(task.date)}`, sub].filter(Boolean).join(' · ')}
        </span>
      </button>
    </div>
  )
}

// ─── 2 · Reservas e pagamentos ──────────────────────────────────────────────

const GROUPS: { title: string; hint: string; match: (s: ReturnType<typeof bookingStatusOf>) => boolean }[] = [
  { title: 'aguardando resposta', hint: 'Pedido feito; falta o fornecedor responder.', match: (s) => s === 'aguardando_resposta' },
  { title: 'aguardando pagamento', hint: 'Fornecedor respondeu; falta pagar ou assinar.', match: (s) => s === 'aguardando_pagamento' },
  { title: 'a cotar', hint: 'Sem preço final ainda.', match: (s) => s === 'a_cotar' },
  { title: 'a reservar', hint: 'Decidido; falta reservar.', match: (s) => s === 'a_reservar' },
  { title: 'reservado', hint: 'Com voucher, comprovante ou confirmação do fornecedor.', match: (s) => s === 'reservado' },
]

export function Reservas({ trip, items }: { trip: ExpTrip; items: TripItem[] }) {
  const rows = useMemo(() => items.filter((i) => isActive(i) && !i.optional && i.status !== 'feito'), [items])
  const expenses = useDB((db) => db.expenses)
  const categories = useMemo(() => budgetByCategory(trip, items, expenses).filter((r) => r.estimated || r.quoted || r.paid), [trip, items, expenses])
  const ledger = useMemo(() => tripLedger(trip, expenses).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [trip, expenses])
  const cur = trip.expedition.currency
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => {
        const list = rows.filter((i) => g.match(bookingStatusOf(i))).sort((a, b) => (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9') || (a.deadline ?? a.date ?? '9999').localeCompare(b.deadline ?? b.date ?? '9999'))
        if (!list.length) return null
        return (
          <section key={g.title}>
            <div className="flex items-baseline justify-between px-1 mb-1">
              <h3 className="eyebrow">{g.title}</h3>
              <span className="text-[12px] text-muted tabular-nums">{list.length}</span>
            </div>
            <p className="text-[12.5px] text-muted px-1 mb-2">{g.hint}</p>
            <div className="card divide-y divide-line/70">
              {list.map((i) => (
                <BookingRow key={i.id} trip={trip} item={i} />
              ))}
            </div>
          </section>
        )
      })}
      <section>
        <h3 className="eyebrow px-1 mb-2">orçamento por categoria · {cur}</h3>
        <Card className="p-0">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-muted text-left">
                <th className="font-normal px-3 py-2">categoria</th>
                <th className="font-normal px-2 py-2 text-right">previsto</th>
                <th className="font-normal px-2 py-2 text-right">cotado</th>
                <th className="font-normal px-3 py-2 text-right">pago</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((r) => (
                <tr key={r.category} className="border-t border-line/70">
                  <td className="px-3 py-2">
                    {CATEGORY_META[r.category].emoji} {CATEGORY_META[r.category].label}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.estimated ? formatMoney(r.estimated, cur) : '—'}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.quoted ? formatMoney(r.quoted, cur) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{r.paid ? formatMoney(r.paid, cur) : '—'}</td>
                </tr>
              ))}
              {!categories.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-muted">
                    Nenhum valor ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <p className="text-[12px] text-muted px-1 mt-2">
          Previsto ≠ cotação recebida ≠ pagamento confirmado. Valores publicados não garantem disponibilidade. Reserva de emergência = a margem de {trip.expedition.marginPct}% abaixo. Em reais só com a sua cotação.
        </p>
      </section>
      {ledger.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <h3 className="eyebrow">gastos reais · extrato</h3>
            <span className="text-[12px] text-muted tabular-nums">{formatMoney(ledger.reduce((t, e) => t + e.amountCents, 0), cur)}</span>
          </div>
          <div className="card divide-y divide-line/70">
            {ledger.map((e) => (
              <button key={e.id} type="button" onClick={() => openSheet('expense', { id: e.id })} className="w-full text-left px-4 py-2.5 flex items-baseline gap-3">
                <span className="text-[12px] text-muted tabular-nums w-11 shrink-0">{e.date!.slice(8, 10)}/{e.date!.slice(5, 7)}</span>
                <span className="flex-1 min-w-0 text-[14px] leading-snug truncate">{e.title}</span>
                {e.tripCategory && <span className="text-[11.5px] text-muted shrink-0">{CATEGORY_META[e.tripCategory].label}</span>}
                <span className="text-[13px] tabular-nums shrink-0">{formatMoney(e.amountCents, (e.currency ?? cur) as typeof cur)}</span>
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted px-1 mt-2">Nos dias que o extrato cobre, ele é o valor real: o pago dos passeios desses dias não é somado de novo.</p>
        </section>
      )}
    </div>
  )
}

function BookingRow({ trip, item }: { trip: ExpTrip; item: TripItem }) {
  const cur = item.currency ?? trip.expedition.currency
  const value = item.paidCents ?? item.quotedCents ?? item.estimatedCents
  const kind = item.paidCents != null ? 'pago' : item.quotedCents != null ? 'cotado' : item.estimatedCents != null ? 'referência' : undefined
  return (
    <div className="px-4 py-3">
      <button type="button" onClick={() => openSheet('tripItem', { id: item.id })} className="w-full text-left">
        <div className="flex items-start gap-2">
          <span className="flex-1 min-w-0 text-[14.5px] leading-snug">{item.title}</span>
          {item.priority && <span className="text-[11.5px] font-semibold text-ink-2 shrink-0">{item.priority}</span>}
          <StatusBadge item={item} />
        </div>
        <div className="text-[12px] text-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {item.date && <span>{formatShortDate(item.date)}{item.endDate && item.endDate !== item.date ? `–${formatShortDate(item.endDate)}` : ''}</span>}
          {value != null && kind && (
            <span>
              {kind} {formatMoney(value, cur)}
            </span>
          )}
          <span>pagamento: {item.paymentStatus === 'pago' ? 'realizado' : item.paymentStatus === 'nao_se_aplica' ? 'não se aplica' : 'pendente'}</span>
          {item.cancellationPolicy && <span>cancelamento: {item.cancellationPolicy}</span>}
        </div>
        {item.caveat && <div className="text-[12px] text-muted italic mt-0.5">{item.caveat}</div>}
        {item.nextAction && (
          <div className="text-[12.5px] text-ink-2 mt-1">
            → {item.nextAction}
            {item.deadline ? <b className="font-semibold"> · até {dm(item.deadline)}</b> : null}
          </div>
        )}
      </button>
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] text-accent">
          <ExternalLink size={12} aria-hidden /> fornecedor
        </a>
      )}
    </div>
  )
}

// ─── 3 · Treinos, estudos e trabalho ────────────────────────────────────────

const W_STATUS: Record<Workout['status'], string> = { planejado: 'planejado', feito: 'feito', adaptado: 'adaptado', descanso: 'descanso', pulado: 'pulado' }

export function RotinaTop({ trip }: { trip: ExpTrip }) {
  const workouts = useDB((db) => db.workouts)
  const tasks = useTripTasks(trip)
  const list = useMemo(() => tripWorkouts(trip, workouts), [trip, workouts])
  const blocks = useMemo(() => workBlocks(trip, tasks), [trip, tasks])
  const school = trip.expedition.school
  return (
    <div className="space-y-5">
      <section>
        <h3 className="eyebrow px-1 mb-2">treinos da viagem</h3>
        <p className="text-[12.5px] text-muted px-1 mb-2">Sem sessão intensa em dia de grande aventura (04/11, 07–09/11, 13–15/11). Joelho esquerdo: inferior adaptado. Bungee só com liberação médica e aceite formal da operadora.</p>
        <div className="card divide-y divide-line/70">
          {list.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-4 py-2.5">
              <Checkbox size="sm" checked={w.status === 'feito'} label={w.title ?? w.modality} onChange={(v) => actions.update('workouts', w.id, { status: v ? 'feito' : 'planejado' })} />
              <button type="button" onClick={() => openSheet('workout', { id: w.id })} className="flex-1 min-w-0 text-left">
                <span className={cn('block text-[14px]', w.status === 'feito' && 'line-through text-muted')}>{w.title ?? w.modality}</span>
                <span className="block text-[12px] text-muted">
                  {formatShortDate(w.date)}
                  {w.intensity ? ` · ${w.intensity}` : ''} · {W_STATUS[w.status]}
                </span>
              </button>
            </div>
          ))}
          {!list.length && <div className="px-4 py-3 text-[13px] text-muted">Nenhum treino nas datas da viagem.</div>}
        </div>
      </section>

      {school && (school.reviewMinutes || school.focus?.length) && (
        <Card>
          <div className="eyebrow">inglês · revisão diária</div>
          {school.reviewMinutes && <p className="text-[14px] mt-1">{school.reviewMinutes}</p>}
          {school.focus && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {school.focus.map((f) => (
                <span key={f} className="h-7 px-2.5 rounded-full bg-surface-2 text-[12.5px] text-ink-2 inline-flex items-center">
                  {f}
                </span>
              ))}
            </div>
          )}
          <p className="text-[12px] text-muted mt-2">Faltas e conteúdos perdidos: anote na atividade que causou a falta (aba Escola abaixo).</p>
        </Card>
      )}

      <section>
        <h3 className="eyebrow px-1 mb-2">trabalho · blocos em dias leves</h3>
        <p className="text-[12.5px] text-muted px-1 mb-2">45–90 min depois da aula. Nunca em mergulho, Garden Route, transfers ou safári.</p>
        {blocks.length ? (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div key={b.date} className="card">
                <div className="flex items-baseline justify-between px-4 pt-3">
                  <span className="text-[13.5px] font-medium">{formatShortDate(b.date)}</span>
                  <span className="text-[12px] text-muted">{minutesLabel(b.minutes)}</span>
                </div>
                <div className="divide-y divide-line/70">
                  {b.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} sub={t.durationMin ? `${t.durationMin} min` : undefined} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card px-4 py-3 text-[13px] text-muted">Nenhum bloco de trabalho nas datas da viagem.</div>
        )}
      </section>
      <h3 className="eyebrow px-1">escola</h3>
    </div>
  )
}

// ─── 4 · Compras, souvenirs e bagagem ───────────────────────────────────────

export function Compras({ trip, items }: { trip: ExpTrip; items: TripItem[] }) {
  const [by, setBy] = useState<'person' | 'category'>('person')
  const groups = useMemo(() => shoppingBy(trip, items, by), [trip, items, by])
  const rules = items.filter((i) => isActive(i) && i.group === 'Compras e souvenirs' && !isShopping(i))
  return (
    <div className="space-y-4">
      <Segmented value={by} onChange={setBy} options={[{ value: 'person', label: 'Por pessoa' }, { value: 'category', label: 'Por categoria' }]} />
      {rules.map((i) => (
        <CheckRow key={i.id} item={i} />
      ))}
      {groups.map((g) => (
        <section key={g.key}>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <h3 className="eyebrow">{g.key}</h3>
            <span className="text-[12px] text-muted">
              {g.estimated || g.paid ? (
                <>
                  previsto <MoneyPair trip={trip} cents={g.estimated} /> · pago <MoneyPair trip={trip} cents={g.paid} />
                </>
              ) : (
                `${g.open} em aberto · sem valor`
              )}
            </span>
          </div>
          <div className="card divide-y divide-line/70">
            {g.items.map((i) => (
              <CheckRow key={i.id} item={i} sub={by === 'category' ? i.person : i.category ? CATEGORY_META[i.category].label : undefined} bare />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <div className="card px-4 py-4 text-[13.5px] text-muted">Nada na lista de compras.</div>}
      <p className="text-[12px] text-muted px-1">Antes de comprar: regras de líquidos, bebidas alcoólicas, alfândega e franquia de bagagem. Vinho de preferência nas vinícolas; mala só depois de conferir peso, dimensões e despacho.</p>
    </div>
  )
}

function CheckRow({ item, sub, bare }: { item: TripItem; sub?: string; bare?: boolean }) {
  const done = item.status === 'feito'
  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5', !bare && 'card')}>
      <Checkbox size="sm" checked={done} label={item.title} onChange={(v) => actions.update('tripItems', item.id, v ? { status: 'feito', bookingStatus: 'concluido' } : { status: 'a_fazer', bookingStatus: 'planejado' })} />
      <button type="button" onClick={() => openSheet('tripItem', { id: item.id })} className="flex-1 min-w-0 text-left">
        <span className={cn('block text-[14px]', done && 'line-through text-muted')}>{item.title}</span>
        {(sub || item.deadline || item.notes) && <span className="block text-[12px] text-muted">{[sub, item.deadline && !done && `até ${dm(item.deadline)}`, item.notes].filter(Boolean).join(' · ')}</span>}
      </button>
    </div>
  )
}

// ─── 5 · Segurança e documentos ─────────────────────────────────────────────

export function SegurancaTop({ items }: { trip: ExpTrip; items: TripItem[] }) {
  const safety = items.filter((i) => isActive(i) && i.group === 'Segurança')
  const docs = items.filter((i) => isActive(i) && (i.section === 'documento' || i.section === 'voo' || i.voucherUrl))
  const done = safety.filter((i) => i.status === 'feito').length
  return (
    <div className="space-y-4">
      {safety.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between px-1 mb-2">
            <h3 className="eyebrow">checklist de segurança</h3>
            <span className="text-[12px] text-muted tabular-nums">
              {done}/{safety.length}
            </span>
          </div>
          <div className="card divide-y divide-line/70">
            {safety.map((i) => (
              <CheckRow key={i.id} item={i} bare />
            ))}
          </div>
        </section>
      )}
      <section>
        <h3 className="eyebrow px-1 mb-2">documentos, passagens e vouchers</h3>
        <div className="card divide-y divide-line/70">
          {docs.map((i) => (
            <div key={i.id} className="px-4 py-2.5 flex items-center gap-3">
              <button type="button" onClick={() => openSheet('tripItem', { id: i.id })} className="flex-1 min-w-0 text-left">
                <span className="block text-[14px]">{i.title}</span>
                <span className="block text-[12px] text-muted">{[i.date && formatShortDate(i.date), i.caveat, !i.voucherUrl && i.section !== 'documento' ? 'sem voucher salvo' : undefined].filter(Boolean).join(' · ')}</span>
              </button>
              {i.voucherUrl ? (
                <a href={i.voucherUrl} target="_blank" rel="noreferrer" className="text-[12.5px] text-accent shrink-0">
                  voucher
                </a>
              ) : (
                <AlertTriangle size={14} className="text-muted shrink-0" aria-label="sem voucher" />
              )}
            </div>
          ))}
          {!docs.length && <div className="px-4 py-3 text-[13px] text-muted">Nenhum documento registrado.</div>}
        </div>
        <p className="text-[12px] text-muted px-1 mt-2">Salve vouchers, passagens, seguro e documentos offline. Não divulgue a hospedagem em tempo real.</p>
      </section>
    </div>
  )
}

/** Day rows the integrated calendar adds next to the trip items: the trip's workouts and tasks of that day. */
export function DayExtras({ trip, date }: { trip: Trip; date: DateKey }) {
  const workouts = useDB((db) => db.workouts)
  const tasks = useTripTasks(trip)
  const ws = workouts.filter((w) => w.date === date)
  const ts = tasks.filter((t) => t.date === date && t.status !== 'archived')
  const holiday = trip.expedition?.school?.holidays?.find((h) => h.date === date)
  if (!ws.length && !ts.length && !holiday) return null
  return (
    <div className="card px-4 py-2 space-y-1.5 text-[13px]">
      {holiday && <div className="text-ocean">🏫 {holiday.label} (não é falta)</div>}
      {ws.map((w) => (
        <button key={w.id} type="button" onClick={() => openSheet('workout', { id: w.id })} className="flex w-full items-center gap-2 text-left">
          <span aria-hidden>🏋️‍♀️</span>
          <span className={cn('flex-1 min-w-0', w.status === 'feito' && 'line-through text-muted')}>Treino · {w.title ?? w.modality}</span>
          <span className="text-[11.5px] text-muted">{w.status}</span>
        </button>
      ))}
      {ts.map((t) => (
        <button key={t.id} type="button" onClick={() => openSheet('task', { id: t.id })} className="flex w-full items-center gap-2 text-left">
          <span aria-hidden>{t.tripId ? '⏰' : '💻'}</span>
          <span className={cn('flex-1 min-w-0', t.status === 'done' && 'line-through text-muted')}>{t.title}</span>
          <span className="text-[11.5px] text-muted">{t.durationMin ? `${t.durationMin} min` : t.dueDate ? `prazo ${dm(t.dueDate)}` : ''}</span>
        </button>
      ))}
    </div>
  )
}

