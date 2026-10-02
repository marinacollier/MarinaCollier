import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Handshake, Plus } from 'lucide-react'
import { openSheet } from '@/app/ui-store'
import { useDB } from '@/data/store'
import type { BrandPartnership, ContentItem } from '@/data/types'
import { Button, Card, Chip, EmptyState, SectionTitle } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { advanceContent } from './actions'
import { CATEGORIES, contentStageMeta, PLATFORMS } from './constants'
import { AdvanceButton, StageList, Tag } from './components'
import { contentByStage, deadlineLabel, deadlineSoon, filterContent, nextContentStage, usedValues, type ContentFilter } from './selectors'

const COLLAPSED = new Set(['ideia', 'publicado'])

export default function ContentTab({ projectId }: { projectId?: string }) {
  const all = useDB((db) => db.contentItems)
  const items = useMemo(() => (projectId ? all.filter((c) => c.projectId === projectId) : all), [all, projectId])
  const partnerships = useDB((db) => db.partnerships)
  const today = useToday()
  const [filter, setFilter] = useState<ContentFilter>({})

  const categories = useMemo(() => usedValues(items, 'category', CATEGORIES), [items])
  const platforms = useMemo(() => usedValues(items, 'platform', PLATFORMS), [items])
  const filtered = useMemo(() => filterContent(items, filter), [items, filter])
  const groups = useMemo(() => contentByStage(filtered), [filtered])
  const inProduction = useMemo(() => filtered.some((c) => c.stage !== 'ideia' && c.stage !== 'publicado'), [filtered])
  const brandById = useMemo(() => new Map(partnerships.map((p) => [p.id, p])), [partnerships])

  const add = () => openSheet('content', { defaults: projectId ? { projectId } : undefined })

  if (items.length === 0) {
    return (
      <Card className="mt-2">
        <EmptyState
          emoji="🎬"
          title="Nada no forno ainda"
          text="Anota uma ideia e ela vira conteúdo quando der."
          action={
            <Button variant="primary" icon={<Plus size={18} />} onClick={add}>
              Novo conteúdo
            </Button>
          }
        />
      </Card>
    )
  }

  const hasFilters = categories.length > 1 || platforms.length > 1 || !!filter.category || !!filter.platform

  return (
    <div>
      {hasFilters && (
        <div className="space-y-2 mb-1">
          {categories.length > 0 && (
            <FilterRow
              values={categories}
              selected={filter.category}
              onSelect={(v) => setFilter((f) => ({ ...f, category: v }))}
              allLabel="Todas"
            />
          )}
          {platforms.length > 0 && (
            <FilterRow
              values={platforms}
              selected={filter.platform}
              onSelect={(v) => setFilter((f) => ({ ...f, platform: v }))}
              allLabel="Todas as redes"
            />
          )}
        </div>
      )}

      <SectionTitle
        className={hasFilters ? 'mt-5' : 'mt-2'}
        action={
          <Button variant="ghost" size="sm" icon={<Plus size={16} />} onClick={add} className="-mr-2">
            Novo
          </Button>
        }
      >
        Planner
      </SectionTitle>

      {filtered.length === 0 ? (
        <EmptyState compact emoji="🔎" title="Nada com esse filtro" text="Tira um filtro pra ver tudo de novo." />
      ) : (
        <>
          {!inProduction && (
            <Card className="mb-3 flex items-center gap-3 py-3.5">
              <span className="text-[20px]" aria-hidden>
                🎥
              </span>
              <p className="text-[14px] text-ink-2 leading-snug">
                Nada em produção agora. Abre as ideias e manda uma pra <b className="font-semibold">Gravar</b> quando der.
              </p>
            </Card>
          )}
          <StageList
            groups={groups}
            collapsed={COLLAPSED}
            render={(c, i) => (
              <ContentCard key={c.id} c={c} index={i} today={today} partnership={c.partnershipId ? brandById.get(c.partnershipId) : undefined} />
            )}
          />
        </>
      )}
    </div>
  )
}

function FilterRow({
  values,
  selected,
  onSelect,
  allLabel,
}: {
  values: string[]
  selected?: string
  onSelect: (v: string | undefined) => void
  allLabel: string
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
      <Chip selected={!selected} onClick={() => onSelect(undefined)}>
        {allLabel}
      </Chip>
      {values.map((v) => (
        <Chip key={v} selected={selected === v} onClick={() => onSelect(selected === v ? undefined : v)}>
          {v}
        </Chip>
      ))}
    </div>
  )
}

function ContentCard({ c, index, today, partnership }: { c: ContentItem; index: number; today: string; partnership?: BrandPartnership }) {
  const next = nextContentStage(c.stage)
  const meta = [c.format, c.platform, c.category].filter(Boolean).join(' · ')
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
      <Card onPress={() => openSheet('content', { id: c.id })} aria-label={`Abrir ${c.title}`} className="py-3.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[15.5px] leading-snug font-medium">{c.title}</div>
            {meta && <div className="text-[13px] text-muted mt-0.5 truncate">{meta}</div>}
          </div>
          {next && <AdvanceButton label={contentStageMeta(next).short} onClick={() => advanceContent(c)} />}
        </div>
        {(c.deadline || partnership || (c.stage === 'publicado' && c.publishedAt)) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {c.deadline && c.stage !== 'publicado' && (
              <Tag tone={deadlineSoon(c.deadline, today) ? 'soon' : 'neutral'}>{deadlineLabel(c.deadline, today)}</Tag>
            )}
            {c.stage === 'publicado' && c.publishedAt && <Tag tone="done">no ar desde {formatShortDate(c.publishedAt)}</Tag>}
            {partnership && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  openSheet('partnership', { id: partnership.id })
                }}
                className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[12px] font-medium bg-ocean-soft text-ocean"
              >
                <Handshake size={12} />
                {partnership.brand}
              </button>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  )
}
