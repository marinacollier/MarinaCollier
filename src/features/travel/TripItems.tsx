import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Wand2 } from 'lucide-react'
import { actions, nextOrder } from '@/data/store'
import type { Trip, TripItem, TripSection } from '@/data/types'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { Button, Checkbox, EmptyState, SwipeRow } from '@/components/ui'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { formatBRL } from '@/lib/money'
import { formatLongDate, formatShortDate } from '@/lib/date'
import {
  STATUS_META,
  STATUS_ORDER,
  defaultChecklistItems,
  defaultStatusFor,
  groupItems,
  isCheckable,
  tabMeta,
  type ItemStatus,
} from './selectors'

export function StatusPill({ status, onClick, className }: { status: ItemStatus; onClick?: () => void; className?: string }) {
  const m = STATUS_META[status]
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={
        onClick
          ? (e: React.MouseEvent) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
      aria-label={onClick ? `Status: ${m.label}. Tocar para mudar` : undefined}
      className={cn('inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0', m.cls, onClick && 'active:scale-95 transition', className)}
    >
      {m.label}
    </Comp>
  )
}

function setStatus(item: TripItem, status: ItemStatus) {
  actions.update('tripItems', item.id, { status })
  if (status === 'feito' || status === 'confirmado') haptic('success')
}

function ItemRow({ item, showDate }: { item: TripItem; showDate?: boolean }) {
  const [choosing, setChoosing] = useState(false)
  const checkable = isCheckable(item.section)
  const done = item.status === 'feito'
  const cancelled = item.status === 'cancelado'
  const meta = [
    showDate && item.date ? formatShortDate(item.date) : undefined,
    item.time,
    item.amountCents != null ? formatBRL(item.amountCents) : undefined,
    item.confirmationCode ? `cód. ${item.confirmationCode}` : undefined,
    item.notes,
  ].filter(Boolean)

  return (
    <SwipeRow
      className="rounded-none"
      completeLabel={checkable ? 'Feito' : 'Confirmado'}
      onComplete={() => {
        setStatus(item, checkable ? 'feito' : 'confirmado')
        toast(checkable ? 'Feito ✓' : 'Confirmado ✓')
      }}
      onDelete={() => removeWithUndo('tripItems', item.id, 'Item apagado')}
    >
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-3 min-h-11">
          {checkable && (
            <Checkbox
              checked={done}
              label={item.title}
              className="ml-0.5"
              onChange={(v) => {
                setStatus(item, v ? 'feito' : 'a_fazer')
                if (v) haptic('success')
              }}
            />
          )}
          <button type="button" className="flex-1 min-w-0 text-left py-1" onClick={() => openSheet('tripItem', { id: item.id })}>
            <div className={cn('text-[15px] leading-snug', (done || cancelled) && 'text-muted line-through decoration-muted/50')}>{item.title}</div>
            {meta.length > 0 && <div className="text-[12.5px] text-muted mt-0.5 truncate">{meta.join(' · ')}</div>}
          </button>
          {(!checkable || item.status === 'a_confirmar' || cancelled) && <StatusPill status={item.status} onClick={() => setChoosing((c) => !c)} />}
          {checkable && item.status !== 'a_confirmar' && !cancelled && (
            <button type="button" aria-label="Mudar status" onClick={() => setChoosing((c) => !c)} className="h-11 w-6 -mr-1 text-muted/70 text-lg leading-none">
              ⋯
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {choosing && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1.5 pb-1 -mx-4 px-4">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatus(item, s)
                      setChoosing(false)
                    }}
                    className={cn(
                      'h-9 px-3 rounded-full text-[12.5px] font-semibold shrink-0 border transition',
                      s === item.status ? 'border-ink' : 'border-transparent',
                      STATUS_META[s].cls,
                    )}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SwipeRow>
  )
}

function QuickAdd({ trip, section, groups, items }: { trip: Trip; section: TripSection; groups: string[]; items: TripItem[] }) {
  const [text, setText] = useState('')
  const [group, setGroup] = useState<string | undefined>(undefined)
  const meta = tabMeta(section)
  const add = () => {
    const title = text.trim()
    if (!title) return
    actions.create('tripItems', { tripId: trip.id, section, group, title, status: defaultStatusFor(section), order: nextOrder(items) })
    setText('')
    haptic('light')
  }
  return (
    <div className="card p-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={meta.placeholder ?? 'Adicionar…'}
          aria-label={`Adicionar em ${meta.label}`}
          enterKeyHint="done"
          className="flex-1 min-w-0 bg-transparent outline-none h-11 px-2.5 placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Adicionar"
          disabled={!text.trim()}
          className="h-10 w-10 rounded-full bg-ink text-bg inline-flex items-center justify-center shrink-0 disabled:opacity-30 transition"
        >
          <ArrowUp size={18} />
        </button>
      </form>
      {groups.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-1 pt-1 pb-0.5">
          <span className="text-[12px] text-muted self-center shrink-0 pr-0.5">em</span>
          {[undefined, ...groups].map((g) => (
            <button
              key={g ?? '_'}
              type="button"
              onClick={() => setGroup(g)}
              className={cn(
                'h-8 px-3 rounded-full text-[12.5px] shrink-0 border transition',
                group === g ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2',
              )}
            >
              {g ?? 'geral'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One TripItem-backed section: quick add, grouped list, swipe + status chooser. */
export function SectionItems({ trip, section, items }: { trip: Trip; section: TripSection; items: TripItem[] }) {
  const groups = useMemo(() => groupItems(items, section), [items, section])
  const groupNames = useMemo(() => {
    const names = new Set<string>()
    for (const i of items) if (i.group) names.add(i.group)
    return [...names]
  }, [items])
  const meta = tabMeta(section)
  const empty = groups.length === 0

  const useDefaults = () => {
    const list = defaultChecklistItems(trip, items, nextOrder(items))
    if (!list.length) return toast('O checklist padrão já está aqui ✓')
    actions.createMany('tripItems', list)
    haptic('success')
    toast(`${list.length} itens adicionados ✨`)
  }

  return (
    <div className="space-y-4">
      <QuickAdd trip={trip} section={section} groups={groupNames} items={items} />

      {empty && (
        <div className="card">
          <EmptyState
            compact
            emoji={meta.emoji}
            title={meta.empty ?? 'Nada por aqui ainda'}
            text={section === 'antes_de_ir' ? 'Quer começar com o checklist de sempre? Dá pra editar tudo depois.' : 'Escreve acima e pronto — detalhes depois, se quiser.'}
            action={
              section === 'antes_de_ir' ? (
                <Button variant="soft" size="sm" icon={<Wand2 size={15} />} onClick={useDefaults}>
                  usar checklist padrão
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {groups.map((g, gi) => (
        <motion.section key={g.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.04 }}>
          {g.label && (
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="eyebrow">{g.key.startsWith('d:') ? formatLongDate(g.label) : g.label}</h3>
              <button
                type="button"
                className="text-[12.5px] text-muted h-8 px-1"
                onClick={() => openSheet('tripItem', { tripId: trip.id, section, group: g.key.startsWith('g:') ? g.label : undefined })}
              >
                + item
              </button>
            </div>
          )}
          <div className="card overflow-hidden divide-y divide-line/70">
            {g.items.map((i) => (
              <ItemRow key={i.id} item={i} showDate={section !== 'roteiro' || !g.key.startsWith('d:')} />
            ))}
          </div>
        </motion.section>
      ))}

      {!empty && section === 'antes_de_ir' && defaultChecklistItems(trip, items).length > 0 && (
        <div className="text-center">
          <Button variant="ghost" size="sm" icon={<Wand2 size={15} />} onClick={useDefaults}>
            completar com o checklist padrão
          </Button>
        </div>
      )}
      {!empty && <p className="text-center text-[12px] text-muted">deslize → para {meta.checkable ? 'marcar feito' : 'confirmar'} · ← para apagar</p>}
    </div>
  )
}
