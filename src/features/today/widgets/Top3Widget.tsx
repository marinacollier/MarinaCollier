import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Plus } from 'lucide-react'
import { openSheet, toast } from '@/app/ui-store'
import { Button, Checkbox, IconButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { MAX_PRIORITIES, prioritiesOf, setPriorityDone } from '../priorities'
import { refLabel } from '../refs'
import { Widget, type WidgetCtx } from './shared'

export function Top3Widget({ ctx }: { ctx: WidgetCtx }) {
  const { db, today } = ctx
  const list = useMemo(() => prioritiesOf(db, today).slice(0, MAX_PRIORITIES), [db, today])
  const doneCount = list.filter((p) => p.done).length
  const edit = () => openSheet('priorities', { date: today })

  return (
    <Widget
      id="top3"
      eyebrow="Minhas 3 prioridades de hoje"
      action={
        list.length > 0 ? (
          <IconButton label="Editar prioridades" size="md" onClick={edit}>
            <Pencil size={16} />
          </IconButton>
        ) : undefined
      }
    >
      {list.length === 0 ? (
        <div className="py-2">
          <p className="font-display text-[20px] leading-snug">Quais 3 coisas fariam o dia valer?</p>
          <p className="text-[14px] text-muted mt-1">Só três. O resto pode esperar.</p>
          <Button variant="primary" size="sm" className="mt-3.5" icon={<Plus size={15} />} onClick={edit}>
            Escolher minhas 3
          </Button>
        </div>
      ) : (
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
                      toast(remaining === 0 ? 'As 3 de hoje: feitas ✨' : 'Uma a menos ✓', { tone: remaining === 0 ? 'win' : 'default' })
                    }
                  }}
                />
                <span className={cn('font-display text-[15px] w-4 text-center shrink-0 transition-colors', p.done ? 'text-muted/60' : 'text-accent')}>{i + 1}</span>
                <button type="button" onClick={edit} className="flex-1 min-w-0 text-left py-1.5">
                  <span className={cn('block text-[16px] leading-snug transition-colors', p.done && 'text-muted line-through decoration-muted/40')}>{p.title}</span>
                  {sub && <span className="block text-[12.5px] text-muted mt-0.5 truncate">{sub}</span>}
                </button>
              </motion.li>
            )
          })}
          {list.length < MAX_PRIORITIES && (
            <li>
              <button type="button" onClick={edit} className="w-full flex items-center gap-3 px-1 min-h-[48px] text-[14px] text-muted active:opacity-70">
                <span className="h-6 w-6 rounded-full border-[1.5px] border-dashed border-muted/50 inline-flex items-center justify-center ml-[-2px]">
                  <Plus size={13} />
                </span>
                adicionar ({list.length} de {MAX_PRIORITIES})
              </button>
            </li>
          )}
        </ol>
      )}
      {list.length === MAX_PRIORITIES && doneCount === MAX_PRIORITIES && (
        <p className="text-[13px] text-sage font-medium mt-1 px-0.5">Dia ganho. O que vier agora é bônus ✨</p>
      )}
    </Widget>
  )
}
