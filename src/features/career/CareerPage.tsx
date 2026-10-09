/**
 * CARREIRA 2027 — one page, five calm blocks. Data lives in the existing entities (goals, tasks, wins,
 * monthly reviews) + opportunities/contacts. Lumos operates all of it; this page is for looking.
 */
import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { useDB } from '@/data/store'
import { CAREER_META, logCareerActivity, weekProgress } from '@/data/career/activities'
import { OPP_STATUS_LABEL, cases, dueFollowUps, openOpportunities, staleOpportunities } from '@/data/career/pipeline'
import { Card, Page, PageHeader, SectionTitle } from '@/components/ui'
import { LockGate } from '@/components/layout/LockGate'
import { useToday } from '@/hooks/useToday'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { CAREER_SEED_IDS } from './seed'

const fmt = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')

export default function CareerPageGuarded() {
  return (
    <LockGate area="carreira">
      <CareerPage />
    </LockGate>
  )
}

function Add({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-9 inline-flex items-center gap-1 text-[13px] text-accent">
      <Plus size={15} /> {label}
    </button>
  )
}

function CareerPage() {
  const db = useDB()
  const today = useToday()
  const north = db.goals.find((g) => g.id === CAREER_SEED_IDS.northStar) ?? db.goals.find((g) => g.level === 'maior' && g.category === 'profissional' && g.status === 'ativa')
  const quarter = useMemo(() => (north ? db.goals.filter((g) => g.parentId === north.id && g.status !== 'solta') : []), [db.goals, north])
  const week = useMemo(() => weekProgress(db, today), [db, today])
  const opps = useMemo(() => openOpportunities(db), [db])
  const stale = useMemo(() => new Map(staleOpportunities(db, today).map((o) => [o.id, o.days])), [db, today])
  const follow = useMemo(() => dueFollowUps(db, today), [db, today])
  const recentPeople = useMemo(() => [...db.contacts].filter((c) => !follow.includes(c)).sort((a, b) => (b.lastInteraction ?? '').localeCompare(a.lastInteraction ?? '')).slice(0, 4), [db.contacts, follow])
  const caseList = useMemo(() => cases(db), [db])
  const promotable = useMemo(() => db.wins.filter((w) => !w.evidence).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3), [db.wins])

  return (
    <Page>
      <PageHeader title="Carreira 2027" back backTo={ROUTES.spaces} subtitle="pra onde estou indo, sem virar planilha" />

      {north && (
        <Card className="p-5">
          <div className="eyebrow">North Star</div>
          <h2 className="font-display text-[23px] leading-tight mt-1">{north.title}</h2>
          {north.notes && <p className="text-[13.5px] text-ink-2 mt-1.5 leading-snug">{north.notes}</p>}
          <div className="mt-3 pt-3 border-t border-line/70">
            <div className="eyebrow mb-1">Objetivos do trimestre</div>
            {quarter.length ? (
              quarter.map((g) => (
                <button key={g.id} type="button" onClick={() => openSheet('goal', { id: g.id })} className="w-full text-left py-1.5 text-[14.5px] flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', g.status === 'feita' ? 'bg-sage' : 'bg-line')} />
                  <span className={cn(g.status === 'feita' && 'line-through text-muted')}>{g.title}</span>
                </button>
              ))
            ) : (
              <p className="text-[13px] text-muted">Nenhum ainda — define quando fizer sentido.</p>
            )}
            <Add label="objetivo do trimestre" onClick={() => openSheet('goal', { level: 'maior', defaults: { parentId: north.id, category: 'profissional', big: false } })} />
          </div>
        </Card>
      )}

      <SectionTitle>Esta semana</SectionTitle>
      <Card className="p-4">
        {week.map((p) => (
          <div key={p.quota.id} className="flex items-center gap-3 py-2">
            <span aria-hidden className="text-[18px]">{CAREER_META[p.kind].emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] truncate">{CAREER_META[p.kind].label}</div>
              <div className="text-[12.5px] text-muted">
                {p.done}/{p.target}
                {p.unit === 'min' ? ' min' : ''}
                {p.planned.length ? ` · ${p.planned.length} no calendário` : ''}
              </div>
            </div>
            <button
              type="button"
              aria-label={`Registrar ${CAREER_META[p.kind].label} hoje`}
              onClick={() => {
                const r = logCareerActivity(p.kind, today)
                if (!r) return
                haptic('success')
                toast(`${r.title} ✓`, { action: { label: 'Desfazer', run: r.undo } })
              }}
              className="h-9 px-3 rounded-full bg-surface-2 text-[13px]"
            >
              + feito hoje
            </button>
          </div>
        ))}
        <p className="text-[12px] text-muted mt-1">“Monta minha semana” encaixa isso só nos seus espaços livres.</p>
      </Card>

      <SectionTitle action={<Add label="oportunidade" onClick={() => openSheet('opportunity', {})} />}>Oportunidades</SectionTitle>
      <Card className="p-4">
        {opps.length ? (
          <ul className="divide-y divide-line/70">
            {opps.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => openSheet('opportunity', { id: o.id })} className="w-full text-left py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14.5px] truncate">
                      {o.role} · {o.company}
                    </span>
                    <span className="text-[11.5px] h-5 px-2 rounded-full bg-surface-2 text-ink-2 inline-flex items-center shrink-0">{OPP_STATUS_LABEL[o.status]}</span>
                  </div>
                  <div className="text-[12.5px] text-muted mt-0.5">
                    {o.nextAction ? `${o.nextAction}${o.nextActionDate ? ` · ${fmt(o.nextActionDate)}` : ''}` : 'sem próxima ação'}
                    {stale.has(o.id) ? ` · sem follow-up há ${stale.get(o.id)} dias` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">Nada no pipeline ainda. Conta pra Lumos quando uma vaga aparecer.</p>
        )}
      </Card>

      <SectionTitle action={<Add label="pessoa" onClick={() => openSheet('contact', {})} />}>Pessoas</SectionTitle>
      <Card className="p-4">
        {follow.length + recentPeople.length ? (
          <ul className="divide-y divide-line/70">
            {[...follow, ...recentPeople].map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => openSheet('contact', { id: c.id })} className="w-full text-left py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[14.5px] truncate">
                    {c.name}
                    {c.company ? <span className="text-muted"> · {c.company}</span> : null}
                  </span>
                  <span className={cn('text-[12px] shrink-0', c.nextFollowUp && c.nextFollowUp <= today ? 'text-sand' : 'text-muted')}>
                    {c.nextFollowUp ? `follow-up ${fmt(c.nextFollowUp)}` : c.lastInteraction ? `falaram ${fmt(c.lastInteraction)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">“Falei com a Ana da empresa X hoje” e a Lumos guarda aqui.</p>
        )}
      </Card>

      <SectionTitle>Cases e evidências</SectionTitle>
      <Card className="p-4">
        {caseList.map((w) => (
          <button key={w.id} type="button" onClick={() => openSheet('evidence', { id: w.id })} className="w-full text-left py-2.5 flex items-center justify-between gap-2 border-b border-line/70 last:border-0">
            <span className="text-[14.5px] truncate">{w.title}</span>
            {!w.metrics?.trim() ? <span className="text-[11.5px] h-5 px-2 rounded-full bg-sand-soft text-sand inline-flex items-center shrink-0">sem métricas</span> : <span className="text-[12px] text-muted shrink-0">{w.confidentiality ?? 'interno'}</span>}
          </button>
        ))}
        {!caseList.length && <p className="text-[13px] text-muted">Nenhum case ainda. Wins importantes viram evidência com um toque.</p>}
        {promotable.length > 0 && (
          <div className="mt-2">
            <div className="eyebrow mb-1">Wins recentes</div>
            {promotable.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-[13.5px] text-ink-2 truncate">{w.title}</span>
                <button type="button" onClick={() => openSheet('evidence', { id: w.id })} className="h-8 px-3 rounded-full bg-surface-2 text-[12.5px] shrink-0">
                  virar case
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  )
}
