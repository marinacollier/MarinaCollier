/** Small visual pieces of Lumos's cards: source badges, the quiet macros line, day rows, checklist. */
import { ArrowRight } from 'lucide-react'
import type { ContentSource } from '@/data/types'
import { cn } from '@/lib/cn'
import type { ChecklistLine, DayRow } from './adjust/types'
import type { MacroPair } from './food/answer'

const BADGE: Record<ContentSource, { label: string; className: string }> = {
  nutri: { label: 'nutri', className: 'text-sage border-sage/40' },
  troca: { label: 'troca do plano', className: 'text-ocean border-ocean/40' },
  lumos: { label: 'lumos', className: 'text-sand border-sand/50' },
  marina: { label: 'você', className: 'text-muted border-line' },
}

/** NUTRI · TROCA DO PLANO · LUMOS — a quiet tag, never a warning. */
export function SourceBadge({ source, className }: { source: ContentSource; className?: string }) {
  const b = BADGE[source]
  return <span className={cn('inline-flex items-center h-[18px] px-1.5 rounded-full border text-[10px] font-semibold uppercase tracking-[0.08em] leading-none shrink-0', b.className, className)}>{b.label}</span>
}

/** consumido / planejado for P · C · G — small, elegant, no giant bars, kcal hidden. */
export function MacroLine({ macros, partial }: { macros: MacroPair[]; partial?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2/70 px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        {macros.map((m) => (
          <div key={m.key} className="min-w-0">
            <div className="text-[11px] text-muted">{m.label}</div>
            <div className="tabular-nums text-[13.5px] leading-tight">
              <span className="font-display text-[16px]">{m.consumed}</span>
              <span className="text-muted"> / {m.planned} g</span>
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11.5px] text-muted mt-1.5">consumido / planejado{partial ? ' · aproximado' : ''}</div>
    </div>
  )
}

const STATE_TEXT: Record<DayRow['state'], string> = { moved: '', cancelled: 'fora', new: 'novo', kept: '', free: '' }

/** What changes on the day's line ("Inglês 19:00 — fora hoje", "19:00–20:00 livre"). */
export function DayRows({ rows }: { rows: DayRow[] }) {
  return (
    <div className="rounded-2xl border border-line bg-surface divide-y divide-line/70 overflow-hidden">
      {rows.map((r) => {
        if (r.state === 'free') {
          return (
            <div key={r.key} className="flex items-center gap-3 px-3.5 py-2.5 bg-sage-soft/50">
              <span className="w-[86px] shrink-0 tabular-nums text-[13px] text-sage font-medium">
                {r.from}–{r.to}
              </span>
              <span className="text-[13.5px] text-sage">livre ✨</span>
            </div>
          )
        }
        if (r.key === 'more') {
          return (
            <div key={r.key} className="px-3.5 py-2 text-[12.5px] text-muted">
              {r.title}
            </div>
          )
        }
        const cancelled = r.state === 'cancelled'
        return (
          <div key={r.key} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="w-[86px] shrink-0 tabular-nums text-[13px] flex items-center gap-1">
              {r.state === 'moved' && r.from && r.from !== r.to ? (
                <>
                  <span className="text-muted line-through decoration-1">{r.from}</span>
                  <ArrowRight size={11} className="text-muted shrink-0" aria-hidden />
                  <span className="font-medium">{r.to}</span>
                </>
              ) : (
                <span className={cn(cancelled ? 'text-muted line-through decoration-1' : 'font-medium')}>{r.to ?? r.from ?? '—'}</span>
              )}
            </span>
            <span className={cn('flex-1 min-w-0 text-[14px] leading-snug truncate', cancelled && 'text-muted line-through decoration-1', r.state === 'kept' && 'text-ink-2')}>
              {r.emoji && <span className="mr-1.5" aria-hidden>{r.emoji}</span>}
              {r.title}
            </span>
            {STATE_TEXT[r.state] && <span className="text-[11.5px] text-muted shrink-0">{STATE_TEXT[r.state]}</span>}
            {r.lumos && r.state !== 'cancelled' && <SourceBadge source="lumos" />}
          </div>
        )
      })}
    </div>
  )
}

/** AMANHÃ ☐ 05:00 Pré-treino ☐ 08:00 Pós-treino … ☐ levar marmita */
export function ChecklistRows({ lines }: { lines: ChecklistLine[] }) {
  return (
    <ul className="rounded-2xl border border-line bg-surface divide-y divide-line/70 overflow-hidden">
      {lines.map((l) => (
        <li key={l.key} className={cn('flex items-start gap-3 px-3.5 py-2.5', l.cancelled && 'opacity-55')}>
          <span className={cn('h-5 w-5 mt-px rounded-md border shrink-0 flex items-center justify-center text-[11px]', l.done ? 'bg-sage border-sage text-bg' : 'border-line')} aria-hidden>
            {l.done ? '✓' : ''}
          </span>
          <span className="w-11 shrink-0 tabular-nums text-[13px] leading-snug text-ink-2 pt-px">{l.time ?? '—'}</span>
          <span className={cn('flex-1 min-w-0 text-[14px] leading-snug', l.cancelled && 'line-through decoration-1')}>
            {l.emoji && <span className="mr-1.5" aria-hidden>{l.emoji}</span>}
            {l.title}
          </span>
          {l.kind === 'meal' && l.badge && <SourceBadge source={l.badge} />}
          {l.kind === 'prep' && <span className="text-[11.5px] text-muted shrink-0 pt-0.5">preparo</span>}
        </li>
      ))}
    </ul>
  )
}
