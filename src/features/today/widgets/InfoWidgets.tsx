/** Widgets that quietly collapse when they have nothing useful to say. */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { Checkbox, tone as toneOf } from '@/components/ui'
import { actions } from '@/data/store'
import {
  activeProjects,
  agendaFor,
  checkinFor,
  isTaskOpen,
  nextBook,
  nextStudy,
  nextTrip,
  petTasksDue,
  readingNow,
  studyingNow,
  upcomingTrips,
  waitingFor,
  type AgendaEntry,
} from '@/data/selectors'
import type { DateKey } from '@/data/types'
import { addDays, countdownLabel, diffDays, formatShortDate, hmToMinutes, inMinutesLabel, relativeDay } from '@/lib/date'
import { occurrenceFor } from '@/lib/recurrence'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { tripPriorityItems } from '../context'
import { MOODS } from '../closing'
import { HeaderLink, Widget, type WidgetCtx } from './shared'

function openEntry(e: AgendaEntry) {
  if (e.kind === 'event') openSheet('event', { id: e.id })
  else if (e.kind === 'workout') openSheet('workout', { id: e.id })
  else openSheet('task', { id: e.id })
}

// ─── Próximo compromisso ────────────────────────────────────────────────────

export function NextUpWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today, minutes } = ctx
  const nav = useNavigate()
  const { allDay, upcoming, tomorrow } = useMemo(() => {
    const list = agendaFor(db, today)
    const upcoming = list.filter((e) => !e.allDay && e.time && !e.done && (e.endTime ? hmToMinutes(e.endTime) : hmToMinutes(e.time) + 30) > minutes)
    const tomorrow = upcoming.length ? undefined : agendaFor(db, addDays(today, 1)).find((e) => !e.allDay && e.time)
    return { allDay: list.filter((e) => e.allDay && e.kind === 'event'), upcoming, tomorrow }
  }, [db, today, minutes])

  if (!allDay.length && !upcoming.length && !tomorrow) return null

  return (
    <Widget id="proximo_compromisso" eyebrow={upcoming.length ? 'Próximos compromissos' : 'Agenda'} action={<HeaderLink onClick={() => nav(ROUTES.agenda)}>agenda</HeaderLink>}>
      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {allDay.map((e) => (
            <button key={e.id} type="button" onClick={() => openEntry(e)} className="h-7 px-2.5 rounded-full bg-accent-soft text-[12.5px] font-medium text-ink">
              {e.title}
            </button>
          ))}
        </div>
      )}
      {upcoming.length > 0 ? (
        <ol className="relative">
          {upcoming.slice(0, 3).map((e, i) => {
            const start = hmToMinutes(e.time!)
            const live = start <= minutes
            return (
              <li key={`${e.kind}-${e.id}`}>
                <button type="button" onClick={() => openEntry(e)} className="w-full flex items-start gap-3 py-2 text-left active:opacity-70">
                  <span className="w-12 shrink-0 pt-0.5">
                    <span className={cn('block font-display text-[17px] tabular-nums leading-tight', i === 0 ? 'text-ink' : 'text-ink-2')}>{e.time}</span>
                  </span>
                  <span className={cn('mt-[9px] h-2 w-2 rounded-full shrink-0', toneOf(e.tone).dot, !live && i > 0 && 'opacity-50')} aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className={cn('block leading-snug', i === 0 ? 'text-[16px] font-medium' : 'text-[15px] text-ink-2')}>
                      {e.emoji && e.emoji !== '✓' ? `${e.emoji} ` : ''}
                      {e.title}
                    </span>
                    <span className="block text-[12.5px] text-muted mt-0.5 truncate">
                      {[live ? 'agora' : inMinutesLabel(start - minutes), e.endTime ? `até ${e.endTime}` : undefined].filter(Boolean).join(' · ')}
                      {e.subtitle && (
                        <>
                          {' · '}
                          <MapPin size={11} className="inline -mt-0.5" /> {e.subtitle}
                        </>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {upcoming.length > 3 && <li className="text-[12.5px] text-muted pl-[60px] pt-1">+ {upcoming.length - 3} mais hoje</li>}
        </ol>
      ) : tomorrow ? (
        <button type="button" onClick={() => openEntry(tomorrow)} className="w-full flex items-center gap-3 text-left py-1">
          <span className="text-[13px] text-muted w-14 shrink-0">amanhã</span>
          <span className="font-display text-[17px] tabular-nums">{tomorrow.time}</span>
          <span className="flex-1 min-w-0 truncate text-[15px]">
            {tomorrow.emoji && tomorrow.emoji !== '✓' ? `${tomorrow.emoji} ` : ''}
            {tomorrow.title}
          </span>
        </button>
      ) : null}
    </Widget>
  )
}

// ─── Próxima viagem ─────────────────────────────────────────────────────────

export function TripWidget({ ctx }: { ctx: WidgetCtx }) {
  const nav = useNavigate()
  const trip = useMemo(() => nextTrip(ctx.db, ctx.today), [ctx.db, ctx.today])
  const soon = ctx.home.tripSoon?.trip.id === trip?.id
  const pending = useMemo(() => (trip && soon ? tripPriorityItems(ctx.db, trip) : []), [ctx.db, trip, soon])
  if (!trip) return null
  const t = toneOf(trip.tone)
  const when = trip.startDate ? countdownLabel(trip.startDate, ctx.today) : trip.dateLabel
  const dates = trip.startDate
    ? `${formatShortDate(trip.startDate)}${trip.endDate ? ` – ${formatShortDate(trip.endDate)}` : ''}`
    : undefined
  return (
    <section id="w-proxima_viagem" className={cn('scroll-mt-4 rounded-[var(--radius-card)] overflow-hidden', t.soft)}>
      <button type="button" onClick={() => nav(ROUTES.trip(trip.id))} className="w-full text-left p-4 flex items-center gap-4 active:opacity-80 transition">
        <span className="text-[42px] leading-none" aria-hidden>
          {trip.flag}
        </span>
        <span className="flex-1 min-w-0">
          <span className="eyebrow block">Próxima viagem</span>
          <span className="block font-display text-[21px] leading-tight mt-0.5 truncate">{trip.name}</span>
          <span className="block text-[13px] text-ink-2 mt-0.5">
            {[when, dates, !trip.datesConfirmed && trip.startDate ? 'datas a confirmar' : undefined].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ChevronRight size={18} className="text-muted shrink-0" />
      </button>
      {pending.length > 0 && (
        <div className="mx-3 mb-3 rounded-2xl bg-surface/70 px-3.5 py-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted font-semibold pt-1">Antes de ir</div>
          <ul>
            {pending.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => (p.kind === 'tripItem' ? openSheet('tripItem', { id: p.id }) : openSheet('task', { id: p.id }))}
                  className="w-full flex items-center gap-2.5 min-h-[40px] text-left active:opacity-70"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-ink/40 shrink-0" aria-hidden />
                  <span className="flex-1 min-w-0 text-[14px] truncate">{p.title}</span>
                  {p.status === 'a_confirmar' && <span className="text-[11.5px] text-muted shrink-0">a confirmar</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ─── Lendo agora ────────────────────────────────────────────────────────────

export function ReadingWidget({ ctx }: { ctx: WidgetCtx }) {
  const nav = useNavigate()
  const { book, next } = useMemo(() => ({ book: readingNow(ctx.db)[0], next: nextBook(ctx.db) }), [ctx.db])
  if (!book && !next) return null
  const main = book ?? next!
  return (
    <Widget id="lendo_agora" eyebrow={book ? 'Lendo agora' : 'Próximo livro'}>
      <button type="button" onClick={() => nav(ROUTES.book(main.id))} className="w-full flex items-center gap-3.5 text-left active:opacity-80">
        {main.coverUrl ? (
          <img src={main.coverUrl} alt="" className="h-[68px] w-[46px] rounded-md object-cover shadow-sm shrink-0" />
        ) : (
          <span className="h-[68px] w-[46px] rounded-md bg-plum-soft text-plum flex items-center justify-center font-display text-[18px] shrink-0 shadow-sm" aria-hidden>
            {main.title.slice(0, 1)}
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block font-display text-[18px] leading-snug line-clamp-2">{main.title}</span>
          {main.author && <span className="block text-[13px] text-muted mt-0.5 truncate">{main.author}</span>}
          {book && book.progress > 0 && (
            <span className="mt-2 block h-1 rounded-full bg-surface-2 overflow-hidden">
              <span className="block h-full bg-plum rounded-full" style={{ width: `${Math.min(100, book.progress)}%` }} />
            </span>
          )}
        </span>
      </button>
      {book && next && (
        <button type="button" onClick={() => nav(ROUTES.book(next.id))} className="mt-3 text-[13px] text-muted text-left w-full truncate">
          depois: <span className="text-ink-2">{next.title}</span>
        </button>
      )}
    </Widget>
  )
}

// ─── Estudo atual ───────────────────────────────────────────────────────────

export function StudyWidget({ ctx }: { ctx: WidgetCtx }) {
  const nav = useNavigate()
  const { now, next } = useMemo(() => ({ now: studyingNow(ctx.db).slice(0, 2), next: nextStudy(ctx.db) }), [ctx.db])
  if (!now.length && !next) return null
  return (
    <Widget id="estudo_atual" eyebrow={now.length ? 'Estudando' : 'Próximo estudo'} action={<HeaderLink onClick={() => nav(ROUTES.study)}>estudos</HeaderLink>}>
      <div className="space-y-2.5">
        {(now.length ? now : [next!]).map((s) => {
          const track = s.trackId ? ctx.db.studyTracks.find((t) => t.id === s.trackId) : undefined
          return (
            <button key={s.id} type="button" onClick={() => openSheet('study', { id: s.id })} className="w-full flex items-start gap-3 text-left active:opacity-80">
              <span className={cn('h-10 w-10 rounded-xl flex items-center justify-center text-[18px] shrink-0', toneOf(track?.tone ?? 'ocean').soft)} aria-hidden>
                {track?.emoji ?? '📚'}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium leading-snug">{s.title}</span>
                <span className="block text-[12.5px] text-muted mt-0.5 truncate">{s.nextContent ? `próximo: ${s.nextContent}` : track?.name ?? s.kind}</span>
              </span>
            </button>
          )
        })}
      </div>
      {now.length > 0 && next && (
        <p className="mt-3 text-[13px] text-muted truncate">
          depois: <span className="text-ink-2">{next.title}</span>
        </p>
      )}
    </Widget>
  )
}

// ─── Waiting for ────────────────────────────────────────────────────────────

export function WaitingWidget({ ctx }: { ctx: WidgetCtx }) {
  const nav = useNavigate()
  const list = useMemo(() => waitingFor(ctx.db), [ctx.db])
  if (!list.length) return null
  return (
    <Widget id="waiting_for" eyebrow={`Esperando · ${list.length}`} action={<HeaderLink onClick={() => nav(ROUTES.tasks)}>ver</HeaderLink>}>
      <ul className="-my-1">
        {list.slice(0, 3).map((t) => {
          const follow = t.waiting?.followUpOn && t.waiting.followUpOn <= ctx.today
          return (
            <li key={t.id}>
              <button type="button" onClick={() => openSheet('task', { id: t.id })} className="w-full flex items-center gap-3 py-2 text-left active:opacity-70">
                <span className="text-[15px]" aria-hidden>
                  ⏳
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] leading-snug truncate">{t.title}</span>
                  <span className="block text-[12.5px] text-muted truncate">
                    {t.waiting?.who ? `com ${t.waiting.who}` : 'esperando'}
                    {t.waiting?.since ? ` · desde ${relativeDay(t.waiting.since, ctx.today)}` : ''}
                    {follow && <span className="text-accent"> · dá pra cobrar</span>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Widget>
  )
}

// ─── Foco do trabalho ───────────────────────────────────────────────────────

export function WorkFocusWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today, home } = ctx
  const nav = useNavigate()
  const { tasks, delivery } = useMemo(() => {
    const inTop3 = new Set(db.priorities.filter((p) => p.date === today && p.ref?.type === 'task').map((p) => p.ref!.id))
    const tomorrow = addDays(today, 1)
    const tasks = db.tasks
      .filter((t) => !inTop3.has(t.id))
      .filter((t) => (t.context === 'trabalho' || !!t.projectId) && isTaskOpen(t) && t.status !== 'waiting' && t.status !== 'review' && !t.recurrence)
      .filter((t) =>
        home.weekend
          ? // Weekend: only what is really urgent stays visible.
            t.dueDate === today || t.dueDate === tomorrow
          : t.needsMe || t.date === today || t.dueDate === today || (!!t.date && t.date < today),
      )
      .sort((a, b) => Number(!!b.needsMe) - Number(!!a.needsMe) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9') || a.order - b.order)
      .slice(0, home.weekend ? 2 : 3)
    const delivery = activeProjects(db)
      .filter((p) => p.kind !== 'creator' && p.nextDelivery?.date && p.nextDelivery.date >= today && (!home.weekend || diffDays(today, p.nextDelivery.date) <= 2))
      .sort((a, b) => a.nextDelivery!.date!.localeCompare(b.nextDelivery!.date!))[0]
    return { tasks, delivery }
  }, [db, today, home.weekend])
  if (!tasks.length && !delivery) return null
  return (
    <Widget id="work_focus" eyebrow={tasks.length ? `Trabalho · ${tasks.length === 1 ? '1 item precisa de você' : `${tasks.length} itens precisam de você`}` : 'Trabalho'} action={<HeaderLink onClick={() => nav(ROUTES.work)}>trabalho</HeaderLink>}>
      {tasks.length > 0 && (
        <ul className="-my-1">
          {tasks.map((t) => {
            const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) : undefined
            return (
              <li key={t.id}>
                <button type="button" onClick={() => openSheet('task', { id: t.id })} className="w-full flex items-center gap-3 py-2 text-left active:opacity-70">
                  <span className="text-[15px]" aria-hidden>
                    {p?.emoji ?? '💻'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] leading-snug truncate">{t.title}</span>
                    <span className="block text-[12.5px] text-muted truncate">
                      {[p?.name, t.needsMe ? 'precisa de mim' : undefined, t.dueDate === today ? 'prazo hoje' : undefined].filter(Boolean).join(' · ') || 'hoje'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {delivery && (
        <button
          type="button"
          onClick={() => nav(ROUTES.project(delivery.id))}
          className={cn('w-full flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-left active:opacity-80', tasks.length > 0 && 'mt-3')}
        >
          <span className="text-[18px]" aria-hidden>
            {delivery.emoji}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] text-muted">Próxima entrega · {relativeDay(delivery.nextDelivery!.date!, today)}</span>
            <span className="block text-[14.5px] font-medium truncate">
              {delivery.name} — {delivery.nextDelivery!.title}
            </span>
          </span>
        </button>
      )}
    </Widget>
  )
}

// ─── Luna ───────────────────────────────────────────────────────────────────

export function LunaWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const nav = useNavigate()
  const due = useMemo(() => petTasksDue(db, today), [db, today])
  if (!due.length) return null
  const petName = (id: string) => db.pets.find((p) => p.id === id)?.name ?? 'Luna'
  const name = petName(due[0].petId)
  return (
    <Widget id="luna" eyebrow={`🐾 ${name} hoje`} action={<HeaderLink onClick={() => nav(ROUTES.luna)}>ver</HeaderLink>}>
      <ul className="-my-1">
        {due.slice(0, 4).map((p) => {
          const done = !!occurrenceFor(db.occurrences, 'petTask', p.id, today)
          const toggle = (v: boolean) => {
            if (p.recurrence) {
              actions.toggleOccurrence('petTask', p.id, today)
              if (v) haptic('success')
              return
            }
            // One-off: done means it leaves the list (with undo).
            if (v) {
              actions.update('petTasks', p.id, { active: false })
              haptic('success')
              toast('Feito ✓', { action: { label: 'Desfazer', run: () => actions.update('petTasks', p.id, { active: true }) } })
            }
          }
          return (
            <li key={p.id} className="flex items-center gap-3 min-h-[48px]">
              <Checkbox checked={done} onChange={toggle} label={`Concluir ${p.title}`} />
              <button type="button" onClick={() => openSheet('petTask', { id: p.id })} className={cn('flex-1 min-w-0 text-left text-[15px] py-1.5 pl-1', done && 'text-muted line-through decoration-muted/40')}>
                {p.title}
                {!p.recurrence && p.dueDate && p.dueDate < today && <span className="block text-[12px] text-muted no-underline">ficou de {relativeDay(p.dueDate, today)}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </Widget>
  )
}

// ─── Countdown ──────────────────────────────────────────────────────────────

export function CountdownWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const nav = useNavigate()
  const target = useMemo(() => {
    const opts: { date: DateKey; title: string; emoji: string; go: () => void }[] = []
    for (const t of upcomingTrips(db, today)) if (t.startDate && t.startDate > today) opts.push({ date: t.startDate, title: t.name, emoji: t.flag, go: () => nav(ROUTES.trip(t.id)) })
    for (const g of db.workoutGoals)
      if (g.kind === 'event' && g.status === 'ativa' && g.deadline && g.deadline > today) opts.push({ date: g.deadline, title: g.title, emoji: '🏁', go: () => openSheet('workoutGoal', { id: g.id }) })
    for (const e of db.events)
      if (e.allDay && e.date > today && diffDays(today, e.date) <= 120) opts.push({ date: e.date, title: e.title, emoji: '📅', go: () => openSheet('event', { id: e.id }) })
    return opts.sort((a, b) => a.date.localeCompare(b.date))[0]
  }, [db, today, nav])
  if (!target) return null
  const days = diffDays(today, target.date)
  return (
    <section id="w-countdown" className="card p-4 scroll-mt-4">
      <button type="button" onClick={target.go} className="w-full flex items-center gap-4 text-left">
        <span className="text-center w-[72px] shrink-0">
          <span className="block font-display text-[40px] leading-none tabular-nums">{days}</span>
          <span className="block text-[11px] uppercase tracking-[0.14em] text-muted mt-1">{days === 1 ? 'dia' : 'dias'}</span>
        </span>
        <span className="flex-1 min-w-0 border-l border-line pl-4">
          <span className="eyebrow block">Contagem</span>
          <span className="block font-display text-[18px] leading-snug mt-0.5">
            {target.emoji} {target.title}
          </span>
          <span className="block text-[12.5px] text-muted">{formatShortDate(target.date)}</span>
        </span>
      </button>
    </section>
  )
}

// ─── Fechamento ─────────────────────────────────────────────────────────────

export function ClosingWidget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const checkin = checkinFor(db, today)

  if (checkin?.closing) {
    const mood = MOODS.find((m) => m.value === checkin.closing!.mood)
    return (
      <section id="w-fechamento" className="card scroll-mt-4 px-4 py-3.5">
        <button type="button" onClick={() => openSheet('dailyClosing', { date: today })} className="w-full flex items-center gap-3 text-left min-h-[44px]">
          <span className="h-10 w-10 rounded-full bg-plum-soft flex items-center justify-center text-[19px]" aria-hidden>
            {mood?.emoji ?? '🌙'}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display text-[18px] leading-tight">Dia encerrado 🌙</span>
            <span className="block text-[12.5px] text-muted truncate">{checkin.closing.winText ? `✨ ${checkin.closing.winText}` : 'Descansa. Amanhã tem mais.'}</span>
          </span>
        </button>
      </section>
    )
  }

  return (
    <section id="w-fechamento" className="scroll-mt-4 rounded-[var(--radius-card)] bg-plum-soft p-5">
      <div className="eyebrow">Fechamento</div>
      <div className="font-display text-[23px] leading-tight mt-1">Como foi hoje? 🌙</div>
      <p className="text-[14px] text-ink-2 mt-1">Dois minutos pra fechar o dia com leveza.</p>
      <button type="button" onClick={() => openSheet('dailyClosing', { date: today })} className="mt-4 h-11 px-5 rounded-full bg-ink text-bg text-[14.5px] font-semibold active:scale-[0.98] transition">
        Encerrar o dia
      </button>
    </section>
  )
}
