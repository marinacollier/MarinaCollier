/**
 * One brand: who it is (progressive — nothing required but the name), her relationship with it (never
 * assumed), its opportunities (Brand ≠ Opportunity) and every contact, both ways.
 * Actions on the live opportunity: register a contact (channel), "respondeu", move stage, close with value,
 * payment received, lost / refused / paused, new opportunity.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { Card, EmptyState, Field, MoneyInput, Page, PageHeader, SectionTitle, TextArea } from '@/components/ui'
import { useDB } from '@/data/store'
import type { Brand, BrandTier, UgcChannel, UgcDealType, UgcOpportunity } from '@/data/types'
import { CHANNEL_LABEL, CHANNELS, STAGES, stageIndex, STATUS_LABEL, TIERS, TYPE_LABEL } from '@/data/ugc/model'
import { addOpportunity, archiveBrand, closeDeal, endOpportunity, markPaid, recordOutbound, recordReply, reopenOpportunity, setOpportunityType, setStage, updateBrand } from '@/data/ugc/ops'
import { useToday } from '@/hooks/useToday'
import { formatBRL } from '@/lib/money'
import { formatDayMonth } from '@/lib/date'
import { cn } from '@/lib/cn'
import { commit } from './parts'
import { WriteSection } from './WriteSection'
import { BrandCrmSection } from './Business'
import { LEVEL_LABEL, MIN_OUTCOMES, outcomes, potential } from '@/data/ugc/score'

const tri = (v?: boolean) => (v === true ? 'sim' : v === false ? 'nao' : 'nao_sei')

function Choice<T extends string>({ value, options, onPick, label }: { value?: T; options: { value: T; label: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onPick(o.value)} className={cn('h-9 px-3 rounded-full text-[13px]', value === o.value ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A text field saved when she leaves it (one write, with Desfazer). */
function Saved({ id, label, value, placeholder, onSave }: { id: string; label: string; value?: string; placeholder?: string; onSave: (v: string | undefined) => void }) {
  const [v, setV] = useState(value ?? '')
  return (
    <Field label={label}>
      <input
        id={id}
        className="input w-full"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const next = v.trim() || undefined
          if (next !== (value ?? undefined)) onSave(next)
        }}
      />
    </Field>
  )
}

export default function BrandPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const brand = useDB((db) => db.brands.find((b) => b.id === id))
  const opps = useDB((db) => db.ugcOpportunities)
  const inter = useDB((db) => db.ugcInteractions)
  const today = useToday()
  const mine = useMemo(() => opps.filter((o) => o.brandId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [opps, id])
  const history = useMemo(() => inter.filter((i) => i.brandId === id).sort((a, b) => b.sentAt.localeCompare(a.sentAt)), [inter, id])

  if (!brand)
    return (
      <Page>
        <PageHeader title="Marca" back backTo={ROUTES.ugc} />
        <EmptyState title="Essa marca não está mais aqui" text="Talvez tenha sido apagada." />
      </Page>
    )
  const save = (p: Partial<Brand>, msg = 'Salvo ✓') => commit(() => updateBrand(brand.id, p), msg)
  const live = mine.filter((o) => !['perdida', 'recusada', 'concluida', 'pausada'].includes(o.status))

  return (
    <Page>
      <PageHeader title={brand.name} eyebrow="UGC Business" back backTo={`${ROUTES.ugc}?aba=marcas`} />
      {brand.archived && <p className="text-[14px] text-muted -mt-2 mb-3">Arquivada — fora das filas. O histórico fica.</p>}

      <div className="space-y-6">
        <section aria-label="Prioridade">
          <SectionTitle>Prioridade</SectionTitle>
          <Choice label="Tier" value={brand.priorityTier} options={TIERS.map((t) => ({ value: t, label: `Tier ${t}` }))} onPick={(t: BrandTier) => save({ priorityTier: brand.priorityTier === t ? undefined : t }, `Tier ${t} ✓`)} />
          <p className="text-[12.5px] text-muted mt-1.5">S sonho · A muito importante · B boa oportunidade · C volume</p>
        </section>

        <BrandCrmSection brand={brand} />

        {!brand.archived && !brand.crm?.noFollowUp && <PotentialCard brand={brand} today={today} />}

        {/* Opportunities */}
        <section aria-label="Oportunidades">
          <SectionTitle
            action={
              <button type="button" className="text-[13px] text-accent font-medium h-8 px-1" onClick={() => commit(() => addOpportunity(brand.id, { title: `${brand.name} · nova oportunidade` }).undo, 'Nova oportunidade ✓')}>
                + oportunidade
              </button>
            }
          >
            Oportunidades
          </SectionTitle>
          {mine.length ? (
            <div className="space-y-3">
              {mine.map((o) => (
                <OpportunityCard key={o.id} o={o} today={today} defaultOpen={live[0]?.id === o.id || mine.length === 1} />
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-muted">Nenhuma oportunidade ainda.</p>
          )}
        </section>

        {!brand.archived && <WriteSection brand={brand} />}

        {/* Relationship — never assumed */}
        <section aria-label="Relação com a marca">
          <SectionTitle>Sua relação com a marca</SectionTitle>
          <Card className="space-y-4">
            <Field label="Já é cliente?">
              <Choice label="Já é cliente" value={tri(brand.alreadyCustomer)} options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }, { value: 'nao_sei', label: 'Não informado' }]} onPick={(v) => save({ alreadyCustomer: v === 'sim' ? true : v === 'nao' ? false : undefined })} />
            </Field>
            <Field label="Já usou o produto?">
              <Choice label="Já usou" value={tri(brand.alreadyUsedProduct)} options={[{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }, { value: 'nao_sei', label: 'Não informado' }]} onPick={(v) => save({ alreadyUsedProduct: v === 'sim' ? true : v === 'nao' ? false : undefined })} />
            </Field>
            <Saved id={`b-how-${brand.id}`} label="Como conheceu" value={brand.howDiscovered} placeholder="indicação, atletas, no triathlon, propaganda…" onSave={(v) => save({ howDiscovered: v })} />
          </Card>
        </section>

        {/* Card — progressive */}
        <section aria-label="Ficha">
          <SectionTitle>Ficha</SectionTitle>
          <Card className="space-y-3">
            <Saved id={`b-cat-${brand.id}`} label="Categoria" value={brand.category} placeholder="Outdoor, Suplementação, Fintech…" onSave={(v) => save({ category: v })} />
            <Saved id={`b-prod-${brand.id}`} label="Produtos" value={brand.products?.join(', ')} placeholder="mochilas, botas, whey…" onSave={(v) => save({ products: v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined })} />
            <Saved id={`b-ig-${brand.id}`} label="Instagram" value={brand.instagram} placeholder="@marca" onSave={(v) => save({ instagram: v })} />
            <Saved id={`b-site-${brand.id}`} label="Site" value={brand.website} placeholder="marca.com.br" onSave={(v) => save({ website: v })} />
            <Saved
              id={`b-mail-${brand.id}`}
              label="E-mail de contato"
              value={brand.contactChannels?.find((c) => c.channel === 'email')?.value}
              placeholder="marketing@marca.com"
              onSave={(v) => save({ contactChannels: [...(brand.contactChannels ?? []).filter((c) => c.channel !== 'email'), ...(v ? [{ channel: 'email' as const, value: v }] : [])] })}
            />
            <Saved
              id={`b-person-${brand.id}`}
              label="Pessoa de marketing"
              value={brand.knownContacts?.[0] ? [brand.knownContacts[0].name, brand.knownContacts[0].role].filter(Boolean).join(' · ') : undefined}
              placeholder="Nome · cargo"
              onSave={(v) => {
                const [name, role] = (v ?? '').split('·').map((s) => s.trim())
                save({ knownContacts: name ? [{ ...brand.knownContacts?.[0], name, role: role || undefined }, ...(brand.knownContacts ?? []).slice(1)] : (brand.knownContacts ?? []).slice(1) })
              }}
            />
            <Field label="Observações">
              <TextArea defaultValue={brand.notes} onBlur={(e) => (e.target.value.trim() || undefined) !== brand.notes && save({ notes: e.target.value.trim() || undefined })} placeholder="O que você sabe da marca (produtos, campanhas, tom)…" />
            </Field>
          </Card>
        </section>

        {/* History */}
        <section aria-label="Histórico">
          <SectionTitle>Histórico</SectionTitle>
          {history.length ? (
            <ul className="divide-y divide-line/70">
              {history.map((i) => (
                <li key={i.id} className="flex gap-3 py-2 text-[14px]">
                  <span className="w-12 shrink-0 text-muted tabular-nums">{formatDayMonth(i.date)}</span>
                  <span className="flex-1 min-w-0">
                    {i.direction === 'out' ? 'Você →' : '← Marca'} · {CHANNEL_LABEL[i.channel]} · {i.type.replace('_', ' ')}
                    {i.content && <span className="block text-muted text-[13px]">{i.content}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">Nenhum contato registrado ainda.</p>
          )}
        </section>

        {!brand.archived && (
          <button
            type="button"
            className="text-[13px] text-muted h-10"
            onClick={() => {
              commit(() => archiveBrand(brand.id), `${brand.name} arquivada`)
              nav(`${ROUTES.ugc}?aba=marcas`)
            }}
          >
            Não faz mais sentido — arquivar marca
          </button>
        )}
      </div>
    </Page>
  )
}

function OpportunityCard({ o, today, defaultOpen }: { o: UgcOpportunity; today: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [channel, setChannel] = useState<UgcChannel>(o.primaryChannel ?? 'dm')
  const [closing, setClosing] = useState(false)
  const [value, setValue] = useState<number | undefined>(o.agreedValueCents)
  const liveNow = !['perdida', 'recusada', 'concluida', 'pausada'].includes(o.status)
  const at = stageIndex(o.stage)
  return (
    <Card className="space-y-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="w-full text-left">
        <span className="block text-[15.5px] font-medium">{o.title}</span>
        <span className="block text-[13px] text-muted">
          {[STAGES[at]?.label, STATUS_LABEL[o.status], o.type ? TYPE_LABEL[o.type] : undefined, o.nextFollowUpAt && liveNow ? `follow-up ${formatDayMonth(o.nextFollowUpAt)}` : undefined, o.agreedValueCents ? formatBRL(o.agreedValueCents) : undefined].filter(Boolean).join(' · ')}
        </span>
      </button>
      {open && (
        <div className="space-y-4">
          {/* Pipeline */}
          <div role="radiogroup" aria-label="Estágio" className="flex flex-wrap gap-1.5">
            {STAGES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={o.stage === s.id}
                onClick={() => s.id !== o.stage && commit(() => setStage(o.id, s.id, today), `${s.label} ✓`)}
                className={cn('h-8 px-2.5 rounded-full text-[12.5px]', o.stage === s.id ? 'bg-ink text-bg' : i < at ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2')}
              >
                {s.label}
              </button>
            ))}
          </div>

          {liveNow && (
            <>
              <Field label="Registrar contato">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CHANNELS.map((c) => (
                    <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)} className={cn('h-8 px-2.5 rounded-full text-[12.5px]', channel === c ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                      {CHANNEL_LABEL[c]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="h-10 px-4 rounded-full bg-ink text-bg text-[13.5px] font-medium" onClick={() => commit(() => recordOutbound(o.id, channel, { date: today }).undo, `${CHANNEL_LABEL[channel]} registrada ✓`)}>
                    {o.firstContactAt ? (o.responseReceivedAt ? 'Respondi' : 'Mandei follow-up') : `Mandei ${CHANNEL_LABEL[channel]}`}
                  </button>
                  <button type="button" className="h-10 px-4 rounded-full bg-surface-2 text-[13.5px]" onClick={() => commit(() => recordReply(o.id, { date: today }, channel), 'Respondeu ✓ follow-ups cancelados')}>
                    Marca respondeu
                  </button>
                </div>
              </Field>

              <Field label="Tipo">
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(TYPE_LABEL) as UgcDealType[]).map((t) => (
                    <button key={t} type="button" aria-pressed={o.type === t} onClick={() => commit(() => setOpportunityType(o.id, o.type === t ? undefined : t), 'Tipo ✓')} className={cn('h-8 px-2.5 rounded-full text-[12.5px]', o.type === t ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                      {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </Field>

              {closing ? (
                <div className="space-y-2">
                  <Field label="Valor combinado (opcional)">
                    <MoneyInput valueCents={value} onChange={setValue} />
                  </Field>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="h-10 px-4 rounded-full bg-ink text-bg text-[13.5px] font-medium"
                      onClick={() => {
                        commit(() => closeDeal(o.id, today, value), value ? `Fechada por ${formatBRL(value)} ✓ previsto no Dinheiro` : 'Fechada ✓')
                        setClosing(false)
                      }}
                    >
                      Confirmar
                    </button>
                    <button type="button" className="h-10 px-3 text-[13.5px] text-muted" onClick={() => setClosing(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {at < stageIndex('producao') && (
                    <button type="button" className="h-9 px-3 rounded-full bg-accent-soft text-accent text-[13px] font-medium" onClick={() => setClosing(true)}>
                      Fechei
                    </button>
                  )}
                  {at >= stageIndex('producao') && !o.paidAt && (
                    <button type="button" className="h-9 px-3 rounded-full bg-accent-soft text-accent text-[13px] font-medium" onClick={() => commit(() => markPaid(o.id, today), 'Pagamento recebido ✓')}>
                      Recebi o pagamento
                    </button>
                  )}
                  <button type="button" className="h-9 px-3 rounded-full bg-surface-2 text-[13px]" onClick={() => commit(() => endOpportunity(o.id, 'recusada'), 'Recusada — saiu das filas')}>
                    Recusou
                  </button>
                  <button type="button" className="h-9 px-3 rounded-full bg-surface-2 text-[13px]" onClick={() => commit(() => endOpportunity(o.id, 'pausada'), 'Pausada')}>
                    Pausar
                  </button>
                  <button type="button" className="h-9 px-3 rounded-full bg-surface-2 text-[13px]" onClick={() => commit(() => endOpportunity(o.id, 'perdida', 'não faz mais sentido'), 'Perdida — saiu das filas')}>
                    Perdida
                  </button>
                </div>
              )}
            </>
          )}
          {!liveNow && (
            <button type="button" className="h-9 px-3 rounded-full bg-surface-2 text-[13px]" onClick={() => commit(() => reopenOpportunity(o.id), 'Reaberta ✓')}>
              Reabrir
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

/** Why this brand is (or isn't) promising now — the reasons, never a made-up percentage. */
function PotentialCard({ brand, today }: { brand: Brand; today: string }) {
  const db = useDB((d) => d)
  const p = potential(db, brand, today)
  const known = outcomes(db).length
  return (
    <section aria-label="Potencial">
      <SectionTitle>Potencial</SectionTitle>
      <Card className="space-y-2">
        <p className="text-[15.5px] font-medium">{LEVEL_LABEL[p.level].replace(/^p/, 'P')}</p>
        <ul className="text-[13.5px] space-y-1">
          {p.reasons.map((r) => (
            <li key={r}>+ {r}</li>
          ))}
          {p.against.map((r) => (
            <li key={r} className="text-muted">− {r}</li>
          ))}
        </ul>
        <p className="text-[12px] text-muted">
          {p.fromData ? `Com ${known} contatos com resultado, os números já entram nos motivos.` : `Sem porcentagem: só com ${MIN_OUTCOMES}+ contatos com resultado (hoje ${known}). Seu tier continua mandando na fila.`}
        </p>
      </Card>
    </section>
  )
}
