/** One reading plan: its blocks, one checkbox per session (check/uncheck anytime; reflections stay). */
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Button, EmptyState, ListCard, Page, PageHeader, SectionTitle } from '@/components/ui'
import { useDB } from '@/data/store'
import { blockGroups, nextSession, PLAN_STATUS_LABEL, planProgress, planStatus } from '@/data/spiritual/model'
import { ProgressLine, SessionRow } from './parts'

export default function PlanPage() {
  const { id = '' } = useParams()
  const db = useDB()
  const nav = useNavigate()
  const plan = db.spiritualPlans.find((p) => p.id === id)
  const groups = useMemo(() => (plan ? blockGroups(db, plan) : []), [db, plan])
  const annotated = useMemo(() => new Set(db.spiritualJournal.map((j) => j.sessionId)), [db.spiritualJournal])
  if (!plan)
    return (
      <Page>
        <PageHeader title="Plano" back backTo={ROUTES.bible} />
        <EmptyState emoji="🕊️" title="Plano não encontrado" />
      </Page>
    )
  const next = nextSession(db, plan.id)
  return (
    <Page>
      <PageHeader title={plan.title} eyebrow={PLAN_STATUS_LABEL[planStatus(db, plan.id)]} subtitle={plan.description} back backTo={ROUTES.bible} />
      {plan.note && <p className="text-[14px] text-muted italic -mt-1 mb-3 px-0.5">{plan.note}</p>}
      <ProgressLine p={planProgress(db, plan.id)} />
      {next && (
        <Button variant="soft" block className="mt-4" onClick={() => nav(ROUTES.bibleSession(next.id))}>
          {planProgress(db, plan.id).done ? 'Continuar' : 'Começar'}: {next.scriptureReference}
        </Button>
      )}
      {groups.map((g, i) => (
        <section key={g.title || i}>
          <SectionTitle action={<span className="text-[12px] text-muted">{g.progress.done}/{g.progress.total}</span>}>{g.title || 'Estudos'}</SectionTitle>
          <ListCard>
            {g.sessions.map((s) => (
              <SessionRow key={s.id} s={s} annotated={annotated.has(s.id)} />
            ))}
          </ListCard>
        </section>
      ))}
    </Page>
  )
}
