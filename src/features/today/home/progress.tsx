/** "3 de 9 hoje · 33%" + a hairline bar under the date. Calm: no streak, no score, no colour shouting. */
export function DayProgressLine({ done, total, pct }: { done: number; total: number; pct: number }) {
  if (!total) return null
  return (
    <div className="mt-3 max-w-[22rem]">
      <div className="flex items-baseline justify-between text-[0.875rem] text-ink-2">
        <span>
          <span className="font-semibold text-ink tabular-nums">{done}</span> de <span className="tabular-nums">{total}</span> hoje
        </span>
        <span className="text-[0.75rem] text-muted tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1.5 h-[3px] rounded-full bg-line overflow-hidden" role="progressbar" aria-label={`${done} de ${total} feitos hoje`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
