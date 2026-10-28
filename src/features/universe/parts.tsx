/** Small presentational pieces of Meu Universo (cards, bottle monogram, pills, bars, price input). */
import { useState, type ReactNode } from 'react'
import { Heart } from 'lucide-react'
import { Pill } from '@/components/ui'
import type { UniverseItem } from '@/data/types'
import { cn } from '@/lib/cn'
import { centsToInput, parseBRL } from '@/lib/money'
import { CATEGORY_LABEL, CONFIRM_LABEL, OCCASION_LABEL, OPINION_LABEL, OWNERSHIP_LABEL, isOwned, isWished } from '@/data/universe/model'

const MONO_TONES = ['bg-plum-soft text-plum', 'bg-sand-soft text-sand', 'bg-sage-soft text-sage', 'bg-ocean-soft text-ocean', 'bg-accent-soft text-accent']

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Photo, or a quiet monogram "bottle" (initials of the name) when there is none. */
export function Bottle({ item, size = 56, className }: { item: Pick<UniverseItem, 'id' | 'name' | 'photo'>; size?: number; className?: string }) {
  if (item.photo) return <img src={item.photo} alt="" className={cn('object-cover rounded-[14px] shrink-0', className)} style={{ width: size, height: size }} />
  const initials = item.name
    .split(/\s+/)
    .filter((w) => /^[\p{L}\d]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className={cn('shrink-0 inline-flex items-center justify-center rounded-[14px] font-display italic', MONO_TONES[hash(item.id) % MONO_TONES.length], className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || '·'}
    </span>
  )
}

/** Ownership + opinion as two separate pills (never merged into one status). */
export function StatusPills({ item, className }: { item: UniverseItem; className?: string }) {
  return (
    <span className={cn('flex flex-wrap gap-1.5', className)}>
      <Pill className={isOwned(item) ? 'bg-sage-soft text-sage' : isWished(item) ? 'bg-ocean-soft text-ocean' : undefined}>{OWNERSHIP_LABEL[item.ownership]}</Pill>
      {item.opinion && <Pill className={item.opinion === 'amei' ? 'bg-plum-soft text-plum' : undefined}>{OPINION_LABEL[item.opinion]}</Pill>}
      {item.favorite && (
        <Pill className="bg-plum-soft text-plum">
          <Heart size={11} className="fill-current" /> favorito
        </Pill>
      )}
      {!item.confirmed && <Pill className="bg-sand-soft text-sand">a confirmar</Pill>}
    </span>
  )
}

export const confirmText = (item: Pick<UniverseItem, 'needsConfirmation'>) =>
  (item.needsConfirmation ?? []).map((f) => CONFIRM_LABEL[f] ?? f).join(', ')

/** Collection card (two per row). */
export function ItemCard({ item, onOpen }: { item: UniverseItem; onOpen: () => void }) {
  const family = item.families?.join(' · ') || item.description
  return (
    <button type="button" onClick={onOpen} className="card p-3.5 text-left flex flex-col gap-2.5 active:scale-[0.99] transition min-w-0">
      <div className="flex items-start justify-between gap-2">
        <Bottle item={item} size={48} />
        <span className="flex gap-1 items-center">
          {item.favorite && <Heart size={14} className="text-plum fill-current" aria-label="favorito" />}
          {item.opinion === 'amei' && !item.favorite && <span className="text-[11px] text-plum">amei</span>}
        </span>
      </div>
      <div className="min-w-0">
        {item.brand && <div className="eyebrow truncate">{item.brand}</div>}
        <div className="font-display text-[17px] leading-[1.15] mt-0.5 line-clamp-2">
          {item.name}
          {item.version && <span className="text-muted"> {item.version}</span>}
        </div>
        {family && <div className="text-[12.5px] text-ink-2 mt-1 line-clamp-2">{family}</div>}
      </div>
      {item.notes?.length ? <div className="text-[12px] text-muted line-clamp-2">{item.notes.join(' · ')}</div> : null}
      <div className="mt-auto flex flex-wrap gap-1">
        {(item.occasions ?? []).slice(0, 3).map((o) => (
          <span key={o} className="text-[11px] px-2 h-5 inline-flex items-center rounded-full bg-surface-2 text-ink-2">
            {OCCASION_LABEL[o].toLowerCase()}
          </span>
        ))}
        {!item.confirmed && <span className="text-[11px] px-2 h-5 inline-flex items-center rounded-full bg-sand-soft text-sand">a confirmar</span>}
      </div>
    </button>
  )
}

/** Row for lists (wishlist, purchases, history). */
export function ItemRow({ item, onOpen, sub, trailing, leading }: { item: UniverseItem; onOpen: () => void; sub?: ReactNode; trailing?: ReactNode; leading?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {leading}
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <Bottle item={item} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-snug truncate">
            {item.brand ? <span className="text-muted">{item.brand} · </span> : null}
            {item.name}
            {item.version ? ` ${item.version}` : ''}
          </span>
          {sub && <span className="block text-[12.5px] text-muted mt-0.5 line-clamp-2">{sub}</span>}
        </span>
      </button>
      {trailing}
    </div>
  )
}

export const categoryLine = (i: UniverseItem) => CATEGORY_LABEL[i.category]

/** A horizontal bar from a real count (no percentages): owned part + loved part. */
export function CountBar({ label, owned, loved, max }: { label: string; owned: number; loved: number; max: number }) {
  const w = (n: number) => `${max > 0 ? (n / max) * 100 : 0}%`
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
        <span className="truncate">{label}</span>
        <span className="text-[12px] text-muted shrink-0 tabular-nums">
          {owned ? `${owned} na coleção` : ''}
          {owned && loved ? ' · ' : ''}
          {loved ? `${loved} amei/gostei` : ''}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-2 overflow-hidden flex">
        <span className="h-full bg-sage" style={{ width: w(owned) }} />
        <span className="h-full bg-plum" style={{ width: w(loved) }} />
      </div>
    </div>
  )
}

export const CURRENCIES = ['BRL', 'ZAR', 'USD', 'EUR', 'GBP'] as const

/** Amount + currency (never converted: no live exchange rate). */
export function PriceInput({ cents, currency, onChange }: { cents?: number; currency?: string; onChange: (cents: number | undefined, currency: string) => void }) {
  const [text, setText] = useState(() => centsToInput(cents))
  const cur = currency || 'BRL'
  return (
    <div className="flex gap-2">
      <select aria-label="Moeda" value={cur} onChange={(e) => onChange(parseBRL(text), e.target.value)} className="input w-[92px] min-h-12 appearance-none">
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        aria-label="Preço"
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseBRL(e.target.value), cur)
        }}
        className="input flex-1 min-w-0"
      />
    </div>
  )
}

/** "a, b, c" ⇄ string[] for free-text tag fields (families, notes). */
export const listToText = (l?: string[]) => (l ?? []).join(', ')
export const textToList = (t: string) =>
  t
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Chip scale 1..n (doçura, frescor…). Tap again to clear. */
export function Scale({ value, onChange, max = 5, label }: { value?: number; onChange: (v: number | undefined) => void; max?: number; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 flex-wrap">
      {Array.from({ length: max + (max === 10 ? 1 : 0) }, (_, k) => (max === 10 ? k : k + 1)).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? undefined : n)}
          className={cn('h-9 min-w-9 px-2 rounded-full text-[13.5px] border transition', value === n ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2')}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
