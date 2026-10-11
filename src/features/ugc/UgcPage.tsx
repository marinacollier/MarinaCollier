/**
 * UGC Business — inside Trabalho / Creator. It opens on what needs her now (never on a chart):
 *   Agora · Pipeline · Marcas · Follow-ups · Abordagens
 * One source of truth with the Home: the same actions, the same check, the same records.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Card, Chip, EmptyState, Page, PageHeader, ProgressBar, SectionTitle, Segmented } from '@/components/ui'
import { useDB } from '@/data/store'
import type { BrandTier, DB, UgcOpportunity } from '@/data/types'
import {
  brandOf,
  CHANNEL_LABEL,
  followUpsDue,
  isLive,
  prospects,
  STAGES,
  STATUS_LABEL,
  TIERS,
  ugcDayActions,
  weekNumbers,
} from '@/data/ugc/model'
import { ensureProspect } from '@/data/ugc/ops'
import { useToday } from '@/hooks/useToday'
import { addDays, formatDayMonth } from '@/lib/date'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/cn'
import { commit, TierBadge, UgcActionRow } from './parts'

type Tab = 'agora' | 'pipeline' | 'marcas' | 'followups' | 'abordagens'
const TABS: { value: Tab; label: string }[] = [
  { value: 'agora', label: 'Agora' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'marcas', label: 'Marcas' },
  { value: 'followups', label: 'Follow-ups' },
  { value: 'abordagens', label: 'Abordagens' },
]

export default function UgcPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('aba') as Tab | null
  const tab: Tab = TABS.some((t) => t.value === raw) ? raw! : 'agora'
  return (
    <Page>
      <PageHeader title="UGC Business" eyebrow="Creator" back backTo={ROUTES.creator} />
      <Segmented variant="tabs" value={tab} onChange={(t) => setParams(t === 'agora' ? {} : { aba: t }, { replace: true })} options={TABS} className="mb-4" />
      {tab === 'agora' && <Agora />}
      {tab === 'pipeline' && <Pipeline />}
      {tab === 'marcas' && <Brands />}
      {tab === 'followups' && <FollowUps />}
      {tab === 'abordagens' && <History />}
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
      <input id="ugc-add-brand" value={name} onChange={(e) => setName(e.target.value)} placeholder="Adicionar marca (ex.: Galápagos)" autoFocus={autoFocus} className="input flex-1 min-w-0" aria-label="Nome da marca" />
      <button type="submit" disabled={!name.trim()} className="h-11 px-4 rounded-full bg-ink text-bg text-[14px] font-medium disabled:opacity-40">
        Adicionar
      </button>
    </form>
  )
}

// ─── Agora ──────────────────────────────────────────────────────────────────

function Agora() {
  const db = useUgcDB()
  const today = useToday()
  const actions = useMemo(() => ugcDayActions(db, today, today), [db, today])
  const open = actions.filter((a) => !a.done)
  const done = actions.filter((a) => a.done)
  const next = useMemo(() => {
    const out: { date: string; o: UgcOpportunity }[] = []
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i)
      for (const o of followUpsDue(db, d, today)) out.push({ date: d, o })
    }
    return out
  }, [db, today])
  const inConversation = db.ugcOpportunities.filter((o) => isLive(db, o) && o.stage === 'conversa')
  const w = weekNumbers(db, today)
  const empty = !db.brands.length

  return (
    <div className="space-y-6">
      {empty ? (
        <Card>
          <EmptyState compact emoji="🤝" title="Sua prospecção começa aqui" text="Adicione a primeira marca. Daqui pra frente, quem abordar, quando voltar a falar e o que respondeu aparece sozinho." action={<AddBrand autoFocus />} />
        </Card>
      ) : (
        <section aria-label="Precisa de você agora">
          <SectionTitle>Precisa de você agora</SectionTitle>
          {open.length ? (
            <ul className="divide-y divide-line/70">
              {open.map((a) => (
                <UgcActionRow key={`${a.kind}:${a.opportunity.id}`} action={a} />
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted py-2">{prospects(db).length ? 'Nada pendente agora ✨' : 'Nada pendente. Adicione marcas pra ter quem abordar amanhã.'}</p>
          )}
          {done.length > 0 && (
            <ul className="divide-y divide-line/70 mt-1">
              {done.map((a) => (
                <UgcActionRow key={`${a.kind}:${a.opportunity.id}:done`} action={a} />
              ))}
            </ul>
          )}
        </section>
      )}

      {inConversation.length > 0 && (
        <section>
          <SectionTitle>Em conversa</SectionTitle>
          <ul className="divide-y divide-line/70">
            {inConversation.map((o) => (
              <OppLine key={o.id} db={db} o={o} sub={o.responseReceivedAt ? `respondeu ${formatDayMonth(o.responseReceivedAt)}` : STATUS_LABEL[o.status]} />
            ))}
          </ul>
        </section>
      )}

      {next.length > 0 && (
        <section>
          <SectionTitle>Próximos follow-ups</SectionTitle>
          <ul className="divide-y divide-line/70">
            {next.map(({ date, o }) => (
              <OppLine key={o.id} db={db} o={o} sub={`${formatDayMonth(date)} · ${CHANNEL_LABEL[o.primaryChannel ?? 'dm']}`} />
            ))}
          </ul>
        </section>
      )}

      {!empty && (
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
      )}
    </div>
  )
}

function OppLine({ db, o, sub }: { db: DB; o: UgcOpportunity; sub?: string }) {
  const b = brandOf(db, o)
  return (
    <li>
      <Link to={ROUTES.ugcBrand(o.brandId)} className="flex items-center gap-2 min-h-[52px] py-1.5 active:opacity-70">
        <TierBadge tier={b?.priorityTier} />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] leading-snug truncate">{b?.name ?? o.title}</span>
          {sub && <span className="block text-[12.5px] text-muted truncate">{sub}</span>}
        </span>
      </Link>
    </li>
  )
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

function Pipeline() {
  const db = useUgcDB()
  const [stage, setStage] = useState(STAGES[0].id)
  const live = db.ugcOpportunities.filter((o) => isLive(db, o) || (o.stage === 'fechada' && o.status === 'concluida'))
  const list = live.filter((o) => o.stage === stage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Estágios">
        {STAGES.map((s) => {
          const n = live.filter((o) => o.stage === s.id).length
          return (
            <button key={s.id} type="button" role="tab" aria-selected={stage === s.id} onClick={() => setStage(s.id)} className={cn('h-9 px-3 rounded-full text-[13px] whitespace-nowrap shrink-0', stage === s.id ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
              {s.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          )
        })}
      </div>
      {list.length ? (
        <ul className="divide-y divide-line/70">
          {list.map((o) => (
            <OppLine key={o.id} db={db} o={o} sub={[STATUS_LABEL[o.status], o.nextFollowUpAt ? `follow-up ${formatDayMonth(o.nextFollowUpAt)}` : undefined, o.lastContactAt ? `último contato ${formatDayMonth(o.lastContactAt)}` : undefined].filter(Boolean).join(' · ')} />
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted">Nenhuma oportunidade em {STAGES.find((s) => s.id === stage)!.label.toLowerCase()}.</p>
      )}
    </div>
  )
}

// ─── Marcas ─────────────────────────────────────────────────────────────────

function Brands() {
  const db = useUgcDB()
  const [tier, setTier] = useState<BrandTier | undefined>()
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const rank = (t?: string) => (t ? TIERS.indexOf(t as BrandTier) : 9)
  const list = db.brands
    .filter((b) => !!b.archived === archived && (!tier || b.priorityTier === tier) && (!q || normalize(b.name).includes(normalize(q))))
    .sort((a, b) => rank(a.priorityTier) - rank(b.priorityTier) || a.name.localeCompare(b.name))
  return (
    <div className="space-y-4">
      <AddBrand />
      <div className="flex flex-wrap gap-1.5">
        <Chip selected={!tier} onClick={() => setTier(undefined)}>
          Todas
        </Chip>
        {TIERS.map((t) => (
          <Chip key={t} selected={tier === t} onClick={() => setTier(tier === t ? undefined : t)}>
            Tier {t}
          </Chip>
        ))}
        <Chip selected={archived} onClick={() => setArchived((v) => !v)}>
          Arquivadas
        </Chip>
      </div>
      {db.brands.length > 8 && <input id="ugc-brand-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca" className="input w-full" aria-label="Buscar marca" />}
      {list.length ? (
        <ul className="divide-y divide-line/70">
          {list.map((b) => {
            const o = db.ugcOpportunities.filter((x) => x.brandId === b.id).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0]
            const sub = [b.category, o ? STAGES.find((s) => s.id === o.stage)?.label : undefined, o?.lastContactAt ? `último contato ${formatDayMonth(o.lastContactAt)}` : 'sem contato ainda'].filter(Boolean).join(' · ')
            return (
              <li key={b.id}>
                <Link to={ROUTES.ugcBrand(b.id)} className="flex items-center gap-2 min-h-[52px] py-1.5 active:opacity-70">
                  <TierBadge tier={b.priorityTier} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] truncate">{b.name}</span>
                    <span className="block text-[12.5px] text-muted truncate">{sub}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[14px] text-muted">{archived ? 'Nenhuma marca arquivada.' : 'Nenhuma marca aqui ainda.'}</p>
      )}
    </div>
  )
}

// ─── Follow-ups ─────────────────────────────────────────────────────────────

function FollowUps() {
  const db = useUgcDB()
  const today = useToday()
  const live = db.ugcOpportunities.filter((o) => isLive(db, o) && o.nextFollowUpAt)
  const due = live.filter((o) => o.nextFollowUpAt! <= today && o.status !== 'sem_resposta')
  const soon = live.filter((o) => o.nextFollowUpAt! > today && o.status !== 'sem_resposta').sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!))
  const later = live.filter((o) => o.status === 'sem_resposta').sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!))
  const block = (title: string, list: UgcOpportunity[], sub: (o: UgcOpportunity) => string) =>
    list.length > 0 && (
      <section>
        <SectionTitle>{title}</SectionTitle>
        <ul className="divide-y divide-line/70">
          {list.map((o) => (
            <OppLine key={o.id} db={db} o={o} sub={sub(o)} />
          ))}
        </ul>
      </section>
    )
  if (!live.length) return <p className="text-[14px] text-muted">Ninguém pra cobrar agora. Os follow-ups nascem sozinhos quando você registra um contato.</p>
  return (
    <div className="space-y-6">
      {block('Hoje', due, (o) => `${o.nextFollowUpAt! < today ? 'era pra ' + formatDayMonth(o.nextFollowUpAt!) : 'hoje'} · follow-up ${(o.followUpStep ?? 0) + 1}`)}
      {block('Próximos', soon, (o) => `${formatDayMonth(o.nextFollowUpAt!)} · follow-up ${(o.followUpStep ?? 0) + 1} · ${CHANNEL_LABEL[o.primaryChannel ?? 'dm']}`)}
      {block('Sem resposta · reativar depois', later, (o) => `tentar de novo em ${formatDayMonth(o.nextFollowUpAt!)}`)}
    </div>
  )
}

// ─── Abordagens (histórico de contatos) ─────────────────────────────────────

const TYPE_LABEL = { primeiro_contato: 'primeiro contato', follow_up: 'follow-up', resposta: 'resposta', proposta: 'proposta', reuniao: 'reunião', mensagem: 'mensagem' } as const

function History() {
  const db = useUgcDB()
  const drafts = db.ugcMessages.filter((m) => m.status === 'rascunho' || m.status === 'aprovada').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const list = [...db.ugcInteractions].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).slice(0, 100)
  if (!list.length && !drafts.length) return <p className="text-[14px] text-muted">Os contatos que você registrar e as mensagens que escrever pra cada marca aparecem aqui.</p>
  return (
    <div className="space-y-5">
      {drafts.length > 0 && (
        <section aria-label="Rascunhos">
          <SectionTitle>Rascunhos — ainda não enviados</SectionTitle>
          <ul className="divide-y divide-line/70">
            {drafts.map((m) => (
              <li key={m.id}>
                <Link to={ROUTES.ugcBrand(m.brandId)} className="block min-h-[52px] py-2 active:opacity-70">
                  <span className="block text-[15px]">{db.brands.find((b) => b.id === m.brandId)?.name ?? 'Marca'}</span>
                  <span className="block text-[12.5px] text-muted truncate">
                    {CHANNEL_LABEL[m.channel]} · {m.status} · {(m.approvedText ?? m.generatedText ?? '').slice(0, 80)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {list.length > 0 && (
        <section aria-label="Contatos">
          {drafts.length > 0 && <SectionTitle>Contatos</SectionTitle>}
          <ul className="divide-y divide-line/70">
            {list.map((i) => {
              const b = db.brands.find((x) => x.id === i.brandId)
              return (
                <li key={i.id}>
                  <Link to={ROUTES.ugcBrand(i.brandId)} className="flex items-start gap-3 min-h-[52px] py-2 active:opacity-70">
                    <span className="w-12 shrink-0 text-[12.5px] text-muted tabular-nums pt-0.5">{formatDayMonth(i.date)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px]">
                        {i.direction === 'out' ? '→' : '←'} {b?.name ?? 'Marca'}
                      </span>
                      <span className="block text-[12.5px] text-muted">
                        {CHANNEL_LABEL[i.channel]} · {TYPE_LABEL[i.type]}
                        {i.content ? ` · ${i.content.slice(0, 80)}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
