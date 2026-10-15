/**
 * UGC Business — inside Trabalho / Creator. Three tabs:
 *   Hoje (tasks, actions, follow-ups, the week, the compact dashboard) · Marcas (all brands, filter chips) ·
 *   Produção (portfólio + financeiro).
 * Old ?aba= values (semana, pipeline, followups, abordagens, calendario, portfolio, financeiro) land on the
 * tab that now holds them. One source of truth with the Home: the same actions, the same check, the same records.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Card, Chip, EmptyState, ItemList, ItemRow, Page, PageHeader, ProgressBar, SectionTitle, Segmented } from '@/components/ui'
import { useDB } from '@/data/store'
import type { BrandTier, DB, UgcCrmStatus, UgcOpportunity, UgcStage } from '@/data/types'
import { brandOf, CHANNEL_LABEL, followUpsDue, isLive, STAGES, STATUS_LABEL, TIERS, ugcDayActions, weekNumbers } from '@/data/ugc/model'
import { ensureProspect } from '@/data/ugc/ops'
import { useToday } from '@/hooks/useToday'
import { addDays, formatDayMonth } from '@/lib/date'
import { normalize } from '@/lib/text'
import { commit, TierBadge, UgcActionRow } from './parts'
import { CrmDashboard, CrmFilter, CrmImport, UgcFinance, UgcPortfolio, UgcTasksToday, UgcWeek } from './Business'
import { CRM_STATUS_LABEL } from '@/data/ugc/crm'

type Tab = 'hoje' | 'marcas' | 'producao'
const TABS: { value: Tab; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'marcas', label: 'Marcas' },
  { value: 'producao', label: 'Produção' },
]
/** Old tab ids → the tab that holds them now (links from Lumos, ROUTES, bookmarks). */
const LEGACY: Record<string, Tab> = {
  agora: 'hoje',
  semana: 'hoje',
  calendario: 'hoje',
  followups: 'hoje',
  pipeline: 'marcas',
  abordagens: 'marcas',
  portfolio: 'producao',
  financeiro: 'producao',
}

function readUgcTab(raw: string | null): Tab {
  if (!raw) return 'hoje'
  if (TABS.some((t) => t.value === raw)) return raw as Tab
  return LEGACY[raw] ?? 'hoje'
}

export default function UgcPage() {
  const [params, setParams] = useSearchParams()
  const tab = readUgcTab(params.get('aba'))
  return (
    <Page>
      <PageHeader title="UGC Business" eyebrow="Creator" back backTo={ROUTES.creator} />
      <Segmented variant="tabs" value={tab} onChange={(t) => setParams(t === 'hoje' ? {} : { aba: t }, { replace: true })} options={TABS} className="mb-4" />
      {tab === 'hoje' && (
        <div className="space-y-6">
          <UgcTasksToday />
          <Agora />
          <UgcWeek />
          <CrmDashboard />
        </div>
      )}
      {tab === 'marcas' && <Brands />}
      {tab === 'producao' && (
        <div className="space-y-6">
          <UgcPortfolio />
          <UgcFinance />
        </div>
      )}
    </Page>
  )
}

function useUgcDB(): DB {
  // Re-render on any UGC record change (the selectors read several collections).
  const brands = useDB((db) => db.brands)
  const opps = useDB((db) => db.ugcOpportunities)
  const inter = useDB((db) => db.ugcInteractions)
  const profile = useDB((db) => db.profile)
  const expenses = useDB((db) => db.expenses)
  const messages = useDB((db) => db.ugcMessages)
  return useMemo(() => ({ brands, ugcOpportunities: opps, ugcInteractions: inter, profile, expenses, ugcMessages: messages }) as unknown as DB, [brands, opps, inter, profile, expenses, messages])
}

function AddBrand({ autoFocus }: { autoFocus?: boolean }) {
  const [name, setName] = useState('')
  const nav = useNavigate()
  const add = () => {
    const n = name.trim()
    if (!n) return
    let id = ''
    commit(() => {
      const r = ensureProspect(n)
      id = r.brand.id
      return r.undo
    }, `${n} na prospecção ✓`)
    setName('')
    if (id) nav(ROUTES.ugcBrand(id))
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <input id="ugc-add-brand" value={name} onChange={(e) => setName(e.target.value)} placeholder="Adicionar marca" autoFocus={autoFocus} className="input flex-1 min-w-0" aria-label="Nome da marca" />
      <button type="submit" disabled={!name.trim()} className="h-11 px-4 rounded-full bg-ink text-bg text-[14px] font-medium disabled:opacity-40">
        Adicionar
      </button>
    </form>
  )
}

// ─── Hoje ───────────────────────────────────────────────────────────────────

function Agora() {
  const db = useUgcDB()
  const today = useToday()
  const actions = useMemo(() => ugcDayActions(db, today, today), [db, today])
  const next = useMemo(() => {
    const out: { date: string; o: UgcOpportunity }[] = []
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i)
      for (const o of followUpsDue(db, d, today)) out.push({ date: d, o })
    }
    return out
  }, [db, today])
  const later = db.ugcOpportunities.filter((o) => isLive(db, o) && o.nextFollowUpAt && o.status === 'sem_resposta').sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!))
  const inConversation = db.ugcOpportunities.filter((o) => isLive(db, o) && o.stage === 'conversa')
  const w = weekNumbers(db, today)
  const empty = !db.brands.length

  if (empty)
    return (
      <Card>
        <EmptyState compact emoji="🤝" title="Sua prospecção começa aqui" text="Adicione a primeira marca." action={<AddBrand autoFocus />} />
      </Card>
    )

  // Open first, then the ones already done today.
  const ordered = [...actions.filter((a) => !a.done), ...actions.filter((a) => a.done)]
  return (
    <div className="space-y-6">
      {ordered.length > 0 && (
        <section aria-label="Precisa de você agora">
          <SectionTitle>Precisa de você</SectionTitle>
          <ItemList>
            {ordered.map((a) => (
              <UgcActionRow key={`${a.kind}:${a.opportunity.id}${a.done ? ':done' : ''}`} action={a} />
            ))}
          </ItemList>
        </section>
      )}

      {inConversation.length > 0 && (
        <section>
          <SectionTitle>Em conversa</SectionTitle>
          <ItemList>
            {inConversation.map((o) => (
              <OppLine key={o.id} db={db} o={o} meta={o.responseReceivedAt ? `respondeu ${formatDayMonth(o.responseReceivedAt)}` : STATUS_LABEL[o.status]} />
            ))}
          </ItemList>
        </section>
      )}

      {next.length > 0 && (
        <section>
          <SectionTitle>Próximos follow-ups</SectionTitle>
          <ItemList>
            {next.map(({ date, o }) => (
              <OppLine key={o.id} db={db} o={o} meta={CHANNEL_LABEL[o.primaryChannel ?? 'dm']} when={formatDayMonth(date)} />
            ))}
          </ItemList>
        </section>
      )}

      {later.length > 0 && (
        <section>
          <SectionTitle>Sem resposta · reativar</SectionTitle>
          <ItemList>
            {later.map((o) => (
              <OppLine key={o.id} db={db} o={o} meta="tentar de novo" when={formatDayMonth(o.nextFollowUpAt!)} />
            ))}
          </ItemList>
        </section>
      )}

      <section aria-label="Esta semana">
        <SectionTitle>Esta semana</SectionTitle>
        <Card className="space-y-3">
          <div>
            <div className="flex justify-between text-[14px] tabular-nums">
              <span>Novas abordagens</span>
              <span>
                {w.newApproaches} / {w.target}
              </span>
            </div>
            <ProgressBar value={w.newApproaches} max={w.target} className="mt-1.5" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Respostas', w.responses],
              ['Conversas', w.conversations],
              ['Fechadas', w.closed],
            ].map(([l, n]) => (
              <div key={l as string}>
                <div className="font-sport text-[24px] tabular-nums leading-none">{n}</div>
                <div className="text-[12px] text-muted mt-1">{l}</div>
              </div>
            ))}
          </div>
        </Card>
        <div className="mt-4">
          <AddBrand />
        </div>
      </section>
    </div>
  )
}

function OppLine({ db, o, meta, when }: { db: DB; o: UgcOpportunity; meta?: string; when?: string }) {
  const b = brandOf(db, o)
  return <ItemRow title={b?.name ?? o.title} meta={meta} when={when} to={ROUTES.ugcBrand(o.brandId)} trailing={<TierBadge tier={b?.priorityTier} />} />
}

// ─── Marcas (pipeline, CRM status, tier, search, rascunhos) ─────────────────

function Brands() {
  const db = useUgcDB()
  const [tier, setTier] = useState<BrandTier | undefined>()
  const [stage, setStage] = useState<UgcStage | undefined>()
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [crm, setCrm] = useState<UgcCrmStatus | undefined>()
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const b of db.brands) if (b.crm?.status) c[b.crm.status] = (c[b.crm.status] ?? 0) + 1
    return c
  }, [db.brands])
  const live = db.ugcOpportunities.filter((o) => isLive(db, o) || (o.stage === 'fechada' && o.status === 'concluida'))
  const latest = (brandId: string) => db.ugcOpportunities.filter((x) => x.brandId === brandId).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0]
  const inStage = (brandId: string) => !stage || live.some((o) => o.brandId === brandId && o.stage === stage)
  const rank = (t?: string) => (t ? TIERS.indexOf(t as BrandTier) : 9)
  const list = db.brands
    .filter((b) => !!b.archived === archived && (!tier || b.priorityTier === tier) && (!crm || b.crm?.status === crm) && inStage(b.id) && (!q || normalize(b.name).includes(normalize(q))))
    .sort((a, b) => rank(a.priorityTier) - rank(b.priorityTier) || a.name.localeCompare(b.name))
  const drafts = db.ugcMessages.filter((m) => m.status === 'rascunho' || m.status === 'aprovada').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const clear = () => {
    setStage(undefined)
    setTier(undefined)
    setArchived(false)
  }
  return (
    <div className="space-y-4">
      <AddBrand />
      <input id="ugc-brand-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca" className="input w-full" aria-label="Buscar marca" />
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Filtrar marcas">
        <Chip selected={!stage && !tier && !archived} onClick={clear} className="whitespace-nowrap">
          Todas
        </Chip>
        {STAGES.map((s) => {
          const n = live.filter((o) => o.stage === s.id).length
          if (!n) return null
          return (
            <Chip key={s.id} selected={stage === s.id} onClick={() => setStage(stage === s.id ? undefined : s.id)} className="whitespace-nowrap">
              {s.label} <span className="tabular-nums opacity-70">{n}</span>
            </Chip>
          )
        })}
        {TIERS.map((t) => (
          <Chip key={t} selected={tier === t} onClick={() => setTier(tier === t ? undefined : t)} className="whitespace-nowrap">
            Tier {t}
          </Chip>
        ))}
        <Chip selected={archived} onClick={() => setArchived((v) => !v)} className="whitespace-nowrap">
          Arquivadas
        </Chip>
      </div>
      <CrmFilter value={crm} onChange={setCrm} counts={counts} />
      {list.length ? (
        <ItemList label="Marcas">
          {list.map((b) => {
            const o = latest(b.id)
            const meta = b.crm?.status ? CRM_STATUS_LABEL[b.crm.status] : o ? STAGES.find((s) => s.id === o.stage)?.label : b.category
            return <ItemRow key={b.id} title={b.name} meta={meta} when={o?.lastContactAt ? formatDayMonth(o.lastContactAt) : undefined} to={ROUTES.ugcBrand(b.id)} trailing={<TierBadge tier={b.priorityTier} />} />
          })}
        </ItemList>
      ) : (
        <p className="text-[14px] text-muted">Nenhuma marca aqui.</p>
      )}
      {drafts.length > 0 && (
        <section aria-label="Rascunhos">
          <SectionTitle>Rascunhos</SectionTitle>
          <ItemList>
            {drafts.map((m) => (
              <ItemRow key={m.id} title={db.brands.find((b) => b.id === m.brandId)?.name ?? 'Marca'} meta={`${CHANNEL_LABEL[m.channel]} · ${m.status}`} to={ROUTES.ugcBrand(m.brandId)} />
            ))}
          </ItemList>
        </section>
      )}
      <CrmImport />
    </div>
  )
}
