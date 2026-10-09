import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, CreditCard, Wand2 } from 'lucide-react'
import { actions, nextOrder, useDB } from '@/data/store'
import type { Trip, TripItem, TripSection } from '@/data/types'
import { openSheet, toast } from '@/app/ui-store'
import { removeWithUndo } from '@/app/undo'
import { Button, Checkbox, EmptyState, SwipeRow } from '@/components/ui'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { formatBRL } from '@/lib/money'
import { formatLongDate } from '@/lib/date'
import {
  PAYMENT_META,
  PAYMENT_ORDER,
  STATUS_META,
  STATUS_ORDER,
  defaultChecklistItems,
  defaultStatusFor,
  groupCounts,
  groupItems,
  inSection,
  isCheckable,
  itemDateLabel,
  reviewGroups,
  reviewItems,
  statusLabel,
  tabMeta,
  type ItemStatus,
  type PaymentStatus,
} from './selectors'

function stop(onClick?: () => void) {
  return onClick
    ? (e: React.MouseEvent) => {
        e.stopPropagation()
        onClick()
      }
    : undefined
}

export function StatusPill({ status, onClick, className, review }: { status: ItemStatus; onClick?: () => void; className?: string; review?: boolean }) {
  const m = STATUS_META[status]
  const label = statusLabel(status, review)
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={stop(onClick)}
      aria-label={onClick ? `Status: ${label}. Tocar para mudar` : undefined}
      className={cn('inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0', m.cls, onClick && 'active:scale-95 transition', className)}
    >
      {label}
    </Comp>
  )
}

/** Payment has its own pill: never derived from the reservation or the itinerary. */
export function PaymentPill({ status, onClick, className }: { status: PaymentStatus; onClick?: () => void; className?: string }) {
  const m = PAYMENT_META[status]
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={stop(onClick)}
      aria-label={`Pagamento: ${m.label}${onClick ? '. Tocar para mudar' : ''}`}
      className={cn('inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0', m.cls, onClick && 'active:scale-95 transition', className)}
    >
      <CreditCard size={12.5} strokeWidth={2.2} aria-hidden />
      <span className="font-medium opacity-80">pgto</span>
      {m.label.toLowerCase()}
    </Comp>
  )
}

function setStatus(item: TripItem, status: ItemStatus) {
  actions.update('tripItems', item.id, { status })
  if (status === 'feito' || status === 'confirmado') haptic('success')
}

function ChoiceRow<T extends string>({ options, value, meta, onPick }: { options: T[]; value?: T; meta: Record<T, { label: string; cls: string }>; onPick: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1.5 pb-1 -mx-4 px-4">
      {options.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === value}
          onClick={() => onPick(s)}
          className={cn('h-9 px-3 rounded-full text-[12.5px] font-semibold shrink-0 border transition', s === value ? 'border-ink' : 'border-transparent', meta[s].cls)}
        >
          {meta[s].label}
        </button>
      ))}
    </div>
  )
}

export function ItemRow({ item, showDate, review }: { item: TripItem; showDate?: boolean; review?: boolean }) {
  const [choosing, setChoosing] = useState<'status' | 'payment' | null>(null)
  const checkable = isCheckable(item.section)
  const done = item.status === 'feito'
  const cancelled = item.status === 'cancelado'
  const toggle = (k: 'status' | 'payment') => setChoosing((c) => (c === k ? null : k))
  const section = tabMeta(item.section)
  const meta = [
    review ? `${section.emoji} ${section.label}` : undefined,
    showDate || item.endDate ? itemDateLabel(item) : undefined,
    item.time,
    item.amountCents != null ? formatBRL(item.amountCents) : undefined,
    item.confirmationCode ? `cód. ${item.confirmationCode}` : undefined,
    item.notes,
  ].filter(Boolean)
  // The check says done/confirmed; the pill only for the other states (a confirmar, cancelado…).
  const showStatusPill = item.status !== 'feito' && item.status !== 'confirmado' && item.status !== 'a_fazer'
  const statusMeta = useMemo(
    () => (review ? { ...STATUS_META, a_confirmar: { ...STATUS_META.a_confirmar, label: statusLabel('a_confirmar', true) } } : STATUS_META),
    [review],
  )

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
          {/* Every line has a check (no sheet, no confirm): to-dos → feito; bookings/flights/stays → confirmado. */}
          <Checkbox
            checked={done || item.status === 'confirmado'}
            label={item.title}
            className="ml-0.5"
            onChange={(v) => {
              const before = item.status
              setStatus(item, v ? (checkable ? 'feito' : 'confirmado') : checkable ? 'a_fazer' : 'a_confirmar')
              if (v) haptic('success')
              toast(v ? (checkable ? `${item.title} ✓` : `${item.title}: confirmado ✓`) : `${item.title}: desmarcado`, { action: { label: 'Desfazer', run: () => actions.update('tripItems', item.id, { status: before }) } })
            }}
          />
          <button type="button" className="flex-1 min-w-0 text-left py-1" onClick={() => openSheet('tripItem', { id: item.id })}>
            <div className={cn('text-[15px] leading-snug', (done || cancelled) && 'text-muted line-through decoration-muted/50')}>{item.title}</div>
            {meta.length > 0 && <div className="text-[12.5px] text-muted mt-0.5 line-clamp-2">{meta.join(' · ')}</div>}
          </button>
          {(showStatusPill || item.paymentStatus) && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              {showStatusPill && <StatusPill status={item.status} review={review} onClick={() => toggle('status')} />}
              {item.paymentStatus && <PaymentPill status={item.paymentStatus} onClick={() => toggle('payment')} />}
            </div>
          )}
          {!showStatusPill && (
            <button type="button" aria-label="Mudar status" onClick={() => toggle('status')} className="h-11 w-6 -mr-1 text-muted/70 text-lg leading-none">
              ⋯
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {choosing && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
              {choosing === 'status' ? (
                <ChoiceRow
                  options={STATUS_ORDER}
                  value={item.status}
                  meta={statusMeta}
                  onPick={(s) => {
                    setStatus(item, s)
                    setChoosing(null)
                  }}
                />
              ) : (
                <>
                  <div className="text-[11.5px] text-muted pt-1.5 px-0.5">Pagamento</div>
                  <ChoiceRow
                    options={PAYMENT_ORDER}
                    value={item.paymentStatus}
                    meta={PAYMENT_META}
                    onPick={(p) => {
                      actions.update('tripItems', item.id, { paymentStatus: p })
                      if (p === 'pago') haptic('success')
                      setChoosing(null)
                    }}
                  />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SwipeRow>
  )
}

/** Horizontal sub-area filter ("Cape Town", "Safari", …). Hidden when there's nothing to filter. */
export function GroupChips({ groups, value, onChange }: { groups: { group: string; count: number }[]; value?: string; onChange: (g?: string) => void }) {
  if (groups.length < 2 && !value) return null
  const options: { group?: string; count: number }[] = [{ count: 0 }, ...groups]
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 py-0.5" role="group" aria-label="Filtrar por sub-área">
      {options.map(({ group, count }) => {
        const active = value === group
        return (
          <button
            key={group ?? '_all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? undefined : group)}
            className={cn(
              'inline-flex items-center gap-1 h-9 px-3 rounded-full text-[13px] shrink-0 border transition active:scale-[0.97]',
              active ? 'bg-ink text-bg border-ink font-semibold' : 'bg-surface border-line text-ink-2',
            )}
          >
            {group ?? 'Tudo'}
            {group && <span className={cn('text-[11px] tabular-nums', active ? 'opacity-70' : 'text-muted')}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

function QuickAdd({ trip, section, groups, items, initialGroup }: { trip: Trip; section: TripSection; groups: string[]; items: TripItem[]; initialGroup?: string }) {
  const [text, setText] = useState('')
  const [group, setGroup] = useState<string | undefined>(initialGroup)
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
              className={cn('h-8 px-3 rounded-full text-[12.5px] shrink-0 border transition', group === g ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2')}
            >
              {g ?? 'geral'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** One TripItem-backed section: quick add, sub-area filter, grouped list, swipe + status chooser. */
export function SectionItems({
  trip,
  section,
  items,
  group,
  onGroup,
}: {
  trip: Trip
  section: TripSection
  items: TripItem[]
  group?: string
  onGroup: (g?: string) => void
}) {
  const pets = useDB((db) => db.pets)
  const petNames = useMemo(() => pets.map((p) => p.name), [pets])
  const inThis = useMemo(() => items.filter((i) => inSection(i, section)), [items, section])
  const chips = useMemo(() => groupCounts(inThis), [inThis])
  const activeGroup = group && chips.some((c) => c.group === group) ? group : undefined
  const visible = useMemo(() => (activeGroup ? inThis.filter((i) => i.group === activeGroup) : inThis), [inThis, activeGroup])
  const groups = useMemo(() => groupItems(visible, section), [visible, section])
  const groupNames = useMemo(() => {
    const names = new Set<string>()
    for (const i of items) if (i.group) names.add(i.group)
    return [...names]
  }, [items])
  const meta = tabMeta(section)
  const empty = groups.length === 0

  const useDefaults = () => {
    const list = defaultChecklistItems(trip, items, nextOrder(items), petNames)
    if (!list.length) return toast('O checklist padrão já está aqui ✓')
    actions.createMany('tripItems', list)
    haptic('success')
    toast(`${list.length} itens adicionados ✨`)
  }

  return (
    <div className="space-y-4">
      <QuickAdd key={activeGroup ?? '_'} trip={trip} section={section} groups={groupNames} items={items} initialGroup={activeGroup} />

      <GroupChips groups={chips} value={activeGroup} onChange={onGroup} />

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

      {!empty && section === 'antes_de_ir' && defaultChecklistItems(trip, items, 0, petNames).length > 0 && (
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

/** Revisar: every a_confirmar item of the trip, grouped by sub-area, filterable by sub-area. */
export function ReviewItems({ items, group, onGroup }: { items: TripItem[]; group?: string; onGroup: (g?: string) => void }) {
  const all = useMemo(() => reviewItems(items), [items])
  const chips = useMemo(() => groupCounts(all), [all])
  const activeGroup = group && chips.some((c) => c.group === group) ? group : undefined
  const groups = useMemo(() => reviewGroups(items, activeGroup), [items, activeGroup])

  if (!all.length) {
    return (
      <div className="card">
        <EmptyState compact emoji="🌿" title="Nada pra revisar" text="Tudo que estava “a confirmar” já foi resolvido. Leveza ✨" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="px-1 text-[13.5px] text-ink-2">
        <b className="font-semibold text-ink">{all.length}</b> {all.length === 1 ? 'coisa' : 'coisas'} pra revisar quando der — nada aqui é dado como certo.
      </p>
      <GroupChips groups={chips} value={activeGroup} onChange={onGroup} />
      {groups.map((g, gi) => (
        <motion.section key={g.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.03 }}>
          <div className="flex items-center justify-between px-1 mb-2">
            <h3 className="eyebrow">{g.label}</h3>
            <span className="text-[12px] text-muted tabular-nums">{g.items.length}</span>
          </div>
          <div className="card overflow-hidden divide-y divide-line/70">
            {g.items.map((i) => (
              <ItemRow key={i.id} item={i} review showDate />
            ))}
          </div>
        </motion.section>
      ))}
      <p className="text-center text-[12px] text-muted">toque em “Revisar” para mudar o status · deslize → para confirmar</p>
    </div>
  )
}
