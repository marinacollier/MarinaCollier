/**
 * What an entry IS, first: what, when, status, next action, where it comes from, notes, links.
 * Editing is a second-level action that opens the record's own editor ("Editar") or its module.
 * No form here.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Globe, Link2, Lock, MapPin, Pencil, TriangleAlert, UserX, X } from 'lucide-react'
import { unlockSession } from '@/app/lock-store'
import { openSheet, toast } from '@/app/ui-store'
import { markAbsence, unmarkAbsence } from '@/features/travel/expedition/absence'
import { Button, IconButton } from '@/components/ui'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { CATEGORY_META, isSpan, STATUS_LABEL, tzNote, type CalendarConflict, type CalendarEntry, type CalendarSourceType } from '@/data/calendar/universal'
import { formatLongDate } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { verifyPin } from '@/lib/lock'
import { catColor, iconOf, whenLabel } from './parts'

const SOURCE_NAME: Partial<Record<CalendarSourceType, string>> = {
  event: 'evento da agenda',
  task: 'tarefa',
  tripItem: 'item da viagem',
  workout: 'treino',
  meeting: 'notas de reunião',
}

function money(cents: number, currency = 'BRL'): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

export function EntryDetail({
  entry,
  date,
  conflicts,
  device,
  onClose,
  onEdited,
}: {
  entry: CalendarEntry
  date: DateKey
  conflicts?: CalendarConflict[]
  device: string
  onClose: () => void
  /** Called before an editor opens (the phone sheet closes so the editor is on top). */
  onEdited?: () => void
}) {
  const nav = useNavigate()
  const Icon = iconOf(entry)
  const tz = tzNote(entry, device)
  const day = formatLongDate(isSpan(entry) ? entry.startAt.date : date)
  const statusText = entry.absent ? 'faltei' : entry.optional ? 'opcional' : STATUS_LABEL[entry.status]
  // A class of the trip's school: "Faltei" right here, no trip page needed.
  const isClass = entry.sourceType === 'school'
  const classDay = entry.startAt.date

  const edit = () => {
    if (!entry.open.edit) return
    haptic('light')
    onEdited?.()
    const { sheet, props } = entry.open.edit
    openSheet(sheet, props as never)
  }

  return (
    <article aria-label={`Detalhe: ${entry.title}`} className="flex flex-col min-h-0">
      <header className="flex items-start gap-3 px-5 pt-1 pb-3">
        <span className="mt-1 h-9 w-9 rounded-xl shrink-0 inline-flex items-center justify-center" style={{ background: CATEGORY_META[entry.category].soft, color: catColor(entry) }}>
          <Icon size={18} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] tracking-[0.06em] uppercase text-muted">
            {entry.sourceLabel.toLowerCase().startsWith(CATEGORY_META[entry.category].label.toLowerCase()) ? entry.sourceLabel : `${CATEGORY_META[entry.category].label} · ${entry.sourceLabel}`}
          </div>
          <h2 className={cn('font-display text-[22px] leading-tight mt-0.5 break-words', entry.status === 'feito' && 'line-through decoration-muted/50')}>{entry.title}</h2>
        </div>
        <IconButton label="Fechar detalhe" onClick={onClose} className="-mr-2 -mt-1">
          <X size={20} />
        </IconButton>
      </header>

      <div className="px-5 pb-4 space-y-4 overflow-y-auto overscroll-contain">
        <dl className="space-y-2.5 text-[14.5px]">
          <div className="flex gap-3">
            <dt className="w-[78px] shrink-0 text-muted text-[13px] pt-[1px]">Quando</dt>
            <dd className="min-w-0">
              <div>{isSpan(entry) ? whenLabel(entry) : `${day.replace(/^./, (c) => c.toUpperCase())} · ${entry.approx ? 'horário a definir' : whenLabel(entry)}`}</div>
              {tz && (
                <div className="flex items-center gap-1 text-[12.5px] text-muted mt-0.5">
                  <Globe size={12} aria-hidden /> {tz}
                </div>
              )}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-[78px] shrink-0 text-muted text-[13px] pt-[1px]">Status</dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[12.5px]', entry.status === 'pendente' ? 'border border-dashed border-sand' : 'bg-surface-2')}>{statusText}</span>
              {entry.statusLabel && entry.statusLabel.toLowerCase() !== statusText && <span className="text-[12px] text-muted tracking-[0.04em]">{entry.statusLabel}</span>}
            </dd>
          </div>
          {entry.location && !entry.masked && (
            <div className="flex gap-3">
              <dt className="w-[78px] shrink-0 text-muted text-[13px] pt-[1px]">Onde</dt>
              <dd className="flex items-start gap-1 min-w-0">
                <MapPin size={14} className="mt-[3px] shrink-0 text-muted" aria-hidden />
                <span className="break-words">{entry.location}</span>
              </dd>
            </div>
          )}
          {entry.amountCents !== undefined && (
            <div className="flex gap-3">
              <dt className="w-[78px] shrink-0 text-muted text-[13px] pt-[1px]">Valor</dt>
              <dd className="tabular-nums">{money(entry.amountCents, entry.currency)}</dd>
            </div>
          )}
        </dl>

        {entry.masked ? (
          <PrivateNote />
        ) : (
          <>
            {entry.nextAction && (
              <section className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
                <div className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Próxima ação</div>
                <div className="text-[14.5px] mt-0.5">{entry.nextAction}</div>
              </section>
            )}

            {!!conflicts?.length && (
              <section aria-label="Atenção" className="rounded-2xl border border-dashed border-sand/70 px-3.5 py-2.5 space-y-1">
                {conflicts.map((c) => (
                  <div key={c.key} className="flex items-start gap-1.5 text-[13.5px] text-ink-2">
                    <TriangleAlert size={14} className="mt-[2px] shrink-0 text-sand" aria-hidden />
                    {c.text}
                  </div>
                ))}
              </section>
            )}

            {entry.description && <p className="text-[14px] text-ink-2 whitespace-pre-line break-words">{entry.description}</p>}

            {!!entry.details?.length && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
                {entry.details.map((d) => (
                  <div key={d.label} className="contents">
                    <dt className="text-muted">{d.label}</dt>
                    <dd className="min-w-0 break-words">{/^https?:\/\//.test(d.value) ? <a className="underline underline-offset-2" href={d.value} target="_blank" rel="noreferrer">{d.value}</a> : d.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {!!entry.alsoFrom?.length && (
              <div className="flex items-start gap-1.5 text-[12.5px] text-muted">
                <Link2 size={13} className="mt-[2px] shrink-0" aria-hidden />
                <span>Mesmo compromisso também registrado como {entry.alsoFrom.map((a) => SOURCE_NAME[a.sourceType] ?? a.sourceType).join(', ')} — aparece uma vez só.</span>
              </div>
            )}
          </>
        )}
      </div>

      {(entry.open.module || (entry.open.edit && !entry.masked) || isClass) && (
        <footer className="mt-auto px-5 pt-3 border-t border-line/70 flex flex-wrap gap-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
          {isClass && (
            <Button
              variant={entry.absent ? 'outline' : 'primary'}
              size="md"
              className="w-full whitespace-nowrap px-4"
              icon={<UserX size={16} />}
              onClick={() => {
                haptic('light')
                const tripId = entry.sourceId
                if (entry.absent) {
                  unmarkAbsence(tripId, classDay)
                  onClose()
                  toast('Falta desfeita: aula de volta', { action: { label: 'Desfazer', run: () => markAbsence(tripId, classDay) } })
                  return
                }
                markAbsence(tripId, classDay)
                onClose()
                toast('Falta registrada', { action: { label: 'Desfazer', run: () => unmarkAbsence(tripId, classDay) } })
              }}
            >
              {entry.absent ? 'Não faltei: desfazer' : 'Faltei nessa aula'}
            </Button>
          )}
          {entry.open.module && (
            <Button
              variant="soft"
              size="md"
              className="flex-1 min-w-[150px] whitespace-nowrap px-4"
              icon={<ArrowUpRight size={16} />}
              onClick={() => {
                onEdited?.()
                nav(entry.open.module!.route)
              }}
            >
              Abrir em {entry.open.module.label}
            </Button>
          )}
          {entry.open.edit && !entry.masked && (
            <Button variant="outline" size="md" className="flex-1 min-w-[110px] whitespace-nowrap px-4" icon={<Pencil size={15} />} onClick={edit}>
              Editar
            </Button>
          )}
        </footer>
      )}
    </article>
  )
}

/** Private entry while the lock is closed: unlock right here with her code. */
function PrivateNote() {
  const lock = useDB((db) => db.profile.privacyLock)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string>()
  return (
    <section className="rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] text-ink-2">
      <div className="flex items-center gap-1.5 font-medium">
        <Lock size={14} aria-hidden /> Compromisso privado
      </div>
      <p className="text-muted mt-0.5">Saúde e terapia ficam discretos na agenda. Desbloqueie para ver.</p>
      {lock && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await verifyPin(pin, lock)) {
              haptic('success')
              unlockSession()
            } else {
              setError('Código não confere.')
              setPin('')
            }
          }}
        >
          <input
            value={pin}
            onChange={(e) => {
              setError(undefined)
              setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
            }}
            inputMode="numeric"
            type="password"
            aria-label="Código"
            placeholder="código"
            className="input flex-1 min-w-0 text-center tracking-[0.3em]"
          />
          <Button type="submit" variant="primary" size="sm" disabled={pin.length < 4}>
            Desbloquear
          </Button>
        </form>
      )}
      {error && <p className="text-[12.5px] text-sand mt-1">{error}</p>}
    </section>
  )
}
