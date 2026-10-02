import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { Priority, Project, ProjectStatus } from '@/data/types'
import { cn } from '@/lib/cn'
import { tone } from '@/components/ui'
import { PRIORITY, PROJECT_STATUS } from './constants'

export function PriorityDot({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      role="img"
      aria-label={PRIORITY[priority].label}
      title={PRIORITY[priority].label}
      className={cn('inline-block h-2 w-2 rounded-full shrink-0', PRIORITY[priority].dot, className)}
    />
  )
}

export function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap', PROJECT_STATUS[status].cls, className)}>
      {PROJECT_STATUS[status].label}
    </span>
  )
}

export function ProjectEmoji({ project, size = 'md' }: { project: Pick<Project, 'emoji' | 'tone'>; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-14 w-14 text-[28px] rounded-[18px]' : size === 'md' ? 'h-11 w-11 text-[22px] rounded-2xl' : 'h-7 w-7 text-[15px] rounded-lg'
  return (
    <span className={cn('inline-flex items-center justify-center shrink-0', tone(project.tone).soft, dim)} aria-hidden>
      {project.emoji || '💼'}
    </span>
  )
}

/** Small tinted label. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center h-[22px] px-2 rounded-full text-[11.5px] font-medium whitespace-nowrap bg-surface-2 text-ink-2', className)}>
      {children}
    </span>
  )
}

/** Section: eyebrow title, optional count, and a list capped at `limit` with "ver tudo". */
export function CappedList<T>({
  items,
  limit = 4,
  render,
  className,
}: {
  items: T[]
  limit?: number
  render: (item: T, index: number) => ReactNode
  className?: string
}) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, limit)
  return (
    <div className={className}>
      {shown.map((it, i) => render(it, i))}
      {items.length > limit && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="w-full h-11 flex items-center justify-center gap-1 text-[13px] text-muted active:text-ink"
        >
          {all ? 'ver menos' : `ver tudo (${items.length})`}
          <ChevronDown size={14} className={cn('transition-transform', all && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/**
 * Tap-to-edit text. Shows the value (or a soft placeholder); tapping turns it into an input.
 * Saves on blur / Enter (single line). Escape cancels.
 */
export function InlineEdit({
  value,
  onSave,
  placeholder,
  multiline,
  className,
  label,
}: {
  value: string | undefined
  onSave: (v: string | undefined) => void
  placeholder: string
  multiline?: boolean
  className?: string
  label: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])
  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v !== (value ?? '').trim()) onSave(v || undefined)
  }
  if (!editing)
    return (
      <button
        type="button"
        aria-label={`Editar ${label}`}
        onClick={() => {
          setDraft(value ?? '')
          setEditing(true)
        }}
        className={cn(
          'w-full text-left min-h-11 py-2 rounded-xl -mx-1 px-1 active:bg-surface-2 transition-colors whitespace-pre-wrap',
          value ? 'text-ink' : 'text-muted/80',
          className,
        )}
      >
        {value || placeholder}
      </button>
    )
  const common = {
    value: draft,
    'aria-label': label,
    placeholder,
    onBlur: commit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setEditing(false)
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault()
        commit()
      }
    },
  }
  return multiline ? (
    <textarea ref={ref} rows={4} className="input resize-none leading-relaxed" {...common} />
  ) : (
    <input ref={ref} className="input" {...common} />
  )
}

/** Inline "add a line" input with a submit on Enter. */
export function AddLine({ placeholder, onAdd, className }: { placeholder: string; onAdd: (text: string) => void; className?: string }) {
  const [text, setText] = useState('')
  return (
    <form
      className={cn('flex items-center gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault()
        const v = text.trim()
        if (!v) return
        onAdd(v)
        setText('')
      }}
    >
      <input className="input flex-1" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} aria-label={placeholder} />
      <button
        type="submit"
        disabled={!text.trim()}
        className="h-11 px-4 rounded-full bg-ink text-bg text-[14px] font-medium disabled:opacity-30 shrink-0"
      >
        Adicionar
      </button>
    </form>
  )
}
