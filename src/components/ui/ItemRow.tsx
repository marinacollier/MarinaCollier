/**
 * THE row. Every list of "coisas a fazer" in the app (Home, spaces, UGC, viagem, Bíblia…) uses this one,
 * so the type, the check and the spacing are the same everywhere:
 *   [check]  Title                                  [time]
 *            one quiet line (area tag · the single most useful fact)
 * - check: the same round Checkbox; omit `onCheck` for rows that are only information.
 * - area: a small colored tag (Vida, Trabalho, Corpo…) — the only color on the row besides the priority dot.
 * - priority: a dot before the title (1 = alta, 2 = média) — never "P1" as text.
 * - tapping the row (not the check) opens it for editing (`onOpen`) or navigates (`to`).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Checkbox } from './Checkbox'

export type RowArea = 'vida' | 'trabalho' | 'corpo' | 'creator' | 'casa' | 'dinheiro' | 'viagem' | 'estudo' | 'fe' | 'luna' | 'outro'

export const AREA_TAG: Record<RowArea, { label: string; cls: string }> = {
  vida: { label: 'Vida', cls: 'text-sage' },
  trabalho: { label: 'Trabalho', cls: 'text-ocean' },
  corpo: { label: 'Corpo', cls: 'text-accent' },
  creator: { label: 'Creator', cls: 'text-plum' },
  casa: { label: 'Casa', cls: 'text-sand' },
  dinheiro: { label: 'Dinheiro', cls: 'text-sand' },
  viagem: { label: 'Viagem', cls: 'text-ocean' },
  estudo: { label: 'Estudo', cls: 'text-plum' },
  fe: { label: 'Fé', cls: 'text-plum' },
  luna: { label: 'Luna', cls: 'text-sage' },
  outro: { label: '', cls: 'text-muted' },
}

export interface ItemRowProps {
  title: string
  /** One short fact (≤ ~5 words): "atrasado desde 10/10", "Breevo", "30 min". */
  meta?: string
  area?: RowArea
  /** Right side: a time ("07:00") or a short date ("ter"). */
  when?: string
  /** 1 = alta, 2 = média; undefined = normal. */
  priority?: 1 | 2
  /** Overdue / attention: the meta turns warm. */
  late?: boolean
  checked?: boolean
  onCheck?: (next: boolean) => void
  onOpen?: () => void
  to?: string
  /** Optional trailing control (chevron, menu…). */
  trailing?: ReactNode
  className?: string
}

export function ItemRow({ title, meta, area, when, priority, late, checked, onCheck, onOpen, to, trailing, className }: ItemRowProps) {
  const tag = area ? AREA_TAG[area] : undefined
  const body = (
    <span className="flex-1 min-w-0 py-2.5">
      <span className={cn('flex items-baseline gap-1.5 text-[15.5px] leading-snug', checked && 'line-through text-muted')}>
        {priority && <span aria-label={priority === 1 ? 'prioridade alta' : 'prioridade média'} className={cn('h-1.5 w-1.5 rounded-full shrink-0 self-center', priority === 1 ? 'bg-accent' : 'bg-sand')} />}
        <span className="line-clamp-2 break-words">{title}</span>
      </span>
      {(tag?.label || meta) && (
        <span className="block text-[12.5px] leading-snug mt-0.5 truncate">
          {tag?.label && <span className={cn('font-medium', tag.cls)}>{tag.label}</span>}
          {tag?.label && meta && <span className="text-muted"> · </span>}
          {meta && <span className={late && !checked ? 'text-accent' : 'text-muted'}>{meta}</span>}
        </span>
      )}
    </span>
  )
  const open = to ? (
    <Link to={to} className="flex-1 min-w-0 flex items-center gap-2 active:opacity-70">
      {body}
    </Link>
  ) : onOpen ? (
    <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-2 text-left active:opacity-70">
      {body}
    </button>
  ) : (
    body
  )
  return (
    <li className={cn('flex items-center gap-3 min-h-[52px]', className)}>
      {onCheck ? <Checkbox checked={!!checked} onChange={onCheck} label={checked ? `Desmarcar ${title}` : `Concluir: ${title}`} className="ml-0.5" /> : <span className="w-6 shrink-0" aria-hidden />}
      {open}
      {when && <span className={cn('text-[13px] tabular-nums shrink-0', checked ? 'text-muted' : 'text-ink-2')}>{when}</span>}
      {trailing}
    </li>
  )
}

/** A list of ItemRows with the standard hairline divider. */
export function ItemList({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn('divide-y divide-line/60', className)}>
      {children}
    </ul>
  )
}
