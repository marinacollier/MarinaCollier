import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ExternalLink, Pencil, Plus, X } from 'lucide-react'
import { actions, useDB } from '@/data/store'
import type { Expense, Trip, TripItem, TripSection } from '@/data/types'
import { useToday } from '@/hooks/useToday'
import { ROUTES } from '@/app/routes'
import { openSheet, toast } from '@/app/ui-store'
import { Button, Card, EmptyState, IconButton, Page, Pill, ProgressBar, TextArea } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatBRL } from '@/lib/money'
import { formatShortDate } from '@/lib/date'
import { Postcard, toneVars } from './Postcard'
import { SectionItems } from './TripItems'
import {
  TRIP_STATUS_LABEL,
  TRIP_TABS,
  budgetSummary,
  checklistProgress,
  itemsOfTrip,
  sectionCounts,
  tabMeta,
  tripCountdown,
  tripDatesLabel,
  tripExpenses,
  type TripTab,
} from './selectors'

export default function TripPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const today = useToday()
  const trips = useDB((db) => db.trips)
  const allItems = useDB((db) => db.tripItems)
  const expenses = useDB((db) => db.expenses)
  const trip = useMemo(() => trips.find((t) => t.id === id), [trips, id])
  const items = useMemo(() => (id ? itemsOfTrip(allItems, id) : []), [allItems, id])
  const counts = useMemo(() => sectionCounts(items), [items])
  const progress = useMemo(() => checklistProgress(items), [items])
  const [params, setParams] = useSearchParams()
  const tab = (TRIP_TABS.some((t) => t.id === params.get('s')) ? params.get('s') : 'visao') as TripTab
  const setTab = (t: TripTab) => setParams(t === 'visao' ? {} : { s: t }, { replace: true })

  const navRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  if (!trip) {
    return (
      <Page>
        <div className="pt-2">
          <IconButton label="Voltar" onClick={() => nav(ROUTES.trips)}>
            <ChevronLeft size={24} />
          </IconButton>
        </div>
        <EmptyState emoji="🧳" title="Essa viagem não está mais aqui" text="Talvez tenha sido apagada." action={<Button onClick={() => nav(ROUTES.trips)}>Ver viagens</Button>} />
      </Page>
    )
  }

  const meta = tabMeta(tab)

  return (
    <Page>
      <header className="pt-2 pb-3 flex items-center justify-between -mx-1.5">
        <IconButton label="Voltar" onClick={() => (history.length > 1 ? nav(-1) : nav(ROUTES.trips))}>
          <ChevronLeft size={24} />
        </IconButton>
        <IconButton label="Editar viagem" onClick={() => openSheet('trip', { id: trip.id })}>
          <Pencil size={19} />
        </IconButton>
      </header>

      <Postcard
        variant="hero"
        dense
        trip={trip}
        eyebrow={TRIP_STATUS_LABEL[trip.status]}
        datesLabel={tripDatesLabel(trip)}
        countdown={tripCountdown(trip, today)}
        footer={
          <button type="button" className="w-full text-left" onClick={() => setTab('antes_de_ir')}>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="eyebrow" style={{ color: 'var(--pc-ink)' }}>
                antes de ir
              </span>
              <span className="text-ink-2">
                {progress.total ? (
                  <>
                    <b className="font-semibold text-ink">{progress.done}</b> de {progress.total} prontos
                  </>
                ) : (
                  'começar checklist →'
                )}
              </span>
            </div>
            {progress.total > 0 && <ProgressBar className="mt-2 bg-surface/70" value={progress.done} max={progress.total} tone={trip.tone} />}
          </button>
        }
      />

      {/* Section navigation */}
      <div className="sticky top-0 z-20 -mx-4 mt-4 bg-bg/92 backdrop-blur-md">
        <div ref={navRef} className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-2.5" role="tablist" aria-label="Seções da viagem">
          {TRIP_TABS.map((t) => {
            const c = t.items ? counts[t.id as TripSection] : undefined
            const active = t.id === tab
            return (
              <button
                key={t.id}
                data-tab={t.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full text-[13.5px] border shrink-0 transition active:scale-[0.97]',
                  active ? 'bg-ink text-bg border-ink font-semibold' : 'bg-surface border-line text-ink-2',
                )}
              >
                <span aria-hidden>{t.emoji}</span>
                {t.label}
                {c && c.total > 0 && <span className={cn('text-[11.5px] tabular-nums', active ? 'opacity-70' : 'text-muted')}>{c.total}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="mt-3">
        {meta.items ? (
          <SectionItems trip={trip} section={tab as TripSection} items={items} />
        ) : tab === 'visao' ? (
          <Overview trip={trip} items={items} counts={counts} onGo={setTab} />
        ) : tab === 'orcamento' ? (
          <Budget trip={trip} expenses={expenses} items={items} />
        ) : tab === 'gastos' ? (
          <Expenses trip={trip} expenses={expenses} />
        ) : tab === 'links' ? (
          <Links trip={trip} />
        ) : tab === 'notas' ? (
          <FreeText trip={trip} field="notes" placeholder="Ideias, dicas que te passaram, lembretes soltos…" emoji="📝" />
        ) : (
          <FreeText
            trip={trip}
            field="emergencyInfo"
            emoji="🆘"
            placeholder={'Contatos de emergência, seguro (nº da apólice), embaixada/consulado, alergias, tipo sanguíneo…'}
            hint="Fica salvo no seu aparelho, funciona offline."
          />
        )}
      </motion.div>
    </Page>
  )
}

// ─── Visão geral ────────────────────────────────────────────────────────────

function Overview({ trip, items, counts, onGo }: { trip: Trip; items: TripItem[]; counts: ReturnType<typeof sectionCounts>; onGo: (t: TripTab) => void }) {
  const toConfirm = items.filter((i) => i.status === 'a_confirmar').length
  const tiles = TRIP_TABS.filter((t) => t.items && counts[t.id as TripSection]?.total)
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        {trip.summary ? (
          <p className="font-display text-[19px] leading-snug">{trip.summary}</p>
        ) : (
          <button type="button" className="text-[14px] text-muted text-left" onClick={() => openSheet('trip', { id: trip.id })}>
            Escreve um resumo da viagem em uma frase ✍️
          </button>
        )}
        {trip.interests.length > 0 && (
          <div>
            <div className="eyebrow mb-2">interesses</div>
            <div className="flex flex-wrap gap-1.5" style={toneVars(trip.tone)}>
              {trip.interests.map((i) => (
                <span
                  key={i}
                  className="h-7 px-2.5 inline-flex items-center rounded-full text-[13px]"
                  style={{ color: 'var(--pc-ink)', background: 'color-mix(in oklab, var(--pc) 12%, var(--surface))' }}
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
          <div>
            <dt className="eyebrow">companhia</dt>
            <dd className="mt-1">{trip.companions || <span className="text-muted">—</span>}</dd>
          </div>
          <div>
            <dt className="eyebrow">datas</dt>
            <dd className="mt-1">
              {tripDatesLabel(trip)}
              <span className="block text-[12px] text-muted">{trip.datesConfirmed ? 'confirmadas' : 'a confirmar'}</span>
            </dd>
          </div>
        </dl>
        {trip.notes && (
          <button type="button" onClick={() => onGo('notas')} className="block w-full text-left rounded-xl bg-surface-2 p-3 text-[13.5px] text-ink-2 line-clamp-3 whitespace-pre-line">
            {trip.notes}
          </button>
        )}
      </Card>

      {toConfirm > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-sand-soft px-4 py-3 text-[13.5px]">
          <span aria-hidden>🔎</span>
          <span className="text-ink-2">
            <b className="font-semibold text-ink">{toConfirm}</b> {toConfirm === 1 ? 'coisa ainda está' : 'coisas ainda estão'} “a confirmar” — sem pressa, só pra não esquecer.
          </span>
        </div>
      )}

      {tiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          {tiles.map((t) => {
            const c = counts[t.id as TripSection]!
            return (
              <button key={t.id} type="button" onClick={() => onGo(t.id)} className="card p-3 text-left active:scale-[0.98] transition">
                <div className="text-xl leading-none" aria-hidden>
                  {t.emoji}
                </div>
                <div className="text-[13px] font-medium mt-2 truncate">{t.label}</div>
                <div className="text-[11.5px] text-muted mt-0.5">
                  {c.total} {c.total === 1 ? 'item' : 'itens'}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex justify-center pt-1">
        <Button variant="soft" size="sm" icon={<Pencil size={14} />} onClick={() => openSheet('trip', { id: trip.id })}>
          Editar viagem
        </Button>
      </div>
    </div>
  )
}

// ─── Orçamento / gastos ─────────────────────────────────────────────────────

const addExpense = (trip: Trip) => openSheet('expense', { defaults: { tripId: trip.id, categoryId: 'cat-viagem' } })

function Budget({ trip, expenses, items }: { trip: Trip; expenses: Expense[]; items: TripItem[] }) {
  const s = useMemo(() => budgetSummary(trip, expenses), [trip, expenses])
  const noted = items.filter((i) => i.amountCents != null && i.status !== 'cancelado').reduce((sum, i) => sum + (i.amountCents ?? 0), 0)
  return (
    <div className="space-y-4">
      <Card>
        <div className="eyebrow">gasto até agora</div>
        <div className="font-display text-[34px] leading-none mt-1.5">{formatBRL(s.spentCents)}</div>
        {s.budgetCents != null ? (
          <>
            <div className="text-[13.5px] text-muted mt-1.5">de {formatBRL(s.budgetCents)} planejados</div>
            <ProgressBar className="mt-3" value={s.spentCents} max={s.budgetCents} tone={trip.tone} />
            <div className="text-[13.5px] mt-2.5 text-ink-2">
              {s.leftCents! >= 0 ? (
                <>
                  Ainda tem <b className="font-semibold text-ink">{formatBRL(s.leftCents!)}</b> no plano 🌿
                </>
              ) : (
                <>
                  <b className="font-semibold text-ink">{formatBRL(-s.leftCents!)}</b> além do planejado — tudo bem, é só pra você saber.
                </>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <span className="text-[13.5px] text-muted">Sem orçamento definido.</span>
            <Button variant="soft" size="sm" onClick={() => openSheet('trip', { id: trip.id })}>
              Definir orçamento
            </Button>
          </div>
        )}
      </Card>

      {(s.plannedCents > 0 || noted > 0) && (
        <div className="grid grid-cols-2 gap-2.5">
          {s.plannedCents > 0 && (
            <div className="card p-3.5">
              <div className="eyebrow">compras planejadas</div>
              <div className="font-display text-[20px] mt-1">{formatBRL(s.plannedCents)}</div>
            </div>
          )}
          {noted > 0 && (
            <div className="card p-3.5">
              <div className="eyebrow">anotado nos itens</div>
              <div className="font-display text-[20px] mt-1">{formatBRL(noted)}</div>
            </div>
          )}
        </div>
      )}

      <Button block icon={<Plus size={17} />} onClick={() => addExpense(trip)}>
        Adicionar gasto
      </Button>
    </div>
  )
}

function Expenses({ trip, expenses }: { trip: Trip; expenses: Expense[] }) {
  const list = useMemo(() => tripExpenses(expenses, trip.id), [expenses, trip.id])
  return (
    <div className="space-y-4">
      {list.length ? (
        <div className="card overflow-hidden divide-y divide-line/70">
          {list.map((e) => (
            <button key={e.id} type="button" onClick={() => openSheet('expense', { id: e.id })} className="w-full flex items-center gap-3 px-4 min-h-[56px] py-2 text-left active:bg-surface-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] truncate">{e.title}</span>
                <span className="block text-[12.5px] text-muted">{e.date ? formatShortDate(e.date) : 'sem data'}</span>
              </span>
              {e.status === 'planned_purchase' && <Pill>planejada</Pill>}
              <span className="font-display text-[16px] tabular-nums">{formatBRL(e.amountCents)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState compact emoji="🧾" title="Nenhum gasto ainda" text="Quando rolar, anota aqui em segundos." />
        </div>
      )}
      <Button block variant={list.length ? 'soft' : 'primary'} icon={<Plus size={17} />} onClick={() => addExpense(trip)}>
        Adicionar gasto
      </Button>
    </div>
  )
}

// ─── Links / notas / emergência ─────────────────────────────────────────────

function Links({ trip }: { trip: Trip }) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const add = () => {
    const u = url.trim()
    if (!u) return
    const full = /^https?:\/\//i.test(u) ? u : `https://${u}`
    let fallback = u
    try {
      fallback = new URL(full).hostname.replace(/^www\./, '')
    } catch {
      /* keep raw text */
    }
    actions.update('trips', trip.id, { links: [...trip.links, { label: label.trim() || fallback, url: full }] })
    setLabel('')
    setUrl('')
    toast('Link salvo 🔗')
  }
  const remove = (idx: number) => {
    const prev = trip.links
    actions.update('trips', trip.id, { links: prev.filter((_, i) => i !== idx) })
    toast('Link apagado', { action: { label: 'Desfazer', run: () => actions.update('trips', trip.id, { links: prev }) } })
  }
  return (
    <div className="space-y-4">
      {trip.links.length > 0 ? (
        <div className="card overflow-hidden divide-y divide-line/70">
          {trip.links.map((l, i) => (
            <div key={`${l.url}-${i}`} className="flex items-center gap-1 pl-4 pr-1.5 min-h-[56px]">
              <a href={l.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 py-2 flex items-center gap-2.5">
                <ExternalLink size={16} className="text-muted shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[15px] truncate">{l.label}</span>
                  <span className="block text-[12px] text-muted truncate">{l.url.replace(/^https?:\/\//, '')}</span>
                </span>
              </a>
              <IconButton label="Apagar link" size="sm" onClick={() => remove(i)}>
                <X size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState compact emoji="🔗" title="Nenhum link ainda" text="Guia, mapa salvo, reserva, aquele reels…" />
        </div>
      )}
      <form
        className="card p-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input className="input" placeholder="Cole o link" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="URL" />
        <div className="flex gap-2">
          <input className="input" placeholder="Nome (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Nome do link" />
          <Button type="submit" disabled={!url.trim()} className="shrink-0 h-12">
            Salvar
          </Button>
        </div>
      </form>
    </div>
  )
}

function FreeText({ trip, field, placeholder, emoji, hint }: { trip: Trip; field: 'notes' | 'emergencyInfo'; placeholder: string; emoji: string; hint?: string }) {
  const [text, setText] = useState(trip[field] ?? '')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<string | null>(null)
  const tripId = trip.id
  useEffect(() => {
    return () => {
      clearTimeout(timer.current)
      if (pending.current !== null) actions.update('trips', tripId, { [field]: pending.current.trim() ? pending.current : undefined })
    }
  }, [tripId, field])
  const save = (v: string) => {
    pending.current = null
    actions.update('trips', tripId, { [field]: v.trim() ? v : undefined })
  }
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 px-1 pb-1.5 text-[13px] text-muted">
        <span aria-hidden>{emoji}</span>
        {hint ?? 'Salva sozinho enquanto você escreve.'}
      </div>
      <TextArea
        rows={10}
        value={text}
        placeholder={placeholder}
        className="bg-transparent px-1"
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          pending.current = v
          clearTimeout(timer.current)
          timer.current = setTimeout(() => save(v), 400)
        }}
        onBlur={() => {
          clearTimeout(timer.current)
          save(text)
        }}
      />
    </div>
  )
}
