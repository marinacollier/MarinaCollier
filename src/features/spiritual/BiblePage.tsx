/**
 * Bíblia, Graça & Liberdade — the quiet dashboard: where she is, what comes next, her plans, the last thing
 * she wrote, the prayer journal and what she already studied. No streaks, no guilt, no due dates.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Button, Card, Checkbox, ListCard, ListRow, Page, PageHeader, SectionTitle } from '@/components/ui'
import { actions, persist, useDB } from '@/data/store'
import {
  completedHistory,
  currentPlan,
  lastReflection,
  nextSession,
  PLAN_STATUS_LABEL,
  planProgress,
  plansOf,
  planStatus,
  totalProgress,
} from '@/data/spiritual/model'
import { ProgressLine, SessionRow, SUBTITLE } from './parts'

export default function BiblePage() {
  const db = useDB()
  const nav = useNavigate()
  const [allHistory, setAllHistory] = useState(false)
  const plan = useMemo(() => currentPlan(db), [db])
  const next = useMemo(() => nextSession(db), [db])
  const plans = useMemo(() => plansOf(db), [db])
  const total = useMemo(() => totalProgress(db), [db])
  const last = useMemo(() => lastReflection(db), [db])
  const history = useMemo(() => completedHistory(db), [db])
  const annotated = useMemo(() => new Set(db.spiritualJournal.map((j) => j.sessionId)), [db.spiritualJournal])
  const planTitle = (id: string) => db.spiritualPlans.find((p) => p.id === id)?.title
  const lastSession = last ? db.spiritualSessions.find((s) => s.id === last.sessionId) : undefined

  return (
    <Page>
      <PageHeader title="Bíblia, Graça & Liberdade" eyebrow="Vida" subtitle={SUBTITLE} back backTo={ROUTES.spaces} />

      {plan ? (
        <Card className="bg-plum-soft/60">
          <div className="eyebrow text-plum">Caminhando agora</div>
          <div className="font-display text-[22px] leading-tight mt-1">{plan.title}</div>
          {next ? (
            <p className="text-[15px] text-ink-2 mt-3 leading-relaxed">
              Próximo: <span className="font-medium text-ink">{next.scriptureReference}</span> — {next.title}
            </p>
          ) : (
            <p className="text-[15px] text-ink-2 mt-3">Plano concluído.</p>
          )}
          <ProgressLine p={planProgress(db, plan.id)} className="mt-4" />
          {next && (
            <Button variant="primary" block className="mt-4" onClick={() => nav(ROUTES.bibleSession(next.id))}>
              Continuar estudo
            </Button>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-[15px] text-ink-2">Todos os planos estão concluídos. Um novo plano pode chegar quando fizer sentido.</p>
        </Card>
      )}

      <SectionTitle>Planos</SectionTitle>
      <ListCard>
        {plans.map((p) => {
          const pr = planProgress(db, p.id)
          return (
            <ListRow
              key={p.id}
              title={p.title}
              subtitle={`${PLAN_STATUS_LABEL[planStatus(db, p.id)]} · ${pr.done}/${pr.total}`}
              onPress={() => nav(ROUTES.biblePlan(p.id))}
              chevron
            />
          )
        })}
      </ListCard>
      <p className="text-[12px] text-muted mt-2 px-1">
        No total, {total.done} de {total.total} estudos concluídos.
      </p>

      <SectionTitle>Caderno</SectionTitle>
      <div className="grid gap-3">
        {last && lastSession ? (
          <Card onPress={() => nav(ROUTES.bibleSession(lastSession.id))}>
            <div className="eyebrow">Última reflexão · {last.reference}</div>
            {last.keyword && <div className="font-display text-[20px] mt-1">{last.keyword}</div>}
            {(last.personalReflection || last.reflectionGod || last.notes) && (
              <p className="text-[15px] text-ink-2 mt-2 leading-relaxed line-clamp-3">{last.personalReflection || last.reflectionGod || last.notes}</p>
            )}
          </Card>
        ) : null}
        <Card onPress={() => nav(ROUTES.biblePrayers)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-[19px]">Diário de oração</div>
              <div className="text-[13px] text-muted mt-0.5">orações e gratidão</div>
            </div>
            <span className="text-[13px] text-muted">{db.spiritualPrayers.length || ''}</span>
          </div>
        </Card>
      </div>

      {history.length > 0 && (
        <>
          <SectionTitle
            action={
              history.length > 6 ? (
                <button type="button" className="text-[13px] text-muted h-9 px-1" onClick={() => setAllHistory((v) => !v)}>
                  {allHistory ? 'menos' : `ver todos (${history.length})`}
                </button>
              ) : undefined
            }
          >
            Já estudados
          </SectionTitle>
          <ListCard>
            {(allHistory ? history : history.slice(0, 6)).map((s) => (
              <SessionRow key={s.id} s={s} annotated={annotated.has(s.id)} showPlan={plans.length > 1 ? planTitle(s.planId)?.split(' — ')[0] : undefined} />
            ))}
          </ListCard>
        </>
      )}

      <div className="flex items-center gap-3 mt-8 px-1">
        <Checkbox
          size="sm"
          checked={db.profile.spiritualOnHome !== false}
          onChange={(v) => {
            actions.setProfile({ spiritualOnHome: v })
            void persist()
          }}
          label="Mostrar o próximo estudo na Início"
        />
        <span className="text-[13px] text-muted">Mostrar o próximo estudo na Início (sem prazo)</span>
      </div>
    </Page>
  )
}
