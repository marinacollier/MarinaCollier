import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { BrandPartnership, Task } from '@/data/types'
import { actions } from '@/data/store'
import { haptic } from '@/lib/haptics'
import { nowISO } from '@/lib/id'
import { Button, Card, Checkbox, EmptyState, SectionTitle } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { relativeDay } from '@/lib/date'
import { formatBRL } from '@/lib/money'
import { pluralize } from '@/lib/text'
import { cn } from '@/lib/cn'
import { advancePartnership } from './actions'
import { partnershipStageMeta } from './constants'
import { AdvanceButton, StageList, Tag } from './components'
import {
  awaitingPayment,
  deadlineLabel,
  deadlineSoon,
  nextPartnershipStage,
  partnershipReviews,
  partnershipsByStage,
  reviewLabel,
  upcomingDeliveries,
} from './selectors'

const COLLAPSED = new Set(['finalizado'])

export default function PartnershipsTab() {
  const partnerships = useDB((db) => db.partnerships)
  const contentItems = useDB((db) => db.contentItems)
  const tasks = useDB((db) => db.tasks)
  const today = useToday()
  const reviews = useMemo(() => partnershipReviews(tasks), [tasks])
  const reviewFor = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of reviews) if (t.partnershipId && !m.has(t.partnershipId)) m.set(t.partnershipId, t)
    return m
  }, [reviews])
  const groups = useMemo(() => partnershipsByStage(partnerships), [partnerships])
  const upcoming = useMemo(() => upcomingDeliveries(partnerships), [partnerships])
  const payment = useMemo(() => awaitingPayment(partnerships), [partnerships])
  const contentCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of contentItems) if (c.partnershipId) m.set(c.partnershipId, (m.get(c.partnershipId) ?? 0) + 1)
    return m
  }, [contentItems])

  const add = () => openSheet('partnership', {})

  if (partnerships.length === 0) {
    return (
      <Card className="mt-2">
        <EmptyState
          emoji="🤝"
          title="Nenhuma parceria em andamento"
          text="Quando aparecer, ela mora aqui ✨"
          action={
            <Button variant="primary" icon={<Plus size={18} />} onClick={add}>
              Nova parceria
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <div>
      {reviews.length > 0 && (
        <Card padded={false} className="overflow-hidden mb-3">
          <div className="eyebrow px-4 pt-3.5 pb-1">Para revisar</div>
          <div className="divide-y divide-line/70">
            {reviews.map((t) => (
              <div key={t.id} className="flex items-start gap-3 px-4 py-2.5 min-h-[52px]">
                <div className="pt-0.5">
                  <Checkbox
                    checked={false}
                    label={`Concluir ${t.title}`}
                    onChange={() => {
                      actions.update('tasks', t.id, { status: 'done', completedAt: nowISO() })
                      haptic('success')
                    }}
                  />
                </div>
                <button type="button" onClick={() => openSheet('task', { id: t.id })} className="flex-1 min-w-0 text-left">
                  <span className="block text-[15px] leading-snug">{t.title}</span>
                  <span className="block text-[12.5px] text-muted mt-0.5">{reviewLabel(t, today)} · a confirmar</span>
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(upcoming.length > 0 || payment.count > 0) && (
        <div className="grid gap-3 mb-2">
          {upcoming.length > 0 && (
            <Card padded={false} className="overflow-hidden">
              <div className="eyebrow px-4 pt-3.5 pb-1">Próximas entregas</div>
              <div className="divide-y divide-line/70">
                {upcoming.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openSheet('partnership', { id: p.id })}
                    className="w-full flex items-center gap-3 min-h-[52px] px-4 py-2 text-left active:bg-surface-2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] truncate">{p.brand}</div>
                      <div className="text-[12.5px] text-muted truncate">
                        {partnershipStageMeta(p.stage).label}
                        {p.format ? ` · ${p.format}` : ''}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-[13px] font-medium',
                        deadlineSoon(p.deadline, today) ? 'text-accent' : 'text-ink-2',
                      )}
                    >
                      {relativeDay(p.deadline!, today)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {payment.count > 0 && (
            <Card className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-sand-soft flex items-center justify-center text-[20px] shrink-0" aria-hidden>
                💸
              </div>
              <div className="flex-1 min-w-0">
                <div className="eyebrow">Aguardando pagamento</div>
                <div className="font-display text-[24px] leading-tight mt-0.5">{formatBRL(payment.totalCents)}</div>
                <div className="text-[12.5px] text-muted">
                  {pluralize(payment.count, 'parceria', 'parcerias')}
                  {payment.barterOnly > 0 ? ` · ${payment.barterOnly} em permuta` : ''}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      <SectionTitle
        action={
          <Button variant="ghost" size="sm" icon={<Plus size={16} />} onClick={add} className="-mr-2">
            Nova
          </Button>
        }
      >
        Pipeline
      </SectionTitle>
      <StageList
        groups={groups}
        collapsed={COLLAPSED}
        render={(p, i) => (
          <PartnershipCard key={p.id} p={p} index={i} today={today} contents={contentCount.get(p.id) ?? 0} review={reviewFor.get(p.id)} />
        )}
      />
    </div>
  )
}

function PartnershipCard({
  p,
  index,
  today,
  contents,
  review,
}: {
  p: BrandPartnership
  index: number
  today: string
  contents: number
  review?: Task
}) {
  const next = nextPartnershipStage(p.stage)
  const value = p.valueCents ? formatBRL(p.valueCents) : p.barter ? 'permuta' : undefined
  const meta: string[] = []
  if (p.format) meta.push(p.format)
  if (contents) meta.push(pluralize(contents, 'conteúdo', 'conteúdos'))
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <Card onPress={() => openSheet('partnership', { id: p.id })} aria-label={`Abrir ${p.brand}`} className="py-3.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-display text-[19px] leading-tight truncate">{p.brand}</div>
            {meta.length > 0 && <div className="text-[13px] text-muted mt-0.5 truncate">{meta.join(' · ')}</div>}
            {p.notes && <div className="text-[13px] text-ink-2 mt-1 leading-snug line-clamp-2">{p.notes}</div>}
          </div>
          {next && <AdvanceButton label={partnershipStageMeta(next).short} onClick={() => advancePartnership(p)} />}
        </div>
        {(p.deadline || value || review) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {review && <Tag tone="link">{reviewLabel(review, today)}</Tag>}
            {p.deadline && <Tag tone={deadlineSoon(p.deadline, today) ? 'soon' : 'neutral'}>{deadlineLabel(p.deadline, today)}</Tag>}
            {value && <Tag tone={p.valueCents ? 'money' : 'barter'}>{p.valueCents ? value : `🎁 ${value}`}</Tag>}
            {p.valueCents && p.barter ? <Tag tone="barter">🎁 + permuta</Tag> : null}
          </div>
        )}
      </Card>
    </motion.div>
  )
}
