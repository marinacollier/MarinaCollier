/**
 * The same small menu for every line of the day (tap the round button on the right):
 *   ✓ Concluído · ◐ Parcial · ✕ Faltei · ↻ Replanejar   ·   ✎ Editar · 🗑 Excluir
 * Replanejar: "+1 h", "Amanhã" or any day/time. Each action saves at once and shows a toast with Desfazer.
 * Fixed things are never changed silently (Google is read-only here, a class follows the school, a booking asks).
 */
import { useState } from 'react'
import { CalendarClock, Check, CircleSlash, Pencil, Trash2, X } from 'lucide-react'
import { toast } from '@/app/ui-store'
import type { DateKey } from '@/data/types'
import { addDays, formatDayMonth, hmToMinutes, minutesToHM } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { useDB } from '@/data/store'
import { canComplete, isRowDone, toggleDone, type RowResult, type RowTarget } from './row-actions'
import { lineKey, lineStateOf, planDelete, planReschedule, routineDone, routineState, setLineState, type LineState } from './line-status'

const show = (r: RowResult) => toast(r.message, r.undo ? { action: { label: 'Desfazer', run: r.undo } } : {})

function Half() {
  return <span aria-hidden className="h-[14px] w-[14px] rounded-full border-[1.5px] border-current" style={{ background: 'linear-gradient(90deg, currentColor 50%, transparent 50%)' }} />
}

function StatusButton({ on, label, icon, onClick, tone }: { on?: boolean; label: string; icon: React.ReactNode; onClick: () => void; tone: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => (haptic('light'), onClick())}
      className={cn('h-14 rounded-2xl flex items-center justify-center gap-2 text-[15px] font-medium transition active:scale-[0.98]', on ? tone : 'bg-surface-2 text-ink')}
    >
      {icon}
      {label}
    </button>
  )
}

export type MenuTarget = { kind: 'line'; t: RowTarget; title: string; when?: string; onEdit?: () => void } | { kind: 'routine'; id: string; date: DateKey; title: string; when?: string; itemIds: string[]; done: boolean; onEdit: () => void }

export function LineMenu({ target, onClose, nowMin }: { target: MenuTarget; onClose: () => void; nowMin: number }) {
  const db = useDB()
  const [resched, setResched] = useState(false)
  const [confirm, setConfirm] = useState<{ message: string; run: () => RowResult }>()
  const [blocked, setBlocked] = useState<string>()
  const date = target.kind === 'line' ? target.t.date : target.date
  const [toDate, setToDate] = useState<DateKey>(date)
  const [toTime, setToTime] = useState<string>('')
  const done = target.kind === 'line' ? isRowDone(db, target.t) : target.done
  const state: LineState | undefined = target.kind === 'line' ? lineStateOf(db, lineKey(target.t), date) : lineStateOf(db, `routine:${target.id}`, date)
  const finish = (r: RowResult) => (show(r), onClose())

  const conclude = () => {
    if (target.kind === 'routine') return finish(routineDone(target.itemIds, date, !done))
    if (!canComplete(target.t)) return setBlocked('Esse item não tem “concluído” — abra para ver.')
    finish(toggleDone(target.t))
  }
  const partial = () => {
    if (target.kind === 'routine') return target.onEdit()
    finish(setLineState(target.t, 'parcial'))
  }
  const missed = () => {
    if (target.kind === 'routine') return finish(routineState(target.id, date, state === 'faltei' ? undefined : 'faltei'))
    finish(setLineState(target.t, 'faltei'))
  }
  const reschedule = (d: DateKey, time?: string) => {
    if (target.kind !== 'line') return
    const p = planReschedule(target.t, d, time || undefined)
    if (p.kind === 'blocked') return setBlocked(p.message)
    if (p.kind === 'confirm') return setConfirm({ message: p.message, run: p.run })
    finish(p.run())
  }
  const remove = () => {
    if (target.kind !== 'line') return
    const p = planDelete(target.t)
    if (p.kind === 'blocked') return setBlocked(p.message)
    setConfirm({ message: `${p.label}: “${target.title}”?`, run: p.run })
  }
  const start = target.kind === 'line' && target.t.kind === 'entry' ? target.t.e.startAt.time : target.kind === 'line' && target.t.kind === 'block' ? target.t.b.start : undefined
  const plusHour = minutesToHM(Math.min(23 * 60 + 55, Math.max(start ? hmToMinutes(start) : 0, nowMin) + 60 - ((Math.max(start ? hmToMinutes(start) : 0, nowMin) + 60) % 5)))

  return (
    <div className="px-5 pb-6 pt-1" aria-label={`Status: ${target.title}`}>
      <div className="text-[12px] uppercase tracking-[0.06em] text-muted">{target.when ?? formatDayMonth(date)}</div>
      <div className="font-display text-[22px] leading-tight mt-0.5 mb-4">{target.title}</div>

      {confirm ? (
        <div className="space-y-3" role="alertdialog" aria-label="Confirmar">
          <p className="text-[15px]">{confirm.message}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="h-12 rounded-2xl bg-surface-2" onClick={() => setConfirm(undefined)}>
              Voltar
            </button>
            <button type="button" className="h-12 rounded-2xl bg-ink text-bg font-medium" onClick={() => finish(confirm.run())}>
              Sim
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatusButton on={done} label={done ? 'Concluído ✓' : 'Concluído'} icon={<Check size={18} aria-hidden />} onClick={conclude} tone="bg-sage text-bg" />
            <StatusButton on={state === 'parcial'} label={target.kind === 'routine' ? 'Abrir checklist' : 'Parcial'} icon={<Half />} onClick={partial} tone="bg-sand-soft text-ink" />
            <StatusButton on={state === 'faltei' || (target.kind === 'line' && target.t.kind === 'entry' && !!target.t.e.absent)} label="Faltei" icon={<CircleSlash size={18} aria-hidden />} onClick={missed} tone="bg-plum text-bg" />
            {target.kind === 'line' ? (
              <StatusButton on={resched || state === 'replanejado'} label="Replanejar" icon={<CalendarClock size={18} aria-hidden />} onClick={() => setResched((v) => !v)} tone="bg-ocean text-bg" />
            ) : (
              <span />
            )}
          </div>

          {resched && (
            <div className="mt-3 rounded-2xl bg-surface-2 p-3 space-y-3" aria-label="Replanejar">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="h-10 px-4 rounded-full bg-bg text-[14px]" onClick={() => reschedule(date, plusHour)}>
                  Hoje {plusHour}
                </button>
                <button type="button" className="h-10 px-4 rounded-full bg-bg text-[14px]" onClick={() => reschedule(addDays(date, 1), start)}>
                  Amanhã{start ? ` ${start}` : ''}
                </button>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex-1 text-[12px] text-muted">
                  Dia
                  <input type="date" value={toDate} min={date} onChange={(e) => setToDate(e.target.value)} className="mt-1 w-full h-11 rounded-xl bg-bg px-3 text-[15px] text-ink" />
                </label>
                <label className="w-[110px] text-[12px] text-muted">
                  Horário
                  <input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} className="mt-1 w-full h-11 rounded-xl bg-bg px-3 text-[15px] text-ink" />
                </label>
              </div>
              <button type="button" disabled={!toDate || (toDate === date && !toTime)} className="w-full h-11 rounded-xl bg-ink text-bg font-medium disabled:opacity-40" onClick={() => reschedule(toDate, toTime)}>
                Replanejar para {toDate === date ? 'hoje' : formatDayMonth(toDate)}
                {toTime ? ` às ${toTime}` : ''}
              </button>
            </div>
          )}

          {blocked && (
            <p className="mt-3 text-[14px] text-ink-2" role="status">
              {blocked}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            {target.onEdit && (
              <button type="button" className="flex-1 h-12 rounded-2xl bg-surface-2 inline-flex items-center justify-center gap-2 text-[15px]" onClick={() => (onClose(), target.onEdit!())}>
                <Pencil size={16} aria-hidden /> Editar
              </button>
            )}
            {target.kind === 'line' && (
              <button type="button" className="flex-1 h-12 rounded-2xl bg-surface-2 inline-flex items-center justify-center gap-2 text-[15px] text-plum" onClick={remove}>
                <Trash2 size={16} aria-hidden /> Excluir
              </button>
            )}
            <button type="button" aria-label="Fechar" className="h-12 w-12 rounded-2xl bg-surface-2 inline-flex items-center justify-center" onClick={onClose}>
              <X size={18} aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
