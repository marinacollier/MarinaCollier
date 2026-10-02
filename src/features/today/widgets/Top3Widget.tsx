import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, Plus } from 'lucide-react'
import { toast } from '@/app/ui-store'
import { Button, Checkbox, IconButton } from '@/components/ui'
import type { DayPriority, DB } from '@/data/types'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { DOMAINS, MAX_PRIORITIES, prioritiesOf, setPriorityDone, type PriorityList } from '../priorities'
import { openPriorities } from '../open-priorities'
import { refLabel } from '../refs'
import { Widget, type WidgetCtx } from './shared'

function PriorityRows({ db, list, index = true, onEdit }: { db: DB; list: DayPriority[]; index?: boolean; onEdit: () => void }) {
  return (
    <ol className="-mx-1">
      {list.map((p, i) => {
        const sub = refLabel(db, p.ref)
        return (
          <motion.li key={p.id} layout className="flex items-center gap-3 px-1 min-h-[52px]">
            <Checkbox
              checked={p.done}
              label={`Concluir ${p.title}`}
              onChange={(v) => {
                setPriorityDone(p.id, v)
                if (v) {
                  haptic('success')
                  const remaining = list.filter((x) => !x.done && x.id !== p.id).length
                  toast(remaining === 0 && list.length === MAX_PRIORITIES ? 'As 3 de hoje: feitas ✨' : 'Uma a menos ✓', { tone: remaining === 0 ? 'win' : 'default' })
                }
              }}
            />
            {index && <span className={cn('font-display text-[15px] w-4 text-center shrink-0 transition-colors', p.done ? 'text-muted/60' : 'text-accent')}>{i + 1}</span>}
            <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left py-1.5">
              <span className={cn('block text-[16px] leading-snug transition-colors', p.done && 'text-muted line-through decoration-muted/40')}>{p.title}</span>
              {sub && <span className="block text-[12.5px] text-muted mt-0.5 truncate">{sub}</span>}
            </button>
          </motion.li>
        )
      })}
    </ol>
  )
}

export function Top3Widget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today, home } = ctx
  const low = home.mode === 'baixa'
  const main = useMemo(() => prioritiesOf(db, today).slice(0, MAX_PRIORITIES), [db, today])
  const domains = useMemo(
    () => DOMAINS.filter((d) => d.value !== 'main').map((d) => ({ ...d, list: prioritiesOf(db, today, d.value).slice(0, MAX_PRIORITIES) })),
    [db, today],
  )
  const [peek, setPeek] = useState<PriorityList | undefined>()
  const edit = (list: PriorityList = 'main') => openPriorities(today, list)

  // Energy baixa: ONE priority, nothing else.
  const shown = low ? main.filter((p) => !p.done).slice(0, 1) : main
  const doneCount = main.filter((p) => p.done).length
  const peeked = domains.find((d) => d.value === peek)

  return (
    <Widget
      id="top3"
      eyebrow={low ? 'Só uma coisa hoje' : 'Top 3 de hoje'}
      action={
        main.length > 0 && !low ? (
          <IconButton label="Editar prioridades" size="md" onClick={() => edit()}>
            <Pencil size={16} />
          </IconButton>
        ) : undefined
      }
    >
      {main.length === 0 ? (
        <div className="py-1">
          <p className="font-display text-[21px] leading-snug">O que realmente importa hoje?</p>
          <p className="text-[14px] text-muted mt-1">Escolhe três. O resto pode esperar.</p>
          <Button variant="primary" size="sm" className="mt-3.5" icon={<Plus size={15} />} onClick={() => edit()}>
            Escolher 3
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-[15px] text-ink-2 py-1">O que importava hoje já foi ✨ Agora é só ir com calma.</p>
      ) : (
        <>
          <PriorityRows db={db} list={shown} index={!low} onEdit={() => edit()} />
          {!low && main.length < MAX_PRIORITIES && (
            <button type="button" onClick={() => edit()} className="w-full flex items-center gap-3 px-0 min-h-[48px] text-[14px] text-muted active:opacity-70">
              <span className="h-6 w-6 rounded-full border-[1.5px] border-dashed border-muted/50 inline-flex items-center justify-center">
                <Plus size={13} />
              </span>
              adicionar ({main.length} de {MAX_PRIORITIES})
            </button>
          )}
        </>
      )}
      {!low && main.length === MAX_PRIORITIES && doneCount === MAX_PRIORITIES && (
        <p className="text-[13px] text-sage font-medium mt-1 px-0.5">Dia ganho. O que vier agora é bônus ✨</p>
      )}

      {!low && (
        <div className="mt-2 -mb-1.5 pt-1 border-t border-line/60">
          <div className="flex items-center gap-1 -mx-1.5" role="tablist" aria-label="Top 3 por área">
            {domains.map((d, i) => (
              <span key={d.value} className="inline-flex items-center">
                {i > 0 && <span className="text-muted/50 text-[12px]" aria-hidden>·</span>}
                <button
                  type="button"
                  role="tab"
                  aria-selected={peek === d.value}
                  onClick={() => setPeek((p) => (p === d.value ? undefined : d.value))}
                  className={cn('h-10 px-2 text-[13px] transition-colors', peek === d.value ? 'text-ink font-semibold' : 'text-muted')}
                >
                  {d.label}
                  {d.list.length > 0 && <span className="ml-1 tabular-nums text-[11.5px] opacity-70">{d.list.filter((p) => !p.done).length || '✓'}</span>}
                </button>
              </span>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {peeked && (
              <motion.div key={peeked.value} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                <div className="pb-2">
                  {peeked.list.length === 0 ? (
                    <button type="button" onClick={() => edit(peeked.value)} className="w-full text-left min-h-[44px] text-[14px] text-ink-2 active:opacity-70">
                      {peeked.emoji} Nada escolhido em {peeked.label.toLowerCase()}. <span className="text-accent font-medium">Escolher até 3</span>
                    </button>
                  ) : (
                    <>
                      <PriorityRows db={db} list={peeked.list} index={false} onEdit={() => edit(peeked.value)} />
                      <button type="button" onClick={() => edit(peeked.value)} className="h-10 text-[13px] font-medium text-accent">
                        editar {peeked.label.toLowerCase()}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Widget>
  )
}
