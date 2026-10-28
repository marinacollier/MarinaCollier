/**
 * Expedição — small building blocks shared by the views and the item sheet.
 */
import { useState, type ReactNode } from 'react'
import { MapPin, Navigation } from 'lucide-react'
import type { Trip, TripCurrency, TripItem } from '@/data/types'
import { openSheet } from '@/app/ui-store'
import { Checkbox } from '@/components/ui'
import { actions } from '@/data/store'
import { cn } from '@/lib/cn'
import { centsToInput, parseBRL } from '@/lib/money'
import { BOOKING_META, CERTAINTY_META, CHECKLIST_LABEL, bookingOf, certaintyOf, checklistOf, convert, directionsUrl, formatMoney, toggleChecked } from './logic'

export function CertaintyBadge({ item, className }: { item: TripItem; className?: string }) {
  const c = certaintyOf(item)
  return (
    <span className={cn('inline-flex items-center h-6 px-2 rounded-full font-sport text-[11px] tracking-[0.12em] whitespace-nowrap shrink-0', CERTAINTY_META[c].cls, className)}>
      {CERTAINTY_META[c].short}
    </span>
  )
}

export function BookingBadge({ item }: { item: TripItem }) {
  const b = bookingOf(item)
  if (!b || b === 'confirmado' || b === 'cancelado') return null
  return <span className="inline-flex items-center h-6 px-2 rounded-full text-[11.5px] border border-line text-ink-2 whitespace-nowrap shrink-0">{BOOKING_META[b].label}</span>
}

/** "ZAR 1.200 · R$ 360" — BRL only with her rate. */
export function MoneyPair({ cents, trip, from, className }: { cents: number; trip: Trip; from?: TripCurrency; className?: string }) {
  const exp = trip.expedition
  if (!exp) return null
  const cur = exp.currency
  const main = convert(cents, from ?? cur, cur, exp)
  if (main == null) return <span className={className}>{formatMoney(cents, from ?? cur)}</span>
  const brl = cur === 'BRL' ? undefined : convert(main, cur, 'BRL', exp)
  return (
    <span className={className}>
      {formatMoney(main, cur)}
      {brl != null && <span className="text-muted font-normal"> · {formatMoney(brl, 'BRL')}</span>}
    </span>
  )
}

/** Money typed in the item's own currency (MoneyInput is BRL-only). */
export function CentsInput({ value, onChange, currency, label }: { value?: number; onChange: (v: number | undefined) => void; currency: TripCurrency; label: string }) {
  const [text, setText] = useState(() => centsToInput(value))
  return (
    <div className="input flex items-baseline gap-2">
      <span className="text-muted text-[13px] font-sport">{currency === 'ZAR' ? 'R (ZAR)' : 'R$'}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseBRL(e.target.value))
        }}
        className="flex-1 min-w-0 bg-transparent outline-none"
      />
    </div>
  )
}

export function MapLinks({ trip, address }: { trip: Trip; address?: string }) {
  if (!address) return null
  const exp = trip.expedition
  const links = [
    exp?.residence && { label: 'da residência', origin: exp.residence.address },
    exp?.school?.address && { label: 'da escola', origin: exp.school.address },
  ].filter(Boolean) as { label: string; origin: string }[]
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => (
        <a
          key={l.label}
          href={directionsUrl(address, l.origin)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-surface-2 text-[12.5px] text-ink-2 active:scale-[0.97] transition"
        >
          <Navigation size={13} aria-hidden /> Rota {l.label}
        </a>
      ))}
      {!links.length && (
        <a href={directionsUrl(address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-surface-2 text-[12.5px] text-ink-2">
          <MapPin size={13} aria-hidden /> Abrir no mapa
        </a>
      )}
    </div>
  )
}

/** Wake → prep → leave → start → end → back, only the ones she has. */
export function TimesLine({ item }: { item: TripItem }) {
  const bits: [string, string | undefined][] = [
    ['acordar', item.wakeTime],
    ['preparo', item.prepTime],
    ['sair', item.leaveTime],
    ['fim', item.endTime],
    ['volta', item.returnTime],
  ]
  const shown = bits.filter(([, v]) => v)
  if (!shown.length) return null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted">
      {shown.map(([k, v]) => (
        <span key={k}>
          {k} <b className="font-sport text-[13px] text-ink-2">{v}</b>
        </span>
      ))}
    </div>
  )
}

/** One activity on a day: time column, title, certainty, logistics. Tap = edit. */
export function DayItem({ trip, item, date, children }: { trip: Trip; item: TripItem; date: string; children?: ReactNode }) {
  const cancelled = item.status === 'cancelado'
  const continuing = item.date !== date
  const time = continuing ? '·' : item.time ?? '—'
  const meta = [
    item.supplier,
    item.pickup && `pickup: ${item.pickup}`,
    item.travelMinutes != null && `${item.travelMinutes} min de deslocamento`,
    item.route,
    item.uberCents != null && `Uber ${formatMoney(item.uberCents, item.currency ?? trip.expedition?.currency ?? 'ZAR')}`,
  ].filter(Boolean) as string[]
  return (
    <div className="flex gap-3 py-3">
      <div className={cn('w-12 shrink-0 font-sport text-[17px] leading-6 tabular-nums', continuing ? 'text-muted' : 'text-ink')}>{time}</div>
      <div className="flex-1 min-w-0">
        <button type="button" onClick={() => openSheet('tripItem', { id: item.id })} className="w-full text-left">
          <div className="flex items-start gap-2">
            <span className={cn('flex-1 min-w-0 text-[15px] leading-snug', cancelled && 'line-through text-muted')}>
              {item.title}
              {continuing && <span className="text-muted text-[12.5px]"> (continua)</span>}
            </span>
            {!cancelled && <CertaintyBadge item={item} />}
          </div>
          <div className="mt-1 space-y-1">
            <TimesLine item={item} />
            {meta.length > 0 && <div className="text-[12.5px] text-muted leading-snug">{meta.join(' · ')}</div>}
            {(item.optional || bookingOf(item) || item.clearance || item.schoolImpact) && !cancelled && (
              <div className="flex flex-wrap gap-1.5">
                <BookingBadge item={item} />
                {item.optional && <span className="inline-flex items-center h-6 px-2 rounded-full text-[11.5px] bg-plum-soft text-ink-2">extra</span>}
                {item.clearance && item.clearance !== 'liberada' && <span className="inline-flex items-center h-6 px-2 rounded-full text-[11.5px] bg-sand-soft text-ink-2">liberação médica {item.clearance === 'pendente' ? 'pendente' : 'negada'}</span>}
                {item.schoolImpact && <span className="inline-flex items-center h-6 px-2 rounded-full text-[11.5px] bg-surface-2 text-ink-2">{item.schoolImpact === 'dia' ? 'sem aula no dia' : 'perde parte da aula'}{item.schoolMadeUp ? ' · reposta' : ''}</span>}
              </div>
            )}
          </div>
        </button>
        {!cancelled && item.address && (
          <div className="mt-2">
            <MapLinks trip={trip} address={item.address} />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/** The activity's checklist, ticked in place (saved on the item). */
export function ItemChecklist({ item, compact }: { item: TripItem; compact?: boolean }) {
  const lines = checklistOf(item)
  if (!lines.length) return null
  const done = lines.filter((l) => l.done).length
  const k = CHECKLIST_LABEL[item.checklistKind!]
  return (
    <div className={cn(!compact && 'card p-4')}>
      <div className="flex items-center justify-between mb-1">
        <div className="eyebrow">
          {k.emoji} {compact ? k.label : item.title}
        </div>
        <span className="text-[12px] text-muted tabular-nums">
          {done}/{lines.length}
        </span>
      </div>
      <ul>
        {lines.map((l) => (
          <li key={l.text} className="flex items-center gap-3 min-h-11">
            <Checkbox size="sm" checked={l.done} label={l.text} onChange={() => actions.update('tripItems', item.id, { checked: toggleChecked(item, l.text) })} />
            <span className={cn('text-[14px]', l.done && 'text-muted line-through')}>{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
