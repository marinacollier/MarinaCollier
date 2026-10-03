/**
 * Quick time edit, inline under the row (not the full form): pick a time → "só hoje".
 * Secondary: mudar o padrão também · qualquer momento · hoje não · voltar ao horário de sempre.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { canSetDefault } from '@/data/schedule'
import { getDB } from '@/data/store'
import type { TimelineEntry } from '@/data/types'
import { cancelToday, editTimeDefault, editTimeToday, hasOverride, makeAnytime, restoreDefault } from './actions'

function Link({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-10 px-2.5 rounded-full text-[12.5px] text-ink-2 active:bg-surface-2 whitespace-nowrap">
      {children}
    </button>
  )
}

export function TimeEditor({ entry, onDone }: { entry: TimelineEntry; onDone: () => void }) {
  const [time, setTime] = useState(entry.start ?? '')
  const overridden = hasOverride(entry)
  const allowDefault = canSetDefault(getDB(), entry.ref)
  const run = (fn: () => void) => () => {
    fn()
    onDone()
  }
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="ml-[52px] mr-1 mb-2 mt-0.5 rounded-2xl bg-surface-2 p-2.5">
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label={`Horário de ${entry.title}`}
            className="input appearance-none min-h-11 w-[136px] font-sport text-[18px] tabular-nums bg-surface"
            autoFocus
          />
          <button
            type="button"
            disabled={!time}
            onClick={run(() => editTimeToday(entry, time))}
            className="flex-1 h-11 rounded-full bg-ink text-bg text-[14px] font-medium disabled:opacity-30 active:scale-[0.98] transition"
          >
            Só hoje
          </button>
        </div>
        <div className="flex flex-wrap items-center -mx-1 mt-1">
          {allowDefault && time && <Link onClick={run(() => editTimeDefault(entry, time))}>mudar o padrão também</Link>}
          {entry.timeSource !== 'anytime' && entry.kind !== 'workout' && entry.kind !== 'event' && <Link onClick={run(() => makeAnytime(entry))}>qualquer momento</Link>}
          {entry.status !== 'cancelled' && <Link onClick={run(() => cancelToday(entry))}>hoje não</Link>}
          {overridden && <Link onClick={run(() => restoreDefault(entry))}>↺ horário de sempre</Link>}
        </div>
      </div>
    </motion.div>
  )
}
