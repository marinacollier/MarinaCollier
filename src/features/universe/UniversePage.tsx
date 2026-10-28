/**
 * MEU UNIVERSO · Beauty & Fragrance — her personal library. Fragrâncias is the default shelf; the other shelves are
 * filters. Three tabs: Coleção (Tenho · Wishlist · Compras · Comparar) · Usar hoje · DNA & diário.
 * Owning, liking and wanting never mix: the collection shows only what is hers; "Usar hoje" picks only from it.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react'
import { Button, Chip, ChipSelect, EmptyState, IconButton, Page, PageHeader, SectionTitle, Segmented, Select, SheetFrame } from '@/components/ui'
import { actions, useDB } from '@/data/store'
import type { DB, UniverseCategory, UniverseItem } from '@/data/types'
import {
  CATEGORY_LABEL,
  DIARY_STATUS_LABEL,
  FRAGRANCE_CATEGORIES,
  OCCASION_LABEL,
  OPINION_LABEL,
  OWNERSHIP_LABEL,
  SHELVES,
  WEAR_OCCASION_LABEL,
  closestOwned,
  collection,
  compare,
  history,
  itemTitle,
  money,
  moveInWishGroup,
  pricePerMl,
  purchases,
  recommend,
  scentDNA,
  spentByCurrency,
  wishlist,
  type Intensity,
  type Setting,
  type TempBand,
  type TimeOfDay,
  type WearInput,
  type WearOccasion,
} from '@/data/universe/model'
import { useToday } from '@/hooks/useToday'
import { formatShortDate } from '@/lib/date'
import { pluralize } from '@/lib/text'
import { Bottle, CountBar, ItemCard, ItemRow } from './parts'
import { ItemDetailSheet, ItemFormSheet, LogFormSheet, ProfileFormSheet } from './sheets'

type Tab = 'colecao' | 'hoje' | 'dna'
type View = 'tenho' | 'wishlist' | 'compras' | 'comparar'
type SheetState =
  | { kind: 'detail'; id: string }
  | { kind: 'item'; id?: string; defaults?: Partial<UniverseItem> }
  | { kind: 'log'; id?: string; itemId?: string }
  | { kind: 'profile' }
  | null

const TABS: { value: Tab; label: string }[] = [
  { value: 'colecao', label: 'Coleção' },
  { value: 'hoje', label: 'Usar hoje' },
  { value: 'dna', label: 'DNA & diário' },
]

const readTab = (v: string | null): Tab => (v === 'hoje' || v === 'dna' ? v : 'colecao')

export default function UniversePage() {
  const db = useDB()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const tab = readTab(params.get('aba'))
  const shelfKey = SHELVES.some((s) => s.key === params.get('estante')) ? params.get('estante')! : 'fragrancias'
  const shelf = SHELVES.find((s) => s.key === shelfKey)!
  const fragrances = shelf.key === 'fragrancias'
  const [view, setView] = useState<View>('tenho')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [compareIds, setCompareIds] = useState<[string?, string?]>([])

  // Deep link from search / Lumos: ?item=<id> opens it.
  const linked = params.get('item')
  useEffect(() => {
    if (!linked) return
    if (db.universeItems.some((i) => i.id === linked)) setSheet({ kind: 'detail', id: linked })
    const next = new URLSearchParams(params)
    next.delete('item')
    setParams(next, { replace: true })
  }, [linked, db.universeItems, params, setParams])

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const owned = useMemo(() => collection(db, shelf.categories), [db, shelf])
  const subtitle = fragrances ? `${pluralize(owned.length, 'fragrância sua', 'fragrâncias suas')} · beauty & fragrance` : `${shelf.label.toLowerCase()} · ${pluralize(owned.length, 'item seu', 'itens seus')}`

  const close = () => setSheet(null)
  const openCompare = (id: string) => {
    setCompareIds([id, undefined])
    setParam('aba', undefined)
    setView('comparar')
    close()
  }

  return (
    <Page>
      <PageHeader
        back
        backTo="/espacos"
        eyebrow="vida"
        title="Meu Universo"
        subtitle={subtitle}
        actions={
          <IconButton label="Adicionar" onClick={() => setSheet({ kind: 'item', defaults: { category: shelf.categories[0], ownership: 'tenho' } })}>
            <Plus size={22} />
          </IconButton>
        }
      />

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mb-3">
        {SHELVES.map((s) => (
          <Chip key={s.key} selected={s.key === shelfKey} onClick={() => setParam('estante', s.key === 'fragrancias' ? undefined : s.key)}>
            {s.label}
          </Chip>
        ))}
      </div>

      {fragrances ? (
        <Segmented variant="tabs" value={tab} onChange={(t) => setParam('aba', t === 'colecao' ? undefined : t)} options={TABS} className="mb-4" />
      ) : null}

      {(tab === 'colecao' || !fragrances) && (
        <CollectionTab
          db={db}
          categories={shelf.categories}
          fragrances={fragrances}
          view={view}
          setView={setView}
          compareIds={compareIds}
          setCompareIds={setCompareIds}
          open={(id) => setSheet({ kind: 'detail', id })}
          add={(defaults) => setSheet({ kind: 'item', defaults: { category: shelf.categories[0], ...defaults } })}
        />
      )}
      {fragrances && tab === 'hoje' && <WearTab db={db} open={(id) => setSheet({ kind: 'detail', id })} />}
      {fragrances && tab === 'dna' && (
        <DnaTab db={db} openProfile={() => setSheet({ kind: 'profile' })} openLog={(id) => setSheet({ kind: 'log', id })} newLog={() => setSheet({ kind: 'log' })} />
      )}

      <AnimatePresence>
        {sheet && (
          <SheetFrame key={`${sheet.kind}:${'id' in sheet ? (sheet.id ?? 'new') : ''}`} onClose={close} label="Meu Universo">
            {sheet.kind === 'detail' && (
              <ItemDetailSheet
                id={sheet.id}
                onClose={close}
                onEdit={() => setSheet({ kind: 'item', id: sheet.id })}
                onLog={() => setSheet({ kind: 'log', itemId: sheet.id })}
                onCompare={() => openCompare(sheet.id)}
              />
            )}
            {sheet.kind === 'item' && <ItemFormSheet id={sheet.id} defaults={sheet.defaults} onClose={close} />}
            {sheet.kind === 'log' && <LogFormSheet id={sheet.id} itemId={sheet.itemId} today={today} onClose={close} />}
            {sheet.kind === 'profile' && <ProfileFormSheet onClose={close} />}
          </SheetFrame>
        )}
      </AnimatePresence>
    </Page>
  )
}

// ─── Coleção ────────────────────────────────────────────────────────────────

const VIEWS: { value: View; label: string }[] = [
  { value: 'tenho', label: 'Tenho' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'compras', label: 'Compras' },
  { value: 'comparar', label: 'Comparar' },
]

function CollectionTab(props: {
  db: DB
  categories: UniverseCategory[]
  fragrances: boolean
  view: View
  setView: (v: View) => void
  compareIds: [string?, string?]
  setCompareIds: (v: [string?, string?]) => void
  open: (id: string) => void
  add: (defaults?: Partial<UniverseItem>) => void
}) {
  const { db, categories, view, setView, open, add } = props
  return (
    <>
      <Segmented value={view} onChange={setView} options={VIEWS} className="mb-4" />
      {view === 'tenho' && <OwnedView db={db} categories={categories} open={open} add={add} />}
      {view === 'wishlist' && <WishView db={db} categories={categories} open={open} add={add} />}
      {view === 'compras' && <PurchasesView db={db} categories={categories} open={open} />}
      {view === 'comparar' && <CompareView db={db} categories={categories} ids={props.compareIds} setIds={props.setCompareIds} />}
    </>
  )
}

const CATEGORY_PLURAL: Partial<Record<UniverseCategory, string>> = {
  perfume: 'Perfumes',
  body_splash: 'Body splashes',
  hidratante: 'Hidratantes perfumados',
  oleo_corporal: 'Óleos corporais',
  fragrancia: 'Fragrâncias · tipo a confirmar',
  acessorio: 'Acessórios',
  roupa: 'Roupas',
  lugar: 'Lugares',
  cafe: 'Cafés',
  restaurante: 'Restaurantes',
  equipamento: 'Equipamentos',
  marca: 'Marcas',
}

function OwnedView({ db, categories, open, add }: { db: DB; categories: UniverseCategory[]; open: (id: string) => void; add: (d?: Partial<UniverseItem>) => void }) {
  const owned = useMemo(() => collection(db, categories), [db, categories])
  const past = useMemo(() => history(db, categories), [db, categories])
  const groups = useMemo(() => {
    const by = new Map<UniverseCategory, UniverseItem[]>()
    for (const i of owned) by.set(i.category, [...(by.get(i.category) ?? []), i])
    return categories.filter((c) => by.has(c)).map((c) => ({ category: c, items: by.get(c)! }))
  }, [owned, categories])

  if (!owned.length && !past.length)
    return (
      <EmptyState
        emoji="🌸"
        title="Nada por aqui ainda"
        text="Só entra o que é seu. Desejos ficam na wishlist."
        action={
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => add({ ownership: 'tenho' })}>
            adicionar
          </Button>
        }
      />
    )
  return (
    <>
      {groups.map((g, gi) => (
        <section key={g.category} aria-label={CATEGORY_LABEL[g.category]}>
          <SectionTitle className={gi === 0 ? 'mt-1' : undefined}>
            {(g.items.length > 1 ? CATEGORY_PLURAL[g.category] : undefined) ?? (g.category === 'fragrancia' ? CATEGORY_PLURAL.fragrancia : CATEGORY_LABEL[g.category])} · {g.items.length}
          </SectionTitle>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2.5">
            {g.items.map((i) => (
              <ItemCard key={i.id} item={i} onOpen={() => open(i.id)} />
            ))}
          </motion.div>
        </section>
      ))}
      {past.length > 0 && (
        <section aria-label="Já testei ou acabou">
          <SectionTitle>Já testei ou acabou · {past.length}</SectionTitle>
          <div className="card overflow-hidden divide-y divide-line/70">
            {past.map((i) => (
              <ItemRow key={i.id} item={i} onOpen={() => open(i.id)} sub={[OWNERSHIP_LABEL[i.ownership], i.opinion && OPINION_LABEL[i.opinion].toLowerCase()].filter(Boolean).join(' · ')} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function WishView({ db, categories, open, add }: { db: DB; categories: UniverseCategory[]; open: (id: string) => void; add: (d?: Partial<UniverseItem>) => void }) {
  const groups = useMemo(() => wishlist(db, categories), [db, categories])
  const move = (group: UniverseItem[], id: string, dir: -1 | 1) => {
    for (const p of moveInWishGroup(group, id, dir)) actions.update('universeItems', p.id, { wishPriority: p.wishPriority })
  }
  return (
    <>
      <p className="text-[13.5px] text-muted px-1 mb-1">Desejos de teste, não compras. Nada aqui conta como seu nem entra no “usar hoje”.</p>
      {groups.length === 0 && <EmptyState compact emoji="🫧" title="Wishlist vazia" text="Quando algo te chamar a atenção, guarda aqui." />}
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <SectionTitle>{g.label}</SectionTitle>
          <div className="card overflow-hidden divide-y divide-line/70">
            {g.items.map((i, k) => {
              const close = closestOwned(db, i)
              const sub = [i.families?.join(' · '), i.notes?.join(' · '), i.description].filter(Boolean).join(' — ')
              return (
                <ItemRow
                  key={i.id}
                  item={i}
                  onOpen={() => open(i.id)}
                  leading={<span className="font-display text-[18px] w-5 text-center text-muted tabular-nums">{k + 1}</span>}
                  sub={
                    <>
                      {sub}
                      {close && <span className="block text-ink-2 mt-0.5">parecido com o seu {close.item.name}: {close.shared.slice(0, 3).join(', ')}</span>}
                    </>
                  }
                  trailing={
                    <span className="flex flex-col -my-1">
                      <IconButton label="Subir" onClick={() => move(g.items, i.id, -1)}>
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton label="Descer" onClick={() => move(g.items, i.id, 1)}>
                        <ArrowDown size={15} />
                      </IconButton>
                    </span>
                  }
                />
              )
            })}
          </div>
        </section>
      ))}
      <div className="flex justify-center mt-5">
        <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => add({ ownership: 'quero_testar', wishGroup: 'Meus desejos' })}>
          novo desejo
        </Button>
      </div>
    </>
  )
}

const REMAINING_LABEL: Record<string, string> = { cheio: 'cheio', mais_da_metade: 'mais da metade', metade: 'metade', pouco: 'pouco', vazio: 'vazio' }
const REBUY_LABEL: Record<string, string> = { sim: 'recompraria', talvez: 'talvez recompre', nao: 'não recompraria' }

function PurchasesView({ db, categories, open }: { db: DB; categories: UniverseCategory[]; open: (id: string) => void }) {
  const list = useMemo(() => purchases(db, categories), [db, categories])
  const totals = useMemo(() => spentByCurrency(list), [list])
  return (
    <>
      {totals.length > 0 && (
        <div className="card p-4 mb-3">
          <div className="eyebrow">Registrado</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1">
            {totals.map((t) => (
              <span key={t.currency} className="font-display text-[22px]">
                {money(t.cents, t.currency)} <span className="text-[13px] text-muted font-sans">· {pluralize(t.count, 'item', 'itens')}</span>
              </span>
            ))}
          </div>
          <p className="text-[12px] text-muted mt-1.5">Cada moeda separada — sem conversão inventada.</p>
        </div>
      )}
      {list.length === 0 ? (
        <EmptyState compact emoji="🧾" title="Sem compras registradas" text="Preço, data, tamanho e quanto resta aparecem aqui quando você anotar." />
      ) : (
        <div className="card overflow-hidden divide-y divide-line/70">
          {list.map((i) => {
            const perMl = pricePerMl(i)
            const bits = [
              i.priceCents ? money(i.priceCents, i.currency) : undefined,
              i.sizeMl ? `${i.sizeMl} ml` : undefined,
              perMl ? `${money(perMl, i.currency)}/ml` : undefined,
              i.acquiredOn ? formatShortDate(i.acquiredOn) : undefined,
              i.city ?? i.country,
              i.remaining ? `resta: ${REMAINING_LABEL[i.remaining]}` : undefined,
              i.rebuy ? REBUY_LABEL[i.rebuy] : undefined,
            ].filter(Boolean)
            return <ItemRow key={i.id} item={i} onOpen={() => open(i.id)} sub={bits.join(' · ')} />
          })}
        </div>
      )}
    </>
  )
}

function CompareView({ db, categories, ids, setIds }: { db: DB; categories: UniverseCategory[]; ids: [string?, string?]; setIds: (v: [string?, string?]) => void }) {
  const set = new Set(categories)
  const pool = db.universeItems.filter((i) => set.has(i.category)).sort((a, b) => itemTitle(a).localeCompare(itemTitle(b)))
  const options = pool.map((i) => ({ value: i.id, label: `${itemTitle(i)} · ${OWNERSHIP_LABEL[i.ownership].toLowerCase()}` }))
  const a = pool.find((i) => i.id === ids[0])
  const b = pool.find((i) => i.id === ids[1])
  const c = a && b ? compare(a, b) : undefined
  const row = (label: string, render: (i: UniverseItem) => React.ReactNode) => (
    <div className="grid grid-cols-2 gap-3 py-2.5 border-b border-line/70 last:border-0">
      <div className="col-span-2 eyebrow">{label}</div>
      <div className="text-[13.5px]">{a && render(a)}</div>
      <div className="text-[13.5px]">{b && render(b)}</div>
    </div>
  )
  const dash = <span className="text-muted">—</span>
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <Select value={ids[0]} onChange={(v) => setIds([v, ids[1]])} options={options} placeholder="Primeira…" />
        <Select value={ids[1]} onChange={(v) => setIds([ids[0], v])} options={options} placeholder="Segunda…" />
      </div>
      {!a || !b ? (
        <EmptyState compact emoji="⚖️" title="Escolha duas" text="Notas, famílias, ocasiões e custo por ml, lado a lado." />
      ) : (
        <div className="card p-4">
          <div className="grid grid-cols-2 gap-3 mb-2">
            {[a, b].map((i) => (
              <div key={i.id} className="min-w-0">
                <Bottle item={i} size={44} />
                {i.brand && <div className="eyebrow mt-2 truncate">{i.brand}</div>}
                <div className="font-display text-[17px] leading-tight">{i.name}</div>
              </div>
            ))}
          </div>
          {row('Na minha vida', (i) => [OWNERSHIP_LABEL[i.ownership], i.opinion && OPINION_LABEL[i.opinion].toLowerCase()].filter(Boolean).join(' · '))}
          {row('Família / perfil', (i) => [i.families?.join(' · '), i.description].filter(Boolean).join(' — ') || dash)}
          {row('Notas', (i) => i.notes?.join(' · ') || dash)}
          {row('Ocasiões', (i) => i.occasionText || i.occasions?.map((o) => OCCASION_LABEL[o].toLowerCase()).join(', ') || dash)}
          {row('Preço', (i) => (i.priceCents ? `${money(i.priceCents, i.currency)}${i.sizeMl ? ` · ${i.sizeMl} ml` : ''}` : dash))}
          {row('Custo por ml', (i) => (pricePerMl(i) ? `${money(pricePerMl(i)!, i.currency)}/ml` : <span className="text-muted">sem preço e tamanho</span>))}
          <div className="mt-3 rounded-2xl bg-surface-2/70 px-4 py-3 text-[13.5px] space-y-1">
            <div className="eyebrow">Semelhança (o que têm em comum)</div>
            <div>Notas em comum: {c!.sharedNotes.length ? c!.sharedNotes.join(', ') : 'nenhuma registrada'}</div>
            <div>Famílias em comum: {c!.sharedFamilies.length ? c!.sharedFamilies.join(', ') : 'nenhuma registrada'}</div>
            <div>Ocasiões em comum: {c!.sharedOccasions.length ? c!.sharedOccasions.map((o) => OCCASION_LABEL[o].toLowerCase()).join(', ') : 'nenhuma'}</div>
            {c!.perMl[0] && c!.perMl[1] && !c!.comparablePrice && <div className="text-muted">Moedas diferentes: custo por ml não comparado.</div>}
            <div className="text-[12px] text-muted pt-1">Só compara o que está registrado. Intensidade e fixação variam com pele, clima e aplicação.</div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Usar hoje ──────────────────────────────────────────────────────────────

function WearTab({ db, open }: { db: DB; open: (id: string) => void }) {
  const [input, setInput] = useState<WearInput>(() => ({ time: new Date().getHours() >= 18 ? 'noite' : 'dia' }))
  const set = (patch: Partial<WearInput>) => setInput((x) => ({ ...x, ...patch }))
  const pick = useMemo(() => recommend(db, input), [db, input])
  const others = pick.ranked.slice(1, 4).map((r) => r.item).filter((i) => i.id !== pick.fresher?.id && i.id !== pick.sensual?.id)
  return (
    <>
      <div className="card p-4 space-y-3.5">
        <Pick label="Temperatura">
          <ChipSelect<TempBand> clearable value={input.temp} onChange={(v) => set({ temp: v })} options={[{ value: 'frio', label: 'Frio' }, { value: 'ameno', label: 'Ameno' }, { value: 'calor', label: 'Calor' }]} />
        </Pick>
        <Pick label="Horário">
          <ChipSelect<TimeOfDay> clearable value={input.time} onChange={(v) => set({ time: v })} options={[{ value: 'dia', label: 'Dia' }, { value: 'noite', label: 'Noite' }]} />
        </Pick>
        <Pick label="Ocasião">
          <ChipSelect<WearOccasion> clearable value={input.occasion} onChange={(v) => set({ occasion: v })} options={(Object.keys(WEAR_OCCASION_LABEL) as WearOccasion[]).map((v) => ({ value: v, label: WEAR_OCCASION_LABEL[v] }))} />
        </Pick>
        <Pick label="Ambiente">
          <ChipSelect<Setting> clearable value={input.setting} onChange={(v) => set({ setting: v })} options={[{ value: 'aberto', label: 'Aberto' }, { value: 'fechado', label: 'Fechado' }]} />
        </Pick>
        <Pick label="Intensidade">
          <ChipSelect<Intensity> clearable value={input.intensity} onChange={(v) => set({ intensity: v })} options={[{ value: 'suave', label: 'Suave' }, { value: 'media', label: 'Média' }, { value: 'marcante', label: 'Marcante' }]} />
        </Pick>
      </div>

      {!pick.main ? (
        <EmptyState compact emoji="🌸" title="Sem perfumes seus ainda" text="Só sugiro o que você tem. Desejos ficam na wishlist." />
      ) : (
        <motion.div key={pick.main.item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 mt-3">
          <div className="eyebrow">Hoje</div>
          <button type="button" onClick={() => open(pick.main!.item.id)} className="flex items-center gap-4 mt-2 text-left w-full">
            <Bottle item={pick.main.item} size={64} />
            <span className="min-w-0">
              {pick.main.item.brand && <span className="block text-[13px] text-muted">{pick.main.item.brand}</span>}
              <span className="block font-display text-[26px] leading-[1.05] tracking-tight">{pick.main.item.name}</span>
            </span>
          </button>
          <p className="text-[14.5px] text-ink-2 mt-3 leading-relaxed">
            {pick.main.reasons.length ? `Por quê: ${pick.main.reasons.join('; ')}.` : 'Da sua coleção, é o que mais se encaixa no que você escolheu.'}
          </p>
          {pick.application && <p className="text-[13.5px] text-muted mt-2">{pick.application}</p>}
          <div className="mt-4 space-y-2">
            {pick.fresher && <Alt label="Mais fresco" item={pick.fresher} open={open} />}
            {pick.sensual && <Alt label="Mais sensual" item={pick.sensual} open={open} />}
            {pick.companion && <Alt label="Combina com" item={pick.companion.item} open={open} why={pick.companion.why} />}
          </div>
        </motion.div>
      )}
      {others.length > 0 && (
        <>
          <SectionTitle>Também combinam</SectionTitle>
          <div className="card overflow-hidden divide-y divide-line/70">
            {others.map((i) => (
              <ItemRow key={i.id} item={i} onOpen={() => open(i.id)} sub={i.occasionText} />
            ))}
          </div>
        </>
      )}
      <p className="text-[12px] text-muted px-1 mt-4">Só perfumes que são seus, pelos usos e avaliações que você registrou. Sem previsão do tempo: você escolhe a temperatura.</p>
    </>
  )
}

function Pick({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function Alt({ label, item, open, why }: { label: string; item: UniverseItem; open: (id: string) => void; why?: string }) {
  return (
    <button type="button" onClick={() => open(item.id)} className="w-full flex items-center gap-3 rounded-2xl bg-surface-2/60 px-3.5 py-2.5 text-left active:bg-surface-2">
      <span className="eyebrow w-[86px] shrink-0">{label}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] truncate">{itemTitle(item)}</span>
        {(why || item.occasionText) && <span className="block text-[12.5px] text-muted truncate">{why ?? item.occasionText}</span>}
      </span>
    </button>
  )
}

// ─── DNA & diário ───────────────────────────────────────────────────────────

function DnaTab({ db, openProfile, openLog, newLog }: { db: DB; openProfile: () => void; openLog: (id: string) => void; newLog: () => void }) {
  const p = db.profile.scentProfile
  const dna = useMemo(() => scentDNA(db), [db])
  const logs = useMemo(() => [...db.scentLogs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [db.scentLogs])
  const items = useMemo(() => new Map(db.universeItems.map((i) => [i.id, i])), [db.universeItems])
  const famMax = Math.max(1, ...dna.families.map((f) => f.owned + f.loved))
  const noteMax = Math.max(1, ...dna.notes.map((f) => f.owned + f.loved))
  const ownedFragrances = collection(db, FRAGRANCE_CATEGORIES).length
  return (
    <>
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Meu perfil olfativo</div>
            {p?.summary && <p className="font-display italic text-[17px] leading-snug mt-1.5">{p.summary}</p>}
          </div>
          <IconButton label="Editar perfil" onClick={openProfile}>
            <Pencil size={17} />
          </IconButton>
        </div>
        {!p && <p className="text-[14px] text-muted mt-1">Ainda sem perfil. Toque no lápis para escrever o seu.</p>}
        {p && (
          <div className="space-y-3 mt-3">
            <Tags label="Prefiro" tags={p.familiesLiked} tone="bg-plum-soft text-plum" />
            <Tags label="Notas de interesse" tags={p.notesOfInterest} tone="bg-sage-soft text-sage" />
            <Tags label="Menos prioritários" tags={p.familiesLess} tone="bg-surface-2 text-ink-2" />
            {p.remarks && <p className="text-[13px] text-muted">{p.remarks}</p>}
            {p.makeupStyle && (
              <div>
                <div className="eyebrow mb-1">Maquiagem</div>
                <p className="text-[14px]">{p.makeupStyle}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <SectionTitle>O que seus dados mostram</SectionTitle>
      <div className="card p-4">
        <p className="text-[13px] text-muted">
          Contagem real: {pluralize(ownedFragrances, 'fragrância sua', 'fragrâncias suas')} e {pluralize(dna.lovedCount, 'que você marcou amei/gostei', 'que você marcou amei/gostei')}. Atualiza conforme você avalia.
        </p>
        <div className="flex gap-4 text-[12px] text-muted mt-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sage" /> na coleção
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-plum" /> amei/gostei
          </span>
        </div>
        <div className="eyebrow mt-4">Famílias</div>
        {dna.families.length === 0 ? <p className="text-[13.5px] text-muted mt-1">Sem famílias registradas ainda.</p> : dna.families.slice(0, 8).map((f) => <CountBar key={f.label} {...f} max={famMax} />)}
        <div className="eyebrow mt-4">Notas</div>
        {dna.notes.length === 0 ? <p className="text-[13.5px] text-muted mt-1">Sem notas registradas ainda.</p> : dna.notes.slice(0, 10).map((f) => <CountBar key={f.label} {...f} max={noteMax} />)}
      </div>

      <SectionTitle
        action={
          <Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={newLog}>
            registrar
          </Button>
        }
      >
        Diário olfativo
      </SectionTitle>
      {logs.length === 0 ? (
        <EmptyState compact emoji="📓" title="Diário vazio" text="Testou algo? Primeira impressão, como evoluiu e se compraria." />
      ) : (
        <div className="space-y-2.5">
          {logs.map((l) => {
            const it = items.get(l.itemId)
            return (
              <button key={l.id} type="button" onClick={() => openLog(l.id)} className="card w-full p-4 text-left active:scale-[0.99] transition">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="eyebrow">{[formatShortDate(l.date), l.city, l.country].filter(Boolean).join(' · ')}</span>
                  {typeof l.score === 'number' && <span className="text-[13px] text-muted tabular-nums">nota {l.score}</span>}
                </div>
                <div className="font-display text-[19px] leading-tight mt-1">{it ? itemTitle(it) : 'Fragrância apagada'}</div>
                {l.firstImpression && <p className="text-[14px] text-ink-2 mt-1">“{l.firstImpression}”</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {l.verdict && <span className="text-[12px] px-2.5 h-6 inline-flex items-center rounded-full bg-plum-soft text-plum">{OPINION_LABEL[l.verdict].toLowerCase()}</span>}
                  {l.status && <span className="text-[12px] px-2.5 h-6 inline-flex items-center rounded-full bg-surface-2 text-ink-2">{DIARY_STATUS_LABEL[l.status].toLowerCase()}</span>}
                  {l.priceCents ? <span className="text-[12px] px-2.5 h-6 inline-flex items-center rounded-full bg-surface-2 text-ink-2">{money(l.priceCents, l.currency)}</span> : null}
                  {!l.confirmed && <span className="text-[12px] px-2.5 h-6 inline-flex items-center rounded-full bg-sand-soft text-sand">a confirmar</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function Tags({ label, tags, tone }: { label: string; tags: string[]; tone: string }) {
  if (!tags.length) return null
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className={`text-[12.5px] px-2.5 h-7 inline-flex items-center rounded-full ${tone}`}>
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}
