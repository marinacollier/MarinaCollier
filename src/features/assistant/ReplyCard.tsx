/**
 * A Lumos reply that did something (or is about to): one sentence, a few quiet lines, the
 * provenance only where it matters, and Desfazer / Confirmar. Calm — no dashboard.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Undo2 } from 'lucide-react'
import { Button, Chip } from '@/components/ui'
import type { Provenance } from '@/data/types'
import { cn } from '@/lib/cn'
import type { LumosReply, ReplyLine, ReplyOption, ReplySection } from './act/types'
import type { ReplyStatus } from './conversation'
import { SAVE_FAILED, SAVE_FAILED_SUB } from './act/commit'

const PROVENANCE: Partial<Record<Provenance, string>> = { inference: 'inferência', integration: 'integração', suggestion: 'sugestão' }

/** inferência · integração · sugestão — quiet, never a warning. Facts and her own words stay silent. */
export function ProvenanceTag({ p, className }: { p?: Provenance; className?: string }) {
  const label = p ? PROVENANCE[p] : undefined
  if (!label) return null
  return <span className={cn('inline-flex items-center h-[18px] px-1.5 rounded-full border border-line text-[10px] font-medium uppercase tracking-[0.08em] text-muted leading-none shrink-0', className)}>{label}</span>
}

function Options({ options, onOption, className }: { options: ReplyOption[]; onOption: (o: ReplyOption) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => (
        <Chip key={o.label} onClick={() => onOption(o)} className="h-auto min-h-9 py-1.5 text-left">
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

function Line({ line, onOption }: { line: ReplyLine; onOption: (o: ReplyOption) => void }) {
  return (
    <li className="px-3.5 py-2.5">
      <div className="flex items-start gap-2.5">
        {line.emoji && (
          <span className="text-[15px] leading-snug shrink-0 w-5 text-center" aria-hidden>
            {line.emoji}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] leading-snug">{line.text}</div>
          {line.sub && <div className="text-[12.5px] text-muted leading-snug mt-0.5">{line.sub}</div>}
        </div>
        {line.isNew && <span className="text-[11px] text-sage font-medium shrink-0 pt-0.5">novo</span>}
        <ProvenanceTag p={line.provenance} className="mt-0.5" />
      </div>
      {!!line.options?.length && <Options options={line.options} onOption={onOption} className="mt-2 pl-7" />}
    </li>
  )
}

function Lines({ lines, onOption }: { lines: ReplyLine[]; onOption: (o: ReplyOption) => void }) {
  return (
    <ul className="rounded-2xl border border-line bg-surface divide-y divide-line/70 overflow-hidden">
      {lines.map((l, i) => (
        <Line key={`${l.text}-${i}`} line={l} onOption={onOption} />
      ))}
    </ul>
  )
}

function Section({ section, open: initial, onOption }: { section: ReplySection; open: boolean; onOption: (o: ReplyOption) => void }) {
  const [open, setOpen] = useState(initial)
  return (
    <section>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full min-h-10 flex items-center justify-between gap-2 text-left px-0.5" aria-expanded={open}>
        <span className="text-[13.5px] font-semibold text-ink-2">{section.title}</span>
        <span className="flex items-center gap-1.5 text-muted text-[12px]">
          {!open && section.lines.length}
          <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {open && <Lines lines={section.lines} onOption={onOption} />}
    </section>
  )
}

export interface ReplyCardProps {
  reply: LumosReply
  status: ReplyStatus
  canUndo: boolean
  onConfirm: () => void
  onCancel: () => void
  onUndo: () => void
  onOption: (o: ReplyOption) => void
  onLink: (to: string) => void
  /** A later save problem (e.g. Desfazer didn't reach the device). */
  saveNote?: string
}

export function ReplyCard({ reply, status, canUndo, onConfirm, onCancel, onUndo, onOption, onLink, saveNote }: ReplyCardProps) {
  const pending = status === 'pending'
  const failed = status === 'failed'
  const confirmed = status === 'done' && reply.action?.mode === 'confirm'
  const title =
    status === 'saving'
      ? 'Salvando no aparelho…'
      : failed
        ? SAVE_FAILED
        : status === 'undone'
          ? 'Desfeito — voltou como era.'
          : status === 'cancelled'
            ? 'Ok, deixei tudo como estava.'
            : confirmed && reply.action?.done
              ? reply.action.done
              : reply.text
  const quiet = status === 'undone' || status === 'cancelled' || status === 'saving' || failed
  const sections = reply.sections ?? []
  const openFirst = sections.length <= 3 ? sections.length : 2
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.45 }} className="card p-4 space-y-3.5">
      <div>
        <div className="flex items-center gap-2">
          <div className="eyebrow">✨ Lumos · {reply.area}</div>
          <ProvenanceTag p={reply.provenance} />
        </div>
        <p className="font-display text-[19px] leading-snug mt-1">{title}</p>
        {!quiet && reply.sub && <p className="text-[13.5px] text-ink-2 leading-snug mt-1.5">{reply.sub}</p>}
        {failed && <p className="text-[13.5px] text-ink-2 leading-snug mt-1.5">{SAVE_FAILED_SUB}</p>}
        {saveNote && <p role="alert" className="text-[13px] text-accent leading-snug mt-1.5">{saveNote}</p>}
      </div>

      {!quiet && !!reply.lines?.length && <Lines lines={reply.lines} onOption={onOption} />}
      {!quiet && sections.length > 0 && (
        <div className="space-y-1.5">
          {sections.map((s, i) => (
            <Section key={s.title} section={s} open={i < openFirst} onOption={onOption} />
          ))}
        </div>
      )}

      {(pending || (failed && reply.action)) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button size="sm" onClick={onConfirm}>
            {failed ? 'Tentar de novo' : (reply.action?.label ?? 'Confirmar')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Agora não
          </Button>
        </div>
      )}

      {!quiet && (canUndo || !!reply.options?.length || reply.link) && (
        <div className="flex flex-wrap gap-2">
          {status === 'done' && canUndo && (
            <Chip onClick={onUndo}>
              <Undo2 size={14} aria-hidden />
              Desfazer
            </Chip>
          )}
          {reply.options?.map((o) => (
            <Chip key={o.label} onClick={() => onOption(o)} className="h-auto min-h-9 py-1.5 text-left">
              {o.label}
            </Chip>
          ))}
          {reply.link && <Chip onClick={() => onLink(reply.link!.to)}>{reply.link.label} →</Chip>}
        </div>
      )}
    </motion.div>
  )
}
