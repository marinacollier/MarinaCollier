/**
 * Minha semana (route /minha-semana) — a calm read of the week: 7 days with what is really on them (and the
 * free gaps), work capacity per project (planejado × agendado × feito), what may not fit, next commitments and
 * habits. Everything comes from `useCalendar` + `capacity.ts`; nothing here writes. Suggestions are text only.
 */
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { Button, Card, IconButton, Page, PageHeader, SectionTitle, tone } from '@/components/ui'
import { useDB } from '@/data/store'
import { CATEGORY_META, type CalendarEntry } from '@/data/calendar/universal'
import { checkinFor } from '@/data/selectors'
import { useNow } from '@/hooks/useToday'
import { addDays, formatShortDate, hmToMinutes, isDateKey, minutesToHM, relativeDay, startOfWeek, WEEKDAY_SHORT, weekday } from '@/lib/date'
import { cn } from '@/lib/cn'
import { useCalendar } from '@/features/agenda/calendar/model'
import { rangeLabel } from '@/features/agenda/selectors'
import { HABIT_ROWS } from '@/features/body/constants'
import { habitDone } from '@/features/body/selectors'
import { entryWindow, hoursLabel, weekCapacity, weekFeasibility, type DayFeasibility, type ProjectCapacity, type WeekCapacity } from './capacity'

const FLAG_COPY: Record<WeekCapacity['flag'], { label: string; cls: string }> = {
  sobrecarga: { label: 'sobrecarga', cls: 'bg-accent-soft text-accent' },
  apertado: { label: 'apertado', cls: 'bg-sand-soft text-ink-2' },
  ok: { label: 'cabe', cls: 'bg-sage-soft text-ink-2' },
}

export default function WeekPage() {
  const db = useDB()
  const { today, minutes } = useNow()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const dParam = params.get('d')
  const weekStart = startOfWeek(isDateKey(dParam) ? dParam : today)
  const weekEnd = addDays(weekStart, 6)
  const selParam = params.get('dia')
  const selected = isDateKey(selParam) && selParam >= weekStart && selParam <= weekEnd ? selParam : today >= weekStart && today <= weekEnd ? today : weekStart

  const { entries } = useCalendar(weekStart, weekEnd, today)
  const cap = useMemo(() => weekCapacity(db, entries, weekStart, today), [db, entries, weekStart, today])
  const feas = useMemo(() => weekFeasibility(db, entries, weekStart, today), [db, entries, weekStart, today])

  const set = (patch: { d?: string; dia?: string }) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v)
    if (patch.d) next.delete('dia')
    setParams(next, { replace: true })
  }

  const next = useMemo(
    () =>
      entries
        .filter((e) => !e.allDay && !!e.startAt.time && !e.base && e.status !== 'cancelado' && e.status !== 'feito')
        .filter((e) => e.startAt.date > today || (e.startAt.date === today && hmToMinutes(e.startAt.time!) >= minutes))
        .sort((a, b) => a.startAt.date.localeCompare(b.startAt.date) || a.startAt.time!.localeCompare(b.startAt.time!))
        .slice(0, 5),
    [entries, today, minutes],
  )

  const day = feas.days.find((d) => d.date === selected)!
  const alerts = alertLines(cap, feas.days)

  return (
    <Page>
      <PageHeader
        back
        backTo={ROUTES.agenda}
        eyebrow={rangeLabel(weekStart, weekEnd)}
        title="Minha semana"
        subtitle={summaryLine(cap)}
        search={false}
        actions={
          <>
            <IconButton label="Semana anterior" onClick={() => set({ d: addDays(weekStart, -7) })}>
              <ChevronLeft size={20} />
            </IconButton>
            <IconButton label="Próxima semana" onClick={() => set({ d: addDays(weekStart, 7) })}>
              <ChevronRight size={20} />
            </IconButton>
          </>
        }
      />

      <DayStrip days={feas.days} selected={selected} today={today} onSelect={(d) => set({ dia: d })} />
      <DayTimeline day={day} entries={entries} />

      {(alerts.length > 0 || feas.suggestions.length > 0) && (
        <>
          <SectionTitle label="Pontos de atenção">O que pode não caber</SectionTitle>
          <Card className="space-y-3" aria-label="Pontos de atenção da semana">
            {alerts.length > 0 && (
              <ul className="space-y-1.5 text-[14px]">
                {alerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {feas.suggestions.length > 0 && (
              <div>
                <div className="eyebrow mb-1">Sugestões · nada muda sozinho</div>
                <ul className="space-y-1 text-[13.5px] text-ink-2">
                  {feas.suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </>
      )}

      <SectionTitle label="Trabalho" action={<span className={cn('h-7 px-2.5 rounded-full text-[12.5px] inline-flex items-center', FLAG_COPY[cap.flag].cls)}>{FLAG_COPY[cap.flag].label}</span>}>
        Capacidade
      </SectionTitle>
      <Card className="space-y-1" aria-label="Capacidade de trabalho">
        <div className="text-[14px]">
          {hoursLabel(cap.loadMin)} de {hoursLabel(cap.availableMin)} no horário de trabalho · {cap.pct > 900 ? 'sem horário de trabalho' : `${cap.pct}%`}
        </div>
        <div className="text-[13px] text-muted">
          {cap.freeMin > 0 ? `${hoursLabel(cap.freeMin)} flexíveis para reuniões e suporte.` : 'Sem folga para reuniões e suporte.'} {cap.workDays.length} dia{cap.workDays.length === 1 ? '' : 's'} de trabalho.
        </div>
      </Card>
      {cap.projects.length ? (
        <div className="mt-3 space-y-3">
          {cap.projects.map((p) => (
            <ProjectCard key={p.project.id} cap={p} today={today} />
          ))}
        </div>
      ) : (
        <p className="mt-3 px-1 text-[13.5px] text-muted">Nenhum projeto ativo com horas por semana. Dá pra definir em cada projeto → editar → “Horas por semana”.</p>
      )}

      {next.length > 0 && (
        <>
          <SectionTitle label="Agenda">Próximos compromissos</SectionTitle>
          <Card padded={false} className="divide-y divide-line" aria-label="Próximos compromissos">
            {next.map((e) => (
              <EntryLine key={e.id} e={e} prefix={`${relativeDay(e.startAt.date, today)} ${e.startAt.time}`} />
            ))}
          </Card>
        </>
      )}

      <Habits weekStart={weekStart} today={today} />

      <div className="mt-8 flex justify-center">
        <Button variant="soft" size="sm" icon={<CalendarRange size={16} />} onClick={() => nav(ROUTES.weekPlanner)}>
          Montar minha semana
        </Button>
      </div>
    </Page>
  )
}

function summaryLine(cap: WeekCapacity): string {
  if (!cap.projects.length) return 'Seus dias, o que está marcado e o que fica livre.'
  return `${hoursLabel(cap.plannedMin)} planejadas · ${hoursLabel(cap.scheduledMin)} na agenda · ${hoursLabel(cap.doneMin)} feitas`
}

function alertLines(cap: WeekCapacity, days: DayFeasibility[]): string[] {
  const out: string[] = []
  if (cap.flag === 'sobrecarga') out.push(`Trabalho em sobrecarga: ${hoursLabel(cap.loadMin)} para ${hoursLabel(cap.availableMin)} disponíveis.`)
  else if (cap.flag === 'apertado') out.push(`Trabalho apertado: ${cap.pct}% do horário já comprometido.`)
  for (const p of cap.projects) {
    if (p.overLimit) out.push(`${p.project.name}: passa de ${hoursLabel(p.overLimit.limitMin)}/dia em ${p.overLimit.days.map((d) => WEEKDAY_SHORT[weekday(d)].toLowerCase()).join(', ')}.`)
  }
  for (const d of days) {
    for (const o of d.overlaps) out.push(`${WEEKDAY_SHORT[weekday(d.date)]}: "${o.a.title}" e "${o.b.title}" no mesmo horário.`)
  }
  for (const d of days) if (d.tight) out.push(`${WEEKDAY_SHORT[weekday(d.date)]}: menos de 1 h livre (${hoursLabel(d.freeMin)}).`)
  return out
}

function DayStrip({ days, selected, today, onSelect }: { days: DayFeasibility[]; selected: string; today: string; onSelect: (d: string) => void }) {
  return (
    <div role="tablist" aria-label="Dias da semana" className="grid grid-cols-7 gap-1">
      {days.map((d) => {
        const busy = d.awakeMin ? Math.min(1, d.busyMin / d.awakeMin) : 0
        const warn = d.overlaps.length > 0 || d.tight
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={d.date === selected}
            aria-label={`${WEEKDAY_SHORT[weekday(d.date)]} ${formatShortDate(d.date)}${warn ? ' · atenção' : ''}`}
            onClick={() => onSelect(d.date)}
            className={cn('rounded-2xl py-2 flex flex-col items-center gap-1 transition', d.date === selected ? 'bg-surface ring-1 ring-line shadow-sm' : 'active:bg-surface-2')}
          >
            <span className={cn('text-[10.5px] tracking-wide', d.date === today ? 'text-accent' : 'text-muted')}>{WEEKDAY_SHORT[weekday(d.date)]}</span>
            <span className="text-[16px] leading-none tabular-nums">{Number(d.date.slice(8))}</span>
            <span aria-hidden className="h-1 w-6 rounded-full bg-surface-2 overflow-hidden">
              <span className="block h-full rounded-full bg-ink-2/60" style={{ width: `${Math.round(busy * 100)}%` }} />
            </span>
            <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', warn ? 'bg-accent' : 'bg-transparent')} />
          </button>
        )
      })}
    </div>
  )
}

type Row = { kind: 'entry'; e: CalendarEntry; start: number } | { kind: 'free'; start: number; end: number }

function DayTimeline({ day, entries }: { day: DayFeasibility; entries: CalendarEntry[] }) {
  const allDay = entries.filter((e) => e.startAt.date <= day.date && e.endAt.date >= day.date && (e.allDay || !e.startAt.time || e.startAt.date !== e.endAt.date) && e.status !== 'cancelado')
  const rows: Row[] = [
    ...entries.filter((e) => e.startAt.date === day.date && e.endAt.date === day.date && !e.allDay && !!e.startAt.time && e.status !== 'cancelado').map<Row>((e) => ({ kind: 'entry', e, start: entryWindow(e).start })),
    ...day.gaps.filter((g) => g.end - g.start >= 60).map<Row>((g) => ({ kind: 'free', start: g.start, end: g.end })),
  ].sort((a, b) => a.start - b.start || (a.kind === 'free' ? 1 : -1))

  return (
    <section aria-label={`Dia ${day.date}`} className="mt-3">
      <div className="px-1 mb-2 text-[13px] text-muted">
        {hoursLabel(day.busyMin)} comprometidas · {hoursLabel(day.freeMin)} livres entre {minutesToHM(day.awake.start)} e {minutesToHM(day.awake.end % (24 * 60))}
      </div>
      {allDay.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {allDay.map((e) => (
            <span key={e.id} className="h-7 px-2.5 rounded-full text-[12.5px] inline-flex items-center gap-1.5 max-w-full" style={{ background: CATEGORY_META[e.category].soft }}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: CATEGORY_META[e.category].color }} />
              <span className="truncate">{e.title}</span>
            </span>
          ))}
        </div>
      )}
      <Card padded={false} className="divide-y divide-line">
        {rows.length ? (
          rows.map((r) =>
            r.kind === 'entry' ? (
              <EntryLine key={r.e.id} e={r.e} prefix={`${r.e.startAt.time}${r.e.endAt.time ? `–${r.e.endAt.time}` : ''}`} />
            ) : (
              <div key={`free:${r.start}`} className="px-4 py-2 text-[13px] text-muted flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sage" />
                livre {minutesToHM(r.start)}–{minutesToHM(r.end % (24 * 60))} · {hoursLabel(r.end - r.start)}
              </div>
            ),
          )
        ) : (
          <div className="px-4 py-3 text-[13.5px] text-muted">Nada com horário. Dia livre.</div>
        )}
      </Card>
    </section>
  )
}

function EntryLine({ e, prefix }: { e: CalendarEntry; prefix: string }) {
  const meta = CATEGORY_META[e.category]
  return (
    <div className={cn('px-4 py-2.5 flex items-center gap-3 text-[14px]', e.base && 'text-muted', e.status === 'feito' && 'opacity-60')}>
      <span aria-hidden className="w-1 self-stretch rounded-full shrink-0" style={{ background: meta.color }} />
      <span className="tabular-nums text-[12.5px] text-muted shrink-0 min-w-[78px]">{prefix}</span>
      <span className="min-w-0 truncate">{e.title}</span>
      {e.status === 'feito' && <span className="ml-auto text-[12px] text-muted shrink-0">feito</span>}
    </div>
  )
}

function ProjectCard({ cap, today }: { cap: ProjectCapacity; today: string }) {
  const { project: p, plannedMin, scheduledMin, doneMin } = cap
  const max = Math.max(plannedMin, scheduledMin, 1)
  const over = scheduledMin > plannedMin
  return (
    <Card aria-label={`Capacidade ${p.name}`}>
      <Link to={ROUTES.project(p.id)} className="flex items-center gap-2 min-w-0">
        <span aria-hidden className="text-[18px]">{p.emoji}</span>
        <span className="font-medium truncate">{p.name}</span>
        <span className="ml-auto text-[12.5px] text-muted shrink-0">{hoursLabel(plannedMin)}/sem</span>
      </Link>
      <div className="mt-2.5 relative h-2 rounded-full bg-surface-2 overflow-hidden" role="img" aria-label={`agendado ${hoursLabel(scheduledMin)}, feito ${hoursLabel(doneMin)} de ${hoursLabel(plannedMin)} planejadas`}>
        <span className={cn('absolute inset-y-0 left-0 rounded-full opacity-35', tone(p.tone).dot)} style={{ width: `${(Math.min(scheduledMin, max) / max) * 100}%` }} />
        <span className={cn('absolute inset-y-0 left-0 rounded-full', tone(p.tone).dot)} style={{ width: `${(Math.min(doneMin, max) / max) * 100}%` }} />
        {over && <span className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${(plannedMin / max) * 100}%` }} />}
      </div>
      <div className="mt-1.5 text-[12.5px] text-muted">
        planejado {hoursLabel(plannedMin)} · agendado {hoursLabel(scheduledMin)} · feito {hoursLabel(doneMin)}
        {over ? ' · acima do planejado' : ''}
      </div>
      {(cap.priorities.length > 0 || cap.meetings.length > 0 || cap.waiting.length > 0) && (
        <ul className="mt-2.5 space-y-1 text-[13.5px]">
          {cap.priorities.map((i) => (
            <li key={i.id} className="flex gap-2">
              <span className="text-muted shrink-0">{i.kind === 'tarefa' ? '•' : '◆'}</span>
              <span className="min-w-0 truncate">{i.title}</span>
              {i.date && <span className="ml-auto text-[12px] text-muted shrink-0">{relativeDay(i.date, today)}</span>}
            </li>
          ))}
          {cap.meetings.map((m) => (
            <li key={m.id} className="flex gap-2 text-ink-2">
              <span className="text-muted shrink-0">◷</span>
              <span className="min-w-0 truncate">{m.title}</span>
              <span className="ml-auto text-[12px] text-muted shrink-0">
                {relativeDay(m.date!, today)} {m.time}
              </span>
            </li>
          ))}
          {cap.waiting.map((w) => (
            <li key={w.id} className="flex gap-2 text-muted">
              <span className="shrink-0">⏳</span>
              <span className="min-w-0 truncate">
                {w.title}
                {w.who ? ` · ${w.who}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Habits({ weekStart, today }: { weekStart: string; today: string }) {
  const db = useDB()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d <= today)
  const checkins = days.map((d) => checkinFor(db, d)).filter((c) => !!c)
  if (!checkins.length) return null
  return (
    <>
      <SectionTitle label="Corpo">Hábitos da semana</SectionTitle>
      <Card aria-label="Hábitos da semana">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13.5px]">
          {HABIT_ROWS.map((h) => {
            const n = days.filter((d) => habitDone(checkinFor(db, d), h.key, db.profile.waterGoal)).length
            return (
              <li key={h.key} className="flex items-center gap-2">
                <span aria-hidden>{h.emoji}</span>
                <span className="min-w-0 truncate">{h.label}</span>
                <span className="ml-auto tabular-nums text-muted">
                  {n}/{days.length}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}
