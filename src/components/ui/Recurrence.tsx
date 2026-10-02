import type { Recurrence, Weekday } from '@/data/types'
import { WEEKDAY_LETTER } from '@/lib/date'
import { cn } from '@/lib/cn'
import { Segmented } from './Segmented'
import { todayKey } from '@/lib/date'

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

/** Seg..Dom toggles. */
export function WeekdayPicker({ value, onChange, className }: { value: Weekday[]; onChange: (v: Weekday[]) => void; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-1.5', className)}>
      {ORDER.map((d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d]}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cn('h-10 flex-1 rounded-full text-[13px] font-semibold transition', on ? 'bg-ink text-bg' : 'bg-surface-2 text-muted')}
          >
            {WEEKDAY_LETTER[d]}
          </button>
        )
      })}
    </div>
  )
}

type Mode = 'none' | 'weekly' | 'monthly' | 'every_n_days'

/** Simple recurrence editor. `allowNone` adds "não repete". */
export function RecurrencePicker({ value, onChange, allowNone = true }: { value: Recurrence | undefined; onChange: (r: Recurrence | undefined) => void; allowNone?: boolean }) {
  const mode: Mode = !value ? 'none' : value.kind === 'daily' ? 'weekly' : value.kind
  const options: { value: Mode; label: string }[] = [
    ...(allowNone ? [{ value: 'none' as Mode, label: 'Não repete' }] : []),
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'every_n_days', label: 'A cada X dias' },
  ]
  const setMode = (m: Mode) => {
    if (m === 'none') onChange(undefined)
    if (m === 'weekly') onChange({ kind: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 0] })
    if (m === 'monthly') onChange({ kind: 'monthly', dayOfMonth: Number(todayKey().slice(8, 10)) })
    if (m === 'every_n_days') onChange({ kind: 'every_n_days', days: 7, anchor: todayKey(), fromLastDone: true })
  }
  return (
    <div className="space-y-3">
      <Segmented value={mode} onChange={setMode} options={options} />
      {value && (value.kind === 'weekly' || value.kind === 'daily') && (
        <WeekdayPicker value={value.kind === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : value.weekdays} onChange={(weekdays) => onChange({ kind: 'weekly', weekdays })} />
      )}
      {value?.kind === 'monthly' && (
        <div className="flex items-center gap-2 text-[14px] text-ink-2">
          todo dia
          <input
            inputMode="numeric"
            className="input w-20 text-center"
            value={value.dayOfMonth === 'last' ? '' : value.dayOfMonth}
            placeholder="últ."
            onChange={(e) => {
              const n = Number(e.target.value)
              onChange({ kind: 'monthly', dayOfMonth: e.target.value === '' ? 'last' : Math.min(31, Math.max(1, n || 1)) })
            }}
          />
          <span className="text-muted text-[12px]">(vazio = último dia)</span>
        </div>
      )}
      {value?.kind === 'every_n_days' && (
        <div className="flex items-center gap-2 text-[14px] text-ink-2">
          a cada
          <input
            inputMode="numeric"
            className="input w-20 text-center"
            value={value.days}
            onChange={(e) => onChange({ ...value, days: Math.max(1, Number(e.target.value) || 1) })}
          />
          dias
        </div>
      )}
    </div>
  )
}
