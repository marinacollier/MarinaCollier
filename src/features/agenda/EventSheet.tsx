import { useMemo, useState } from 'react'
import { CalendarX2, ExternalLink, MapPin, MoveRight, Repeat } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import {
  Button,
  Checkbox,
  ChipSelect,
  DateInput,
  EmptyState,
  Field,
  MoreOptions,
  Pill,
  RecurrencePicker,
  Select,
  SheetLayout,
  TextArea,
  TextInput,
  TimeInput,
  TitleInput,
} from '@/components/ui'
import { actions, getDB, useDB } from '@/data/store'
import { eventOccursOn, PERIOD_LABEL } from '@/data/planning'
import type { CalendarEvent, DateKey, DayPeriod, PlanType, Recurrence, TimeHM } from '@/data/types'
import { formatLongDate, hmToMinutes, minutesOfDay, minutesToHM, todayKey } from '@/lib/date'
import { describeRecurrence } from '@/lib/recurrence'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { EVENT_KINDS, kindMeta, LOCAL_SOURCE_ID, PLAN_LABEL, rangeLabel, type EventKind } from './selectors'
import { cancelOccurrence, moveOccurrence, nextOccurrenceOf } from './occurrence'
import { Toggle } from './ui'

const addMin = (hm: TimeHM, n: number) => minutesToHM(Math.min(23 * 60 + 59, hmToMinutes(hm) + n))

const PERIODS: DayPeriod[] = ['manha', 'almoco', 'tarde', 'noite']
const PLAN_TYPES: PlanType[] = ['fixo', 'base', 'flexivel', 'a_confirmar']

function defaultStart(date: DateKey, time?: TimeHM): TimeHM {
  if (time) return time
  if (date === todayKey()) {
    const next = Math.ceil((minutesOfDay() + 1) / 60) * 60
    if (next <= 22 * 60) return minutesToHM(next)
  }
  return '09:00'
}

function periodOfTime(hm: TimeHM): DayPeriod {
  const m = hmToMinutes(hm)
  return m >= 18 * 60 ? 'noite' : m >= 14 * 60 ? 'tarde' : m >= 12 * 60 ? 'almoco' : 'manha'
}

/** Make sure the local "MARINA OS" calendar exists before saving into it. */
function ensureLocalSource() {
  if (getDB().calendarSources.some((s) => s.id === LOCAL_SOURCE_ID)) return
  actions.create('calendarSources', {
    id: LOCAL_SOURCE_ID,
    provider: 'local',
    name: 'MARINA OS',
    color: 'var(--accent)',
    syncDirection: 'none',
    enabled: true,
  })
}

export default function EventSheet({ id, date, time, defaults }: SheetProps<'event'>) {
  const existing = useDB((db) => (id ? db.events.find((e) => e.id === id) : undefined))
  if (id && !existing)
    return (
      <SheetLayout title="Compromisso" onClose={closeSheet}>
        <EmptyState emoji="🌿" title="Esse compromisso não existe mais" compact />
      </SheetLayout>
    )
  if (existing?.external) return <ExternalEvent event={existing} />
  return <EventForm key={existing?.id ?? 'new'} existing={existing} date={date} time={time} defaults={defaults} />
}

interface EventFormProps {
  existing?: CalendarEvent
  date?: DateKey
  time?: TimeHM
  defaults?: Partial<CalendarEvent>
}

function EventForm({ existing, date, time, defaults }: EventFormProps) {
  const projects = useDB((db) => db.projects)
  const trips = useDB((db) => db.trips)
  const init: Partial<CalendarEvent> = existing ?? defaults ?? {}
  const firstDay = existing?.date ?? date ?? defaults?.date ?? todayKey()
  const [initialStart] = useState(() => existing?.startTime ?? defaults?.startTime ?? defaultStart(firstDay, time))

  const [title, setTitle] = useState(init.title ?? '')
  const [day, setDay] = useState<DateKey>(firstDay)
  const [allDay, setAllDay] = useState(init.allDay ?? false)
  const [start, setStart] = useState<TimeHM>(initialStart)
  const [end, setEnd] = useState<TimeHM | undefined>(existing ? existing.endTime : (defaults?.endTime ?? addMin(initialStart, 60)))
  // "Sem horário exato": an approximate part of the day instead of a time.
  const [period, setPeriod] = useState<DayPeriod | undefined>(init.startTime || (!existing && time) ? undefined : init.period)
  const [endDate, setEndDate] = useState<DateKey | undefined>(init.endDate)
  const [location, setLocation] = useState(init.location ?? '')
  const [kind, setKind] = useState<EventKind | undefined>(init.kind)
  const [planType, setPlanType] = useState<PlanType | undefined>(init.planType)
  const [notes, setNotes] = useState(init.notes ?? '')
  const [template, setTemplate] = useState((init.template ?? []).join('\n'))
  const [url, setUrl] = useState(init.url ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(init.recurrence)
  const [projectId, setProjectId] = useState(init.projectId)
  const [tripId, setTripId] = useState(init.tripId)

  // The day this sheet was opened for (one occurrence of a recurring event).
  const occurrence = useMemo(() => {
    if (!existing?.recurrence) return undefined
    if (date && eventOccursOn(existing, date)) return date
    return nextOccurrenceOf(existing, todayKey())
  }, [existing, date])

  const projectOptions = useMemo(
    () => projects.filter((p) => p.status !== 'concluido' || p.id === projectId).map((p) => ({ value: p.id, label: `${p.emoji} ${p.name}` })),
    [projects, projectId],
  )
  const tripOptions = useMemo(
    () => trips.filter((t) => t.status !== 'concluida' || t.id === tripId).map((t) => ({ value: t.id, label: `${t.flag} ${t.name}` })),
    [trips, tripId],
  )

  const changeStart = (v: TimeHM | undefined) => {
    if (!v) return
    // Keep the duration when moving the start.
    const dur = end ? hmToMinutes(end) - hmToMinutes(start) : 60
    setStart(v)
    setEnd(addMin(v, dur > 0 ? dur : 60))
  }

  const save = () => {
    const t = title.trim()
    if (!t) return
    ensureLocalSource()
    const approx = !allDay && !!period
    const validEnd = !allDay && !approx && end && hmToMinutes(end) > hmToMinutes(start) ? end : undefined
    const steps = template
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const payload = {
      sourceId: existing?.sourceId ?? LOCAL_SOURCE_ID,
      title: t,
      date: day,
      allDay,
      startTime: allDay || approx ? undefined : start,
      endTime: validEnd,
      period: approx ? period : undefined,
      endDate: endDate && endDate > day && !recurrence ? endDate : undefined,
      location: location.trim() || undefined,
      kind,
      planType,
      category: init.category,
      notes: notes.trim() || undefined,
      template: steps.length ? steps : undefined,
      url: url.trim() || undefined,
      recurrence,
      exdates: recurrence ? existing?.exdates : undefined,
      projectId,
      tripId,
    }
    if (existing) {
      actions.update('events', existing.id, payload)
      toast(existing.recurrence ? 'Série atualizada' : 'Compromisso atualizado')
    } else {
      actions.create('events', payload)
      haptic('success')
      toast(`Anotado 📅 ${allDay ? formatLongDate(day) : `${formatLongDate(day)}, ${approx ? PERIOD_LABEL[period!] : start}`}`)
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={existing ? (existing.category ?? 'compromisso') : 'novo compromisso'}
      title={existing ? (existing.recurrence ? existing.title : 'Editar') : undefined}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              removeWithUndo('events', existing.id, existing.recurrence ? 'Série apagada' : 'Compromisso apagado')
              closeSheet()
            }
          : undefined
      }
      primary={{ label: existing ? (existing.recurrence ? 'Salvar série' : 'Salvar') : 'Adicionar', onClick: save, disabled: !title.trim() }}
    >
      {existing?.recurrence && occurrence && <OccurrenceCard event={existing} date={occurrence} />}

      {!!existing?.template?.length && <Pauta key={occurrence ?? existing.date} items={existing.template} />}

      {existing?.recurrence && <div className="eyebrow pt-1 px-0.5">editar a série</div>}

      <TitleInput
        autoFocus={!existing}
        placeholder="Qual o compromisso?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="Título"
      />

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field label={recurrence ? 'Começa em' : 'Data'}>
          <DateInput value={day} onChange={(v) => v && setDay(v)} />
        </Field>
        <div className="flex flex-col items-center pb-1.5">
          <span className="text-[13px] font-medium text-ink-2 mb-1">dia inteiro</span>
          <Toggle checked={allDay} onChange={setAllDay} label="Dia inteiro" />
        </div>
      </div>

      {!allDay &&
        (period ? (
          <Field label="Quando" hint="sem horário exato — dá pra definir depois">
            <div className="flex flex-wrap items-center gap-2">
              <ChipSelect value={period} onChange={(v) => v && setPeriod(v)} options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} />
              <Button size="sm" variant="ghost" onClick={() => setPeriod(undefined)}>
                definir horário
              </Button>
            </div>
          </Field>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Início">
                <TimeInput value={start} onChange={changeStart} />
              </Field>
              <Field label="Fim">
                <TimeInput value={end} onChange={setEnd} />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => setPeriod(periodOfTime(start))}
              className="min-h-11 px-0.5 text-[13px] text-muted underline decoration-dotted underline-offset-4"
            >
              sem horário exato
            </button>
          </div>
        ))}

      <MoreOptions>
        <Field label="Local">
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="onde vai ser?" />
        </Field>
        <Field label="Tipo">
          <ChipSelect
            value={kind}
            onChange={setKind}
            clearable
            options={EVENT_KINDS.map((k) => ({ value: k.value, label: `${k.emoji} ${k.label}` }))}
          />
        </Field>
        <Field label="Combinado" hint="fixo fica · base é o padrão de agora · flexível pode mudar de lugar">
          <ChipSelect value={planType} onChange={setPlanType} clearable options={PLAN_TYPES.map((p) => ({ value: p, label: PLAN_LABEL[p].toLowerCase() }))} />
        </Field>
        {!recurrence && (
          <Field label="Termina em" hint="pra viagens, eventos de vários dias">
            <DateInput value={endDate} min={day} onChange={setEndDate} />
          </Field>
        )}
        <Field label="Repetir">
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        </Field>
        <Field label="Pauta" hint="um item por linha — vira checklist no compromisso">
          <TextArea value={template} onChange={(e) => setTemplate(e.target.value)} placeholder={'wins da semana\no que travou\npróximos movimentos'} />
        </Field>
        <Field label="Notas">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="o que levar, contexto…" />
        </Field>
        <Field label="Link">
          <TextInput type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… (reunião, ingresso)" />
        </Field>
        {projectOptions.length > 0 && (
          <Field label="Projeto">
            <Select value={projectId} onChange={setProjectId} options={projectOptions} placeholder="nenhum" />
          </Field>
        )}
        {tripOptions.length > 0 && (
          <Field label="Viagem">
            <Select value={tripId} onChange={setTripId} options={tripOptions} placeholder="nenhuma" />
          </Field>
        )}
      </MoreOptions>
    </SheetLayout>
  )
}

/** "Só nesse dia": cancel or move one occurrence of a recurring event; the series stays as it is. */
function OccurrenceCard({ event, date }: { event: CalendarEvent; date: DateKey }) {
  const [moving, setMoving] = useState(false)
  const [to, setTo] = useState<DateKey>(date)
  const [at, setAt] = useState<TimeHM | undefined>(event.startTime)
  const when = event.startTime ?? (event.period ? PERIOD_LABEL[event.period] : 'dia todo')
  const move = () => {
    const dur = event.startTime && event.endTime ? hmToMinutes(event.endTime) - hmToMinutes(event.startTime) : 0
    moveOccurrence(event.id, date, { date: to, startTime: at, endTime: at && dur > 0 ? addMin(at, dur) : undefined }, LOCAL_SOURCE_ID)
    closeSheet()
  }
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5 space-y-3">
      <div className="flex items-start gap-2.5">
        <Repeat size={16} className="text-muted mt-0.5 shrink-0" />
        <div className="min-w-0 text-[14px] leading-snug">
          <div className="first-letter:uppercase font-medium">
            {formatLongDate(date)} · {when}
          </div>
          <div className="text-[12.5px] text-muted">{describeRecurrence(event.recurrence!)} · mudar só esse dia não mexe na série</div>
        </div>
      </div>
      {moving ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Novo dia">
              <DateInput value={to} onChange={(v) => v && setTo(v)} />
            </Field>
            <Field label={event.startTime ? 'Horário' : 'Horário (se souber)'}>
              <TimeInput value={at} onChange={setAt} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<MoveRight size={15} />} disabled={to === date && at === event.startTime} onClick={move}>
              Mover só esse dia
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMoving(false)}>
              voltar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<CalendarX2 size={15} />}
            onClick={() => {
              cancelOccurrence(event.id, date)
              closeSheet()
            }}
          >
            Cancelar só nesse dia
          </Button>
          <Button size="sm" variant="outline" icon={<MoveRight size={15} />} onClick={() => setMoving(true)}>
            Mover só esse dia
          </Button>
        </div>
      )}
    </div>
  )
}

/** Event template as a light checklist (checks are just for this sitting). */
function Pauta({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<number>>(() => new Set())
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  return (
    <section className="rounded-2xl border border-line/80 bg-surface px-3.5 py-2">
      <div className="flex items-center justify-between pt-1 pb-1">
        <span className="eyebrow">📋 pauta</span>
        <span className="text-[12px] text-muted tabular-nums">
          {done.size}/{items.length}
        </span>
      </div>
      <ul>
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3 min-h-11 pl-2.5">
            <Checkbox size="sm" checked={done.has(i)} onChange={() => toggle(i)} label={it} />
            <button type="button" onClick={() => toggle(i)} className={cn('flex-1 text-left text-[14.5px] leading-snug py-2', done.has(i) && 'line-through text-muted')}>
              {it}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Mirrored from Google/Outlook/ICS: read-only here, edit at the origin. */
function ExternalEvent({ event }: { event: CalendarEvent }) {
  const source = useDB((db) => db.calendarSources.find((s) => s.id === event.sourceId))
  const meta = kindMeta(event.kind)
  const when = event.allDay
    ? event.endDate && event.endDate > event.date
      ? rangeLabel(event.date, event.endDate)
      : `${formatLongDate(event.date)} · dia todo`
    : `${formatLongDate(event.date)} · ${event.startTime ?? ''}${event.endTime ? `–${event.endTime}` : ''}`
  return (
    <SheetLayout eyebrow={source?.name ?? 'calendário externo'} title={event.title} onClose={closeSheet}>
      <div className="space-y-2.5 text-[15px]">
        <div className="flex items-center gap-2">
          <span>{meta.emoji}</span>
          <span className="first-letter:uppercase">{when}</span>
        </div>
        {event.location && (
          <div className="flex items-center gap-2 text-ink-2">
            <MapPin size={16} className="text-muted" /> {event.location}
          </div>
        )}
        {event.recurrence && (
          <div className="flex items-center gap-2 text-ink-2">
            <Repeat size={16} className="text-muted" /> {describeRecurrence(event.recurrence)}
          </div>
        )}
        {event.notes && <p className="text-ink-2 whitespace-pre-line text-[14px] leading-relaxed">{event.notes}</p>}
      </div>
      <Pill>editável na origem</Pill>
      {event.external?.webUrl && (
        <Button
          variant="outline"
          block
          icon={<ExternalLink size={16} />}
          onClick={() => window.open(event.external!.webUrl, '_blank', 'noopener')}
        >
          Abrir no calendário de origem
        </Button>
      )}
      {event.url && (
        <Button variant="ghost" block onClick={() => window.open(event.url, '_blank', 'noopener')}>
          Abrir link do evento
        </Button>
      )}
    </SheetLayout>
  )
}
