import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronDown, Plus, X } from 'lucide-react'
import type { Link, Tone } from '@/data/types'
import { IconButton, TextInput, tone as toneOf } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * Vertical pipeline: stages with items render as sections; consecutive empty stages
 * merge into one quiet line ("Ideia · Contato — vazias").
 */
export function StageList<S extends string, T>({
  groups,
  collapsed,
  render,
}: {
  groups: { meta: { value: S; label: string; emoji: string; tone: Tone }; items: T[] }[]
  collapsed: ReadonlySet<string>
  render: (item: T, index: number) => ReactNode
}) {
  const out: ReactNode[] = []
  let run: string[] = []
  const flush = () => {
    if (!run.length) return
    out.push(
      <div key={`empty-${run[0]}`} className="flex items-center gap-2.5 px-1 min-h-9 py-1 text-[13px] text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-line shrink-0" aria-hidden />
        <span>
          <span className="text-ink-2/80">{run.join(' · ')}</span>
          <span className="opacity-80"> — {run.length === 1 ? 'vazia' : 'vazias'}</span>
        </span>
      </div>,
    )
    run = []
  }
  for (const { meta, items } of groups) {
    if (items.length === 0) {
      run.push(meta.label)
      continue
    }
    flush()
    out.push(
      <StageGroup key={meta.value} label={meta.label} emoji={meta.emoji} tone={meta.tone} count={items.length} collapsible={collapsed.has(meta.value)}>
        {items.map(render)}
      </StageGroup>,
    )
  }
  flush()
  return <div className="space-y-0.5">{out}</div>
}

const TAG_TONE: Record<'neutral' | 'soon' | 'money' | 'barter' | 'link' | 'done', string> = {
  neutral: 'bg-surface-2 text-ink-2',
  soon: 'bg-accent-soft text-accent',
  money: 'bg-sage-soft text-ink-2',
  barter: 'bg-sand-soft text-ink-2',
  link: 'bg-ocean-soft text-ocean',
  done: 'bg-sage-soft text-ink-2',
}

/** Small label on cards (own component so tone classes never fight the Pill defaults). */
export function Tag({ tone = 'neutral', children }: { tone?: keyof typeof TAG_TONE; children: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap', TAG_TONE[tone])}>{children}</span>
}

/**
 * A pipeline stage as a vertical section.
 * - empty → one quiet line
 * - collapsible stages start closed and show only a count
 */
export function StageGroup({
  label,
  emoji,
  tone,
  count,
  collapsible,
  emptyText = 'nada aqui por enquanto',
  children,
}: {
  label: string
  emoji: string
  tone: Tone
  count: number
  collapsible?: boolean
  emptyText?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(!collapsible)
  const t = toneOf(tone)

  if (count === 0) {
    return (
      <div className="flex items-center gap-2.5 px-1 h-9 text-[13px] text-muted">
        <span className={cn('h-1.5 w-1.5 rounded-full opacity-50', t.dot)} aria-hidden />
        <span className="font-medium text-ink-2/70">{label}</span>
        <span className="opacity-70">· {emptyText}</span>
      </div>
    )
  }

  const header = (
    <>
      <span className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[14px] shrink-0', t.soft)} aria-hidden>
        {emoji}
      </span>
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      <span className="text-[13px] text-muted">{count}</span>
      {collapsible && <ChevronDown size={16} className={cn('ml-auto text-muted transition-transform', open && 'rotate-180')} />}
    </>
  )

  return (
    <section className="pt-3 first:pt-0">
      {collapsible ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-2.5 px-1 h-11 text-left">
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-1 h-11">{header}</div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Small "→ Próxima etapa" button used on cards. Stops the card tap. */
export function AdvanceButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={`Avançar para ${label}`}
      className="shrink-0 inline-flex items-center gap-1 h-11 pl-3 pr-2.5 -my-1 -mr-1.5 rounded-full text-[12.5px] font-medium text-ink-2 active:bg-surface-2 transition"
    >
      <span className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-surface-2">
        {label}
        <ArrowRight size={14} />
      </span>
    </button>
  )
}

/** Editable list of links (label + url). */
export function LinksEditor({ value, onChange }: { value: Link[]; onChange: (v: Link[]) => void }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const add = () => {
    const u = url.trim()
    if (!u) return
    const full = /^https?:\/\//i.test(u) ? u : `https://${u}`
    onChange([...value, { url: full, label: label.trim() || prettyUrl(full) }])
    setUrl('')
    setLabel('')
  }
  return (
    <div className="space-y-2">
      {value.map((l, i) => (
        <div key={`${l.url}-${i}`} className="flex items-center gap-2 rounded-xl bg-surface-2 pl-3.5">
          <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 py-2.5">
            <span className="block text-[14px] truncate">{l.label}</span>
            <span className="block text-[12px] text-muted truncate">{prettyUrl(l.url)}</span>
          </a>
          <IconButton label="Remover link" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X size={16} />
          </IconButton>
        </div>
      ))}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0 space-y-2">
          <TextInput
            type="url"
            inputMode="url"
            placeholder="cole um link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          />
          {url.trim() && <TextInput placeholder="nome (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />}
        </div>
        <IconButton label="Adicionar link" variant="soft" onClick={add} disabled={!url.trim()} className="mt-0.5 disabled:opacity-40">
          <Plus size={18} />
        </IconButton>
      </div>
    </div>
  )
}

export function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

/** Like <Field/> but a <div>: a <label> wrapping several buttons forwards taps to the first one. */
export function Group({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">{label}</div>
      {children}
      {hint && <div className="text-[12px] text-muted mt-1 px-0.5">{hint}</div>}
    </div>
  )
}
