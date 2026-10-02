import { useMemo, useState } from 'react'
import { ExternalLink, MapPin, Repeat } from 'lucide-react'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { removeWithUndo } from '@/app/undo'
import {
  Button,
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
import type { CalendarEvent, DateKey, Recurrence, TimeHM } from '@/data/types'
import { formatLongDate, hmToMinutes, minutesOfDay, minutesToHM, todayKey } from '@/lib/date'
import { describeRecurrence } from '@/lib/recurrence'
import { haptic } from '@/lib/haptics'
import { EVENT_KINDS, kindMeta, LOCAL_SOURCE_ID, rangeLabel, type EventKind } from './selectors'
import { takePrefillTime } from './prefill'
import { Toggle } from './ui'

const addMin = (hm: TimeHM, n: number) => minutesToHM(Math.min(23 * 60 + 59, hmToMinutes(hm) + n))

function defaultStart(date: DateKey): TimeHM {
  const prefill = takePrefillTime()
  if (prefill) return prefill
  if (date === todayKey()) {
    const next = Math.ceil((minutesOfDay() + 1) / 60) * 60
    if (next <= 22 * 60) return minutesToHM(next)
  }
  return '09:00'
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

export default function EventSheet({ id, date }: SheetProps<'event'>) {
  const existing = useDB((db) => (id ? db.events.find((e) => e.id === id) : undefined))
  if (id && !existing)
    return (
      <SheetLayout title="Compromisso" onClose={closeSheet}>
        <EmptyState emoji="🌿" title="Esse compromisso não existe mais" compact />
      </SheetLayout>
    )
  if (existing?.external) return <ExternalEvent event={existing} />
  return <EventForm key={existing?.id ?? 'new'} existing={existing} date={date} />
}

function EventForm({ existing, date }: { existing?: CalendarEvent; date?: DateKey }) {
  const projects = useDB((db) => db.projects)
  const trips = useDB((db) => db.trips)
  const [initialStart] = useState(() => existing?.startTime ?? defaultStart(existing?.date ?? date ?? todayKey()))

  const [title, setTitle] = useState(existing?.title ?? '')
  const [day, setDay] = useState<DateKey>(existing?.date ?? date ?? todayKey())
  const [allDay, setAllDay] = useState(existing?.allDay ?? false)
  const [start, setStart] = useState<TimeHM>(initialStart)
  const [end, setEnd] = useState<TimeHM | undefined>(existing ? existing.endTime : addMin(initialStart, 60))
  const [endDate, setEndDate] = useState<DateKey | undefined>(existing?.endDate)
  const [location, setLocation] = useState(existing?.location ?? '')
  const [kind, setKind] = useState<EventKind | undefined>(existing?.kind)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(existing?.recurrence)
  const [projectId, setProjectId] = useState(existing?.projectId)
  const [tripId, setTripId] = useState(existing?.tripId)

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
    const validEnd = !allDay && end && hmToMinutes(end) > hmToMinutes(start) ? end : undefined
    const payload = {
      sourceId: existing?.sourceId ?? LOCAL_SOURCE_ID,
      title: t,
      date: day,
      allDay,
      startTime: allDay ? undefined : start,
      endTime: validEnd,
      endDate: endDate && endDate > day && !recurrence ? endDate : undefined,
      location: location.trim() || undefined,
      kind,
      notes: notes.trim() || undefined,
      url: url.trim() || undefined,
      recurrence,
      projectId,
      tripId,
    }
    if (existing) {
      actions.update('events', existing.id, payload)
      toast('Compromisso atualizado')
    } else {
      actions.create('events', payload)
      haptic('success')
      toast(`Anotado 📅 ${allDay ? formatLongDate(day) : `${formatLongDate(day)}, ${start}`}`)
    }
    closeSheet()
  }

  return (
    <SheetLayout
      eyebrow={existing ? 'compromisso' : 'novo compromisso'}
      title={existing ? 'Editar' : undefined}
      onClose={closeSheet}
      onDelete={
        existing
          ? () => {
              removeWithUndo('events', existing.id, 'Compromisso apagado')
              closeSheet()
            }
          : undefined
      }
      primary={{ label: existing ? 'Salvar' : 'Adicionar', onClick: save, disabled: !title.trim() }}
    >
      <TitleInput
        autoFocus={!existing}
        placeholder="Qual o compromisso?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        aria-label="Título"
      />

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <Field label="Data">
          <DateInput value={day} onChange={(v) => v && setDay(v)} />
        </Field>
        <div className="flex flex-col items-center pb-1.5">
          <span className="text-[13px] font-medium text-ink-2 mb-1">dia inteiro</span>
          <Toggle checked={allDay} onChange={setAllDay} label="Dia inteiro" />
        </div>
      </div>

      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <TimeInput value={start} onChange={changeStart} />
          </Field>
          <Field label="Fim">
            <TimeInput value={end} onChange={setEnd} />
          </Field>
        </div>
      )}

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
        {!recurrence && (
          <Field label="Termina em" hint="pra viagens, eventos de vários dias">
            <DateInput value={endDate} min={day} onChange={setEndDate} />
          </Field>
        )}
        <Field label="Repetir">
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        </Field>
        <Field label="Notas">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="pauta, o que levar…" />
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
