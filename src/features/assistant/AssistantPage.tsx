/**
 * /lumos — "Faça isso comigo / por mim." The full conversation (LumosInline, page variant). A ?q= link
 * (Home composer, other screens) arrives as the first sentence. Up to 3 proactive insights while the
 * conversation is empty — never a feed.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page, PageHeader } from '@/components/ui'
import { proactiveInsights } from '@/data/intel'
import { useDB } from '@/data/store'
import { useNow } from '@/hooks/useToday'
import { intelReady } from './act/intel'
import { ProvenanceTag } from './ReplyCard'
import { ask, useConversation } from './conversation'
import { buildInsights } from './insights'
import LumosInline from './LumosInline'

export default function AssistantPage() {
  const db = useDB()
  const { today, minutes } = useNow()
  const [params, setParams] = useSearchParams()
  const [initial] = useState(() => params.get('q')?.trim() || undefined)
  const empty = useConversation((s) => s.exchanges.length === 0)

  useEffect(() => {
    if (params.get('q')) setParams({}, { replace: true })
  }, [params, setParams])

  const insights = useMemo(() => {
    const now = { date: today, minutes }
    if (intelReady(db, now)) return proactiveInsights(db, now, 3).map((i) => ({ key: i.key, text: i.text, ask: i.ask, provenance: i.provenance }))
    return buildInsights(db, today, minutes, 2)
      .filter((i) => i.ask)
      .map((i) => ({ key: i.id, text: `${i.emoji} ${i.text}`, ask: i.ask, provenance: 'inference' as const }))
  }, [db, today, minutes])

  return (
    <Page>
      <PageHeader back eyebrow="Lumos" title={<>Oi, {db.profile.name || 'Marina'}.</>} subtitle="Me conta o que aconteceu — eu organizo. O simples eu já faço (com Desfazer); o sensível eu pergunto antes." />

      {empty && insights.length > 0 && (
        <div className="space-y-2 mb-5">
          {insights.map((i, idx) => (
            <motion.button
              key={i.key}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => i.ask && ask(i.ask)}
              className="w-full flex items-center gap-3 rounded-2xl bg-surface-2/70 px-4 py-3 text-left active:scale-[0.99] transition"
            >
              <span className="flex-1 text-[14.5px] leading-snug text-ink-2">{i.text}</span>
              <ProvenanceTag p={i.provenance} />
            </motion.button>
          ))}
        </div>
      )}

      <LumosInline variant="page" initial={initial} />
    </Page>
  )
}
