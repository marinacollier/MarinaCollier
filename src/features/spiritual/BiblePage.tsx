/**
 * Bíblia, Graça & Liberdade — the quiet dashboard: a reconciliation to review (when there is one), where she is,
 * this week (facts only), her plans, the notebook, what she already studied. No streaks, no guilt, no due dates.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { toast } from '@/app/ui-store'
import { Button, Card, Checkbox, ListCard, ListRow, Page, PageHeader, SectionTitle, TextInput } from '@/components/ui'
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
  weekSummary,
} from '@/data/spiritual/model'
import { savePrayer } from '@/data/spiritual/ops'
import { applyUpdate, hasReflection, pendingUpdate, UPDATE_1015 } from '@/data/spiritual/reconcile'
import { sessionSeedId } from '@/data/seed/spiritual'
import type { DB } from '@/data/types'
import { todayKey } from '@/lib/date'
import { cn } from '@/lib/cn'
import { importRoute } from './study'
import { ProgressLine, SessionRow, SUBTITLE } from './parts'

const AMOS5 = sessionSeedId('profetas', 'amos-5')

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

      <UpdateCard db={db} />

      {plan ? (
        <Card className="bg-plum-soft/60">
          <div className="eyebrow text-plum">Caminhando agora</div>
          <div className="font-display text-[22px] leading-tight mt-1">{plan.title}</div>
          {next ? (
            <p className="text-[15px] text-ink-2 mt-2 leading-relaxed">
              Próximo: <span className="font-medium text-ink">{next.scriptureReference}</span> — {next.title}
            </p>
          ) : (
            <p className="text-[15px] text-ink-2 mt-2">Plano concluído.</p>
          )}
          <ProgressLine p={planProgress(db, plan.id)} className="mt-3" />
          {next && (
            <Button variant="primary" block className="mt-3" onClick={() => nav(ROUTES.bibleSession(next.id))}>
              Continuar estudo
            </Button>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-[15px] text-ink-2">Todos os planos estão concluídos. Um novo plano pode chegar quando fizer sentido.</p>
        </Card>
      )}

      <WeekSection db={db} />

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
      <div className="flex items-center justify-between gap-3 mt-2 px-1">
        <p className="text-[12px] text-muted">
          No total, {total.done} de {total.total} estudos concluídos.
        </p>
        <button type="button" className="text-[13px] text-plum h-9 shrink-0" onClick={() => nav(ROUTES.bibleMarkRead)}>
          Marcar leituras feitas
        </button>
      </div>

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
        <div className="grid grid-cols-2 gap-3">
          <Card onPress={() => nav(ROUTES.biblePrayers)}>
            <div className="font-display text-[17px]">Diário de oração</div>
            <div className="text-[12px] text-muted mt-0.5">{db.spiritualPrayers.length ? `${db.spiritualPrayers.length} ${db.spiritualPrayers.length === 1 ? 'registro' : 'registros'}` : 'orações e gratidão'}</div>
          </Card>
          <Card onPress={() => nav(importRoute())}>
            <div className="font-display text-[17px]">Importar estudo</div>
            <div className="text-[12px] text-muted mt-0.5">colar JSON</div>
          </Card>
        </div>
      </div>

      {history.length > 0 && (
        <>
          <SectionTitle
            action={
              history.length > 4 ? (
                <button type="button" className="text-[13px] text-muted h-9 px-1" onClick={() => setAllHistory((v) => !v)}>
                  {allHistory ? 'menos' : `ver todos (${history.length})`}
                </button>
              ) : undefined
            }
          >
            Já estudados
          </SectionTitle>
          <ListCard>
            {(allHistory ? history : history.slice(0, 4)).map((s) => (
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

/** "Atualização de 15/10 pronta para revisar": a preview (nothing written) → Aplicar once / Agora não. */
function UpdateCard({ db }: { db: DB }) {
  const nav = useNavigate()
  const [later, setLater] = useState(false)
  const update = useMemo(() => pendingUpdate(db), [db])
  const amos = db.spiritualSessions.find((s) => s.id === AMOS5)
  const missing = !!amos && db.profile.spiritualUpdatesApplied?.includes(UPDATE_1015.id) && !hasReflection(db, AMOS5)

  if (update && !later)
    return (
      <Card className="mb-4 border border-plum/30">
        <div className="eyebrow text-plum">Pronta para revisar</div>
        <div className="font-display text-[20px] leading-tight mt-0.5">{update.title}</div>
        <ul className="mt-3 space-y-2">
          {update.changes.map((c, i) => (
            <li key={i} className={cn('text-[14px] leading-snug flex gap-2', c.writes ? 'text-ink' : 'text-muted')}>
              <span className="shrink-0">{c.writes ? '→' : c.kind === 'missing_reflection' ? '✎' : '·'}</span>
              <span>
                {c.kind === 'missing_reflection' ? (
                  <>
                    {c.text}{' '}
                    <button type="button" className="text-plum underline" onClick={() => nav(importRoute(c.sessionId))}>
                      colar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{c.reference}</span> — {c.text}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-muted mt-3">Foto da Bíblia (Amós 5): guardar fotos no app ainda não está disponível.</p>
        <div className="flex gap-2 mt-3">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              applyUpdate()
              void persist()
              toast('Atualização aplicada')
            }}
          >
            Aplicar
          </Button>
          <Button variant="ghost" onClick={() => setLater(true)}>
            Agora não
          </Button>
        </div>
      </Card>
    )

  if (missing && amos)
    return (
      <Card className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[14px] text-ink-2 leading-snug">Reflexões de {amos.scriptureReference} ainda não salvas — cole ou escreva.</p>
        <div className="flex gap-1 shrink-0">
          <Button variant="soft" size="sm" onClick={() => nav(importRoute(amos.id))}>
            Colar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => nav(ROUTES.bibleSession(amos.id))}>
            Escrever
          </Button>
        </div>
      </Card>
    )
  return null
}

/** "Esta semana": facts only — no streaks, no "you missed". */
function WeekSection({ db }: { db: DB }) {
  const nav = useNavigate()
  const w = useMemo(() => weekSummary(db, todayKey()), [db])
  const [intention, setIntention] = useState('')
  const intentions = w.prayers.filter((p) => p.category === 'intencao' || p.category === 'oracao')
  const add = () => {
    if (!savePrayer({ content: intention, category: 'intencao' })) return
    void persist()
    setIntention('')
    toast('Intenção guardada')
  }
  const refs = (list: { scriptureReference: string }[]) => list.map((s) => s.scriptureReference).join(', ')
  const rows: [string, ReactNode][] = [
    ['Concluídos', w.done.length ? refs(w.done) : <span className="text-muted">nada registrado ainda — tudo bem</span>],
    [
      'Em andamento',
      w.inProgress.length ? (
        <span className="flex flex-wrap gap-x-3">
          {w.inProgress.map((s) => (
            <button key={s.id} type="button" className="text-plum" onClick={() => nav(ROUTES.bibleSession(s.id))}>
              {s.scriptureReference}
            </button>
          ))}
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
    ],
    [
      'Sugestão',
      w.next ? (
        <button type="button" className="text-plum text-left" onClick={() => nav(ROUTES.bibleSession(w.next!.id))}>
          {w.next.scriptureReference} · {w.next.title}
        </button>
      ) : (
        <span className="text-muted">—</span>
      ),
    ],
    [
      'Reflexões',
      w.reflections.length ? (
        `${w.reflections.length} · ${w.reflections
          .map((r) => r.keyword || r.reference)
          .slice(0, 3)
          .join(', ')}`
      ) : (
        <span className="text-muted">—</span>
      ),
    ],
  ]
  return (
    <>
      <SectionTitle>Esta semana</SectionTitle>
      <Card className="space-y-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3 text-[14px] leading-snug">
            <span className="w-[108px] shrink-0 text-muted">{label}</span>
            <span className="min-w-0 text-ink-2">{value}</span>
          </div>
        ))}
        <div className="pt-2 border-t border-line/60">
          <div className="text-[13px] text-muted mb-1.5">Intenções da semana</div>
          {intentions.length > 0 && (
            <ul className="mb-2 space-y-1 text-[14px] text-ink-2">
              {intentions.slice(0, 3).map((p) => (
                <li key={p.id} className="line-clamp-2">
                  {p.title || p.content}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <TextInput
              aria-label="Nova intenção de oração"
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Registrar uma intenção…"
              className="flex-1"
            />
            <Button variant="soft" size="sm" disabled={!intention.trim()} onClick={add}>
              Guardar
            </Button>
          </div>
        </div>
      </Card>
    </>
  )
}
