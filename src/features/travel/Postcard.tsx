import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Tone, Trip } from '@/data/types'
import { cn } from '@/lib/cn'

/** CSS variables for a tone, so the paper/stamp art can mix them (dark mode = token swap). */
export function toneVars(t: Tone): CSSProperties {
  const base = t === 'ink' ? 'var(--ink-2)' : `var(--${t})`
  const soft = t === 'ink' ? 'var(--surface-2)' : `var(--${t}-soft)`
  return { ['--pc' as string]: base, ['--pc-soft' as string]: soft, ['--pc-ink' as string]: `color-mix(in oklab, ${base} 78%, var(--ink))` }
}

/** Linen paper: tone-tinted surface + faint grain + soft vignette. Pure CSS. */
const PAPER: CSSProperties = {
  backgroundColor: 'color-mix(in oklab, var(--pc-soft) 78%, var(--surface))',
  backgroundImage: [
    'radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--surface) 55%, transparent) 0%, transparent 60%)',
    'radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--pc) 11%, transparent) 0.6px, transparent 1.1px)',
    'repeating-linear-gradient(0deg, transparent 0 3px, color-mix(in oklab, var(--pc) 2.5%, transparent) 3px 4px)',
  ].join(','),
  backgroundSize: '100% 100%, 7px 7px, 100% 4px',
}

/** Red/blue air-mail border, drawn with tokens. */
export function AirmailEdge({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('h-[7px] w-full', className)}
      style={{
        backgroundImage:
          'repeating-linear-gradient(-45deg, var(--accent) 0 9px, transparent 9px 16px, var(--ocean) 16px 25px, transparent 25px 32px)',
        opacity: 0.85,
      }}
    />
  )
}

/** Perforated postage stamp holding the flag. Perforation = radial-gradient mask. */
export function Stamp({ flag, label, size = 76, tilt = 4 }: { flag: string; label?: string; size?: number; tilt?: number }) {
  const hole = 'radial-gradient(circle at 50% 50%, transparent 3.2px, black 3.6px)'
  return (
    <div
      aria-hidden
      className="relative shrink-0 drop-shadow-[0_2px_3px_rgb(0_0_0/0.12)]"
      style={{ width: size, height: size * 1.18, transform: `rotate(${tilt}deg)` }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'var(--surface)',
          WebkitMaskImage: `${hole}, linear-gradient(black, black)`,
          maskImage: `${hole}, linear-gradient(black, black)`,
          WebkitMaskSize: '10px 10px, calc(100% - 10px) calc(100% - 10px)',
          maskSize: '10px 10px, calc(100% - 10px) calc(100% - 10px)',
          WebkitMaskPosition: '-5px -5px, center',
          maskPosition: '-5px -5px, center',
          WebkitMaskRepeat: 'round, no-repeat',
          maskRepeat: 'round, no-repeat',
        }}
      />
      <div
        className="absolute inset-[7px] flex flex-col items-center justify-center rounded-[3px] border"
        style={{ borderColor: 'color-mix(in oklab, var(--pc) 45%, transparent)', background: 'color-mix(in oklab, var(--pc-soft) 70%, var(--surface))' }}
      >
        <span className="leading-none" style={{ fontSize: size * 0.42 }}>
          {flag || '✈️'}
        </span>
        {label && (
          <span className="mt-1 text-[8px] font-semibold tracking-[0.12em] uppercase max-w-full px-1 truncate" style={{ color: 'var(--pc-ink)' }}>
            {label}
          </span>
        )}
      </div>
    </div>
  )
}

/** Circular postmark with curved text + cancellation waves. SVG, tone-colored. */
export function Postmark({ text, center, size = 92, className }: { text: string; center?: string; size?: number; className?: string }) {
  const id = `pm-${text.replace(/[^a-z0-9]/gi, '').slice(0, 12)}-${size}`
  return (
    <svg aria-hidden width={size * 1.9} height={size} viewBox="0 0 190 100" className={cn('pointer-events-none', className)} style={{ color: 'var(--pc-ink)' }}>
      <g fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.6}>
        <circle cx="50" cy="50" r="44" />
        <circle cx="50" cy="50" r="30" strokeOpacity={0.35} />
        {[34, 44, 54, 64].map((y) => (
          <path key={y} d={`M100 ${y} q 11 -6 22 0 t 22 0 t 22 0 t 22 0`} strokeOpacity={0.38} />
        ))}
      </g>
      <defs>
        <path id={id} d="M 50 50 m -37 0 a 37 37 0 1 1 74 0 a 37 37 0 1 1 -74 0" />
      </defs>
      <text fill="currentColor" fillOpacity={0.6} fontSize="9.5" fontWeight={600} letterSpacing="2.4" style={{ textTransform: 'uppercase' }}>
        <textPath href={`#${id}`} startOffset="2%">
          {text}
        </textPath>
      </text>
      {center && (
        <text x="50" y="54" textAnchor="middle" fill="currentColor" fillOpacity={0.62} fontSize="12" fontWeight={700} letterSpacing="0.5">
          {center}
        </text>
      )}
    </svg>
  )
}

export interface PostcardProps {
  trip: Trip
  /** Big hero (next trip) or compact card. */
  variant?: 'hero' | 'compact'
  eyebrow?: ReactNode
  datesLabel: string
  countdown: string
  footer?: ReactNode
  onPress?: () => void
  tilt?: number
  index?: number
  /** Tighter hero for the trip page header. */
  dense?: boolean
}

export function Postcard({ trip, variant = 'compact', eyebrow, datesLabel, countdown, footer, onPress, tilt = 0, index = 0, dense }: PostcardProps) {
  const hero = variant === 'hero'
  const year = (trip.startDate ?? trip.dateLabel ?? '').match(/\d{4}/)?.[0]
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, rotate: 0 }}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      transition={{ type: 'spring', bounce: 0.2, duration: 0.6, delay: index * 0.06 }}
      style={toneVars(trip.tone)}
    >
      <div
        role={onPress ? 'button' : undefined}
        tabIndex={onPress ? 0 : undefined}
        onClick={onPress}
        onKeyDown={onPress ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPress()) : undefined}
        className={cn(
          'relative overflow-hidden rounded-[18px] border shadow-card text-left',
          onPress && 'cursor-pointer transition active:scale-[0.99]',
        )}
        style={{ ...PAPER, borderColor: 'color-mix(in oklab, var(--pc) 22%, var(--line))' }}
      >
        <AirmailEdge />
        <div className={cn('relative', hero ? (dense ? 'px-5 pt-4 pb-4' : 'px-5 pt-5 pb-5') : 'px-4 pt-4 pb-4')}>

          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 relative">
              {eyebrow && (
                <div className="eyebrow" style={{ color: 'var(--pc-ink)' }}>
                  {eyebrow}
                </div>
              )}
              <div className={cn('font-display leading-[1.02] tracking-tight', hero ? (dense ? 'text-[32px] mt-1' : 'text-[38px] mt-1.5') : 'text-[23px] mt-0.5')}>{trip.name}</div>
              {trip.place && <div className={cn('text-ink-2 mt-1', hero ? 'text-[14.5px]' : 'text-[13px] truncate')}>{trip.place}</div>}
            </div>
            <Stamp flag={trip.flag} label={hero && trip.name.length <= 10 ? trip.name : undefined} size={hero ? (dense ? 64 : 76) : 54} tilt={hero ? 5 : 3} />
          </div>

          {hero ? (
            <div className={cn('relative', dense ? 'mt-4' : 'mt-6')}>
              <Postmark text={`${trip.place ?? trip.name} · ${datesLabel}`} center={year} size={84} className="absolute right-[-80px] top-[-30px] -rotate-12" />
              <div className="relative">
                <div className={cn('font-display leading-none', dense ? 'text-[26px]' : 'text-[30px]')} style={{ color: 'var(--pc-ink)' }}>
                  {countdown}
                </div>
                <div className="text-[13px] text-ink-2 mt-2 flex items-center gap-1.5">
                  <span>{datesLabel}</span>
                  {!trip.datesConfirmed && <span className="text-muted">· a confirmar</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-2 truncate">
                {datesLabel}
                {!trip.datesConfirmed && trip.startDate ? <span className="text-muted"> · a confirmar</span> : null}
              </span>
              <span
                className="shrink-0 h-7 px-2.5 inline-flex items-center rounded-full text-[12.5px] font-semibold"
                style={{ color: 'var(--pc-ink)', background: 'color-mix(in oklab, var(--pc) 13%, var(--surface))' }}
              >
                {countdown}
              </span>
            </div>
          )}

          {footer && (
            <div className="mt-4 pt-3 border-t border-dashed" style={{ borderColor: 'color-mix(in oklab, var(--pc) 30%, transparent)' }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
