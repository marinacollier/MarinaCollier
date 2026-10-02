import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Card, ListCard, Pill } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatBRL } from '@/lib/money'
import type { MoneySummary, SearchGroup, SearchResult } from './engine'

export function EmojiBadge({ emoji, className }: { emoji?: string; className?: string }) {
  return (
    <span className={cn('h-9 w-9 rounded-xl bg-surface-2 flex items-center justify-center text-[17px] shrink-0', className)} aria-hidden>
      {emoji ?? '•'}
    </span>
  )
}

/** One tappable row: emoji, title, subtitle, chevron. Shared by search, palette and Mari. */
export function ResultRow({
  emoji,
  title,
  subtitle,
  trailing,
  onPress,
  active,
  id,
}: {
  emoji?: string
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onPress?: () => void
  active?: boolean
  id?: string
}) {
  const Comp = onPress ? 'button' : 'div'
  return (
    <Comp
      id={id}
      type={onPress ? 'button' : undefined}
      onClick={onPress}
      className={cn(
        'w-full flex items-center gap-3 min-h-[56px] py-2.5 px-3.5 text-left transition-colors',
        onPress && 'active:bg-surface-2',
        active && 'bg-surface-2',
      )}
    >
      <EmojiBadge emoji={emoji} className={active ? 'bg-surface' : undefined} />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-snug line-clamp-2">{title}</span>
        {subtitle && <span className="block text-[13px] text-muted mt-0.5 truncate">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-[13px] text-muted">{trailing}</span>}
      {onPress && <ChevronRight size={18} className="text-muted/60 shrink-0" />}
    </Comp>
  )
}

const PREVIEW = 5

export function ResultGroup({ group, onOpen, index = 0 }: { group: SearchGroup; onOpen: (r: SearchResult) => void; index?: number }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? group.results : group.results.slice(0, PREVIEW)
  const hidden = group.results.length - shown.length
  return (
    <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * 0.03 }}>
      <div className="flex items-center justify-between px-1 mt-6 mb-2">
        <h2 className="eyebrow flex items-center gap-1.5">
          <span aria-hidden className="text-[13px] tracking-normal">
            {group.emoji}
          </span>
          {group.label}
        </h2>
        <Pill>{group.results.length}</Pill>
      </div>
      <ListCard>
        {shown.map((r) => (
          <ResultRow key={r.key} emoji={r.emoji} title={r.title} subtitle={r.subtitle} onPress={() => onOpen(r)} />
        ))}
        {hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} className="w-full h-12 text-[14px] font-medium text-accent active:bg-surface-2">
            ver mais {hidden}
          </button>
        )}
      </ListCard>
    </motion.section>
  )
}

export function MoneySummaryCard({ summary, onOpen }: { summary: MoneySummary; onOpen: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card onPress={onOpen} className="mt-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">
              {summary.title} · {summary.periodLabel}
            </div>
            <div className="font-display text-[34px] leading-none tracking-tight mt-2">{formatBRL(summary.totalCents)}</div>
            <div className="text-[13px] text-muted mt-1.5">
              {summary.count === 0 ? 'nenhum gasto registrado' : summary.count === 1 ? '1 gasto' : `${summary.count} gastos`}
            </div>
          </div>
          <span className="h-10 w-10 rounded-full bg-sage-soft flex items-center justify-center text-[18px] shrink-0" aria-hidden>
            💸
          </span>
        </div>
        {summary.topCategories.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {summary.topCategories.map((c) => (
              <Pill key={c.name}>
                <span aria-hidden>{c.emoji}</span> {c.name} · {formatBRL(c.cents)}
              </Pill>
            ))}
          </div>
        )}
        <div className="text-[13px] font-medium text-accent mt-3">Abrir Dinheiro →</div>
      </Card>
    </motion.div>
  )
}
