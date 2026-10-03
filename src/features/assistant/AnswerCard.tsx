import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Chip } from '@/components/ui'
import { ConflictCard } from '@/components/planning/ConflictCard'
import { openSheet } from '@/app/ui-store'
import { runAction } from '@/features/search/actions'
import { ResultRow } from '@/features/search/ResultViews'
import type { AnswerBlock, LumosAnswer } from './types'

function Block({ block, onAsk }: { block: AnswerBlock; onAsk: (q: string) => void }) {
  const navigate = useNavigate()
  switch (block.kind) {
    case 'headline':
      return null
    case 'text':
      return <p className="text-[14px] leading-relaxed text-ink-2">{block.text}</p>
    case 'stat': {
      const action = block.action
      return (
        <button
          type="button"
          disabled={!action}
          onClick={() => action && runAction(action, navigate)}
          className="w-full text-left rounded-2xl bg-surface-2 px-4 py-3 active:opacity-80 transition disabled:cursor-default"
        >
          <div className="eyebrow">{block.label}</div>
          <div className="font-display text-[28px] leading-tight tracking-tight mt-0.5">{block.value}</div>
          {block.hint && <div className="text-[13px] text-muted">{block.hint}</div>}
        </button>
      )
    }
    case 'list':
      return (
        <section>
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 px-0.5 mb-1.5">
            {block.emoji && <span aria-hidden>{block.emoji}</span>}
            {block.title}
          </div>
          <div className="rounded-2xl border border-line overflow-hidden divide-y divide-line/70 bg-surface">
            {block.items.map((item) => (
              <ResultRow
                key={item.id}
                emoji={item.emoji}
                title={item.title}
                subtitle={item.subtitle}
                trailing={
                  item.action?.kind === 'createWorkout' ? (
                    <span className="inline-flex items-center rounded-full bg-accent-soft text-accent px-2.5 h-7 text-[12.5px] font-medium">{item.trailing}</span>
                  ) : (
                    item.trailing
                  )
                }
                onPress={item.action ? () => runAction(item.action!, navigate) : undefined}
              />
            ))}
          </div>
          {block.more && (
            <button type="button" onClick={() => runAction(block.more!.action, navigate)} className="text-[13px] font-medium text-accent h-9 px-0.5">
              {block.more.label} →
            </button>
          )}
        </section>
      )
    case 'conflicts':
      return (
        <section className="space-y-2.5">
          {block.items.map(({ conflict, dayLabel }) => {
            const workout = conflict.refs.find((r) => r.type === 'workout')
            return (
              <div key={conflict.key}>
                <div className="eyebrow px-0.5 mb-1">{dayLabel}</div>
                <ConflictCard conflict={conflict} onMove={workout ? () => openSheet('workout', { id: workout.id }) : undefined} />
              </div>
            )
          })}
          {block.more && (
            <button type="button" onClick={() => runAction(block.more!.action, navigate)} className="text-[13px] font-medium text-accent h-9 px-0.5">
              {block.more.label} →
            </button>
          )}
        </section>
      )
    case 'suggestions':
      return (
        <div className="flex flex-wrap gap-2">
          {block.questions.map((q) => (
            <Chip key={q} onClick={() => onAsk(q)}>
              {q}
            </Chip>
          ))}
        </div>
      )
  }
}

export function AnswerCard({ answer, onAsk }: { answer: LumosAnswer; onAsk: (q: string) => void }) {
  const via = answer.agents.length ? answer.agents.map((a) => `${a.emoji} ${a.name}`).join(' · ') : '✨ Lumos'
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.45 }} className="card p-4 space-y-3.5">
      <div>
        <div className="eyebrow">{via}</div>
        <p className="font-display text-[19px] leading-snug mt-1">{answer.headline}</p>
      </div>
      {answer.blocks.map((b, i) => (
        <Block key={i} block={b} onAsk={onAsk} />
      ))}
    </motion.div>
  )
}
