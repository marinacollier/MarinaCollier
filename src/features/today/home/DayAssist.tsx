/**
 * "Ajustar o dia" — the replanning assistant of the ONE timeline (it is not a second planner):
 *   · one explainable capacity line (tap → the real free windows, reserve, margin, auto/preview mode)
 *   · quick chips (+30 min · menos tempo · estou cansada · replanejar) and a short text box
 *     ("tenho 45 min", "não quero idiomas", "preciso focar no Fashion Finder", "acabei mais cedo")
 *   · every command changes the plan for real (persisted in the day's blocks) and says WHAT changed — or why
 *     nothing could, with Desfazer.
 * And the sheet of one planned block: Começar · Concluir · Replanejar (+ Mais: dividir, trocar, adiar, tirar).
 */
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import type { CalendarEntry } from '@/data/calendar/universal'
import { actions, useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { addDays, hmToMinutes, minutesToHM } from '@/lib/date'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { addCapacity, applyModeOf, applyProposal, completeBlock, dropBlock, lowerEnergy, moveBlock, propose, replanRest, type BlockRow, type Outcome } from './allocation'
import { parseAdjust, runAdjust } from './adjust'
export { parseAdjust, runAdjust } from './adjust'
import { dayContextFor, formatMin, split } from './day-checkin'

const chip = 'h-9 px-3 rounded-full text-[13px] bg-surface-2 text-ink-2 active:opacity-70 whitespace-nowrap'
const field = 'w-full min-h-10 rounded-xl bg-surface-2 px-3 py-2 text-[15px] text-ink placeholder:text-muted outline-none'

// ─── The bar ────────────────────────────────────────────────────────────────

export function DayAssist({ date, nowMin, entries, rows, onAsk }: { date: DateKey; nowMin: number; entries?: CalendarEntry[]; rows: BlockRow[]; onAsk: (text: string) => void }) {
  const db = useDB()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [out, setOut] = useState<Outcome>()
  const mode = applyModeOf(db)
  const info = useMemo(() => {
    const { ctx } = dayContextFor(db, date, nowMin, entries)
    const p = propose(db, date, nowMin, entries)
    const planned = rows.filter((r) => r.state === 'planejado' && hmToMinutes(r.end) > nowMin).reduce((s, r) => s + r.minutes, 0)
    return { free: ctx.freeMin, planned, cap: p.cap, energy: ctx.energy }
  }, [db, date, nowMin, entries, rows])
  const suggestions = rows.filter((r) => r.state === 'sugestao')

  const run = (o: Outcome) => {
    haptic('light')
    setOut(o)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    const a = parseAdjust(q)
    setText('')
    if (a) run(runAdjust(a, date, nowMin, entries))
    else onAsk(q)
  }

  return (
    <section aria-label="Ajustar o dia" className="mt-3">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full min-h-11 flex items-center justify-between gap-2 text-left active:opacity-70">
        <span className="text-[14px] text-ink-2">
          <span className="text-ink font-medium">{formatMin(Math.max(0, info.free - info.planned))}</span> livres para coisas flexíveis
          {info.planned > 0 && <span className="text-muted"> · {formatMin(info.planned)} planejados</span>}
        </span>
        <ChevronDown size={15} aria-hidden className={cn('text-muted transition shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="pb-2 text-[13px] text-ink-2 space-y-1.5" aria-label="Como calculei">
          <p>Intervalos livres de hoje (já sem compromissos, treinos, blocos planejados e 10 min de folga entre as coisas):</p>
          {info.cap.windows.length ? (
            <ul className="tabular-nums">
              {info.cap.windows.map((w) => (
                <li key={w.start}>
                  {w.start}–{w.end} <span className="text-muted">· {formatMin(hmToMinutes(w.end) - hmToMinutes(w.start))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nenhum intervalo livre daqui até dormir.</p>
          )}
          <p className="text-muted">
            Disso saem {formatMin(info.cap.reserveMin)} para o essencial (refeições, rotinas) e 15 % de margem — o dia nunca roda no minuto. Energia de hoje: {info.energy}/5.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-muted">Blocos flexíveis:</span>
            {(['auto', 'preview'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => actions.setProfile({ planApply: m })} className={cn('h-8 px-3 rounded-full text-[12.5px]', mode === m ? 'bg-accent text-bg' : 'bg-surface-2 text-ink-2')}>
                {m === 'auto' ? 'encaixar sozinho' : 'pedir aprovação'}
              </button>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <button type="button" onClick={() => run(applyProposal(date, nowMin, entries))} className="mt-1 h-10 px-4 rounded-full bg-accent text-bg text-[14px] font-medium active:scale-[0.98]">
          Aplicar {suggestions.length === 1 ? 'a sugestão' : `as ${suggestions.length} sugestões`} no meu dia
        </button>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className={chip} onClick={() => run(addCapacity(date, nowMin, 30, entries))}>
          Tenho mais 30 min
        </button>
        <button type="button" className={chip} onClick={() => run(addCapacity(date, nowMin, -30, entries))}>
          Menos tempo
        </button>
        <button type="button" className={chip} onClick={() => run(lowerEnergy(date, nowMin, entries))}>
          Estou cansada
        </button>
        <button type="button" className={chip} onClick={() => run(replanRest(date, nowMin, entries))}>
          Replanejar o resto
        </button>
      </div>
      <form onSubmit={submit} className="mt-2">
        <input className={field} value={text} onChange={(e) => setText(e.target.value)} aria-label="Ajustar o dia (texto)" placeholder="Ex.: tenho 45 min · não quero idiomas · focar no Fashion Finder" enterKeyHint="send" />
      </form>
      {out && (
        <div role="status" className="mt-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[14px] text-ink flex items-start gap-2">
          <p className="flex-1">{out.message}</p>
          {out.undo && (
            <button
              type="button"
              className="text-[13px] text-muted underline shrink-0"
              onClick={() => {
                out.undo?.()
                setOut({ message: 'Desfeito — o dia voltou como estava.', changed: false })
              }}
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </section>
  )
}

// ─── One block ──────────────────────────────────────────────────────────────

export function BlockSheet({ row, date, nowMin, entries, label, onDone }: { row: BlockRow; date: DateKey; nowMin: number; entries?: CalendarEntry[]; label: string; onDone: (o: Outcome) => void }) {
  const navigate = useNavigate()
  const [panel, setPanel] = useState<'replanejar' | 'mais' | 'dividir' | 'adiar'>()
  const [start, setStart] = useState(row.start)
  const [dur, setDur] = useState(row.minutes)
  const [to, setTo] = useState(addDays(date, 1))
  const [steps, setSteps] = useState('')
  const c = row.c
  const isTask = row.key.startsWith('task:')

  const begin = () => {
    const o = c?.open
    if (isTask) openSheet('task', { id: row.key.slice(5) })
    else if (o?.kind === 'study') navigate(o.to ?? ROUTES.study)
    else if (o?.kind === 'routine') navigate(ROUTES.routineSettings)
    else if (o?.to) navigate(o.to)
    else if (row.key.startsWith('study:')) navigate(ROUTES.learning)
  }

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
      <p className="eyebrow text-[11px] text-muted">{label}</p>
      <h2 className="font-display text-[22px] leading-tight mt-1">{row.title}</h2>
      <p className="text-[13px] text-muted mt-1 tabular-nums">
        {row.start}–{row.end} · {formatMin(row.minutes)} · {row.state === 'sugestao' ? 'sugestão (ainda não está no teu dia)' : row.state === 'feito' ? 'feito' : row.by === 'marina' ? 'horário escolhido por ti' : 'encaixado pelo motor'}
      </p>
      {c?.reasons?.length ? <p className="text-[13.5px] text-ink-2 mt-2">{c.reasons.slice(0, 3).join(' · ')}</p> : null}
      {c?.nextStep && <p className="text-[14px] text-ink mt-2">Próximo passo: {c.nextStep}</p>}

      {row.state !== 'feito' && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" onClick={begin} className="h-11 rounded-full bg-accent text-bg text-[14.5px] font-medium active:scale-[0.98]">
            Começar
          </button>
          <button type="button" onClick={() => onDone(completeBlock(date, row))} className="h-11 rounded-full bg-surface-2 text-ink text-[14.5px] active:opacity-70">
            Concluir
          </button>
          <button type="button" onClick={() => setPanel(panel === 'replanejar' ? undefined : 'replanejar')} className="h-11 rounded-full bg-surface-2 text-ink text-[14.5px] active:opacity-70">
            Replanejar
          </button>
        </div>
      )}

      {panel === 'replanejar' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[12.5px] text-muted">
            Início
            <input type="time" className={field} value={start} onChange={(e) => setStart(e.target.value || row.start)} />
          </label>
          <label className="text-[12.5px] text-muted">
            Duração (min)
            <input type="number" min={5} max={240} step={5} className={field} value={dur} onChange={(e) => setDur(Math.max(5, Number(e.target.value) || row.minutes))} />
          </label>
          <button type="button" className={cn(chip, 'col-span-2 h-10 bg-ink text-bg')} onClick={() => onDone(moveBlock(date, row, start, dur))}>
            Salvar {start}–{minutesToHM(hmToMinutes(start) + dur)}
          </button>
          <button type="button" className={cn(chip, 'col-span-2')} onClick={() => setPanel('adiar')}>
            Outro dia…
          </button>
        </div>
      )}

      {row.state !== 'feito' && (
        <button type="button" onClick={() => setPanel(panel === 'mais' ? undefined : 'mais')} aria-expanded={panel === 'mais'} className="mt-3 h-9 inline-flex items-center gap-1.5 text-[13px] text-muted">
          <MoreHorizontal size={15} aria-hidden /> Mais opções
        </button>
      )}
      {panel === 'mais' && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {isTask && (
            <button type="button" className={chip} onClick={() => setPanel('dividir')}>
              Dividir
            </button>
          )}
          <button type="button" className={chip} onClick={() => onDone(dropBlock(date, row, 'trocar', undefined, nowMin, entries))}>
            Trocar por outra
          </button>
          <button type="button" className={chip} onClick={() => setPanel('adiar')}>
            Adiar
          </button>
          <button type="button" className={chip} onClick={() => onDone(dropBlock(date, row, 'hoje_nao'))}>
            Tirar de hoje
          </button>
        </div>
      )}
      {panel === 'adiar' && (
        <div className="mt-3 grid gap-2">
          <input type="date" className={field} value={to} min={addDays(date, 1)} onChange={(e) => setTo(e.target.value || addDays(date, 1))} aria-label="Adiar para" />
          <button type="button" className={cn(chip, 'h-10')} onClick={() => onDone(dropBlock(date, row, 'adiar', to))}>
            Adiar para {to.slice(8, 10)}/{to.slice(5, 7)}
          </button>
        </div>
      )}
      {panel === 'dividir' && (
        <div className="mt-3 grid gap-2">
          <textarea className={cn(field, 'min-h-20')} placeholder="Uma etapa por linha" value={steps} onChange={(e) => setSteps(e.target.value)} aria-label="Etapas" />
          <button
            type="button"
            disabled={!steps.trim()}
            className={cn(chip, 'h-10')}
            onClick={() => {
              const undo = split(date, row.key, steps)
              if (undo) onDone({ message: 'Etapas criadas — a primeira ficou para hoje.', changed: true, undo })
            }}
          >
            Criar etapas
          </button>
        </div>
      )}
    </div>
  )
}
