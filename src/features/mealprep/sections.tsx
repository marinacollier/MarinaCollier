import { useState } from 'react'
import { ChefHat, Home, RotateCcw, Sparkles } from 'lucide-react'
import type { DateKey, MealPrepPlan } from '@/data/types'
import { applyProposals, KIT_ICON, type KitIcon, type MenuItem, type MenuMeal, type Pot, type PotState, type WeekReport } from '@/data/mealprep'
import { DAY_TYPE_LABEL } from '@/data/fuel'
import { toast } from '@/app/ui-store'
import { Button, Card, EmptyState, ListCard, SectionTitle } from '@/components/ui'
import { formatDayMonth, weekday, WEEKDAY_LONG } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import { amountText, CheckRow, householdText, KitIcons, PlacePill, SourceBadge } from './components'
import { toggleIn, withPotState } from './mutations'

export interface SectionProps {
  report: WeekReport
  plan?: MealPrepPlan
  patch: (fn: (p: MealPrepPlan) => Partial<MealPrepPlan>) => void
  today: DateKey
  openRecipe: (date: DateKey, mealIndex: number) => void
  openSwap: (item: MenuItem) => void
}

const longDay = (d: DateKey) => WEEKDAY_LONG[weekday(d)]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function useCheck({ plan, patch }: Pick<SectionProps, 'plan' | 'patch'>) {
  const checked = new Set(plan?.checked ?? [])
  const toggle = (key: string) => {
    if (!checked.has(key)) haptic('success')
    patch((p) => ({ checked: toggleIn(p.checked, key) }))
  }
  return { checked, toggle }
}

// ─── 1 · Estratégia ─────────────────────────────────────────────────────────

export function StrategySection({ report, plan, patch }: SectionProps) {
  const swaps = Object.keys(plan?.choices ?? {}).length
  const sug = report.suggestions
  return (
    <>
      <Card>
        <ul className="space-y-2.5">
          {report.strategy.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>

      <SectionTitle>diversificar sem complicar</SectionTitle>
      <Card>
        {sug.length ? (
          <>
            <p className="text-[14px] text-muted mb-3">Dá pra variar sem transformar sua cozinha num restaurante 😂 — só trocas que o seu nutri já deixou, aproveitando o que você já vai comprar.</p>
            <ul className="space-y-3">
              {sug.map((s) => (
                <li key={s.key} className="rounded-2xl bg-surface-2 px-3.5 py-3">
                  <div className="text-[12px] font-semibold tracking-[0.06em] text-muted">{s.where}</div>
                  <div className="text-[15px] leading-snug mt-0.5">
                    <span className="text-muted line-through decoration-muted/50">{s.from}</span> → {s.to.split(' - ')[0]}
                  </div>
                  <div className="text-[13px] text-ink-2 mt-1">{s.reason}</div>
                </li>
              ))}
            </ul>
            <Button
              variant="accent"
              className="mt-4"
              block
              icon={<Sparkles size={16} />}
              onClick={() => {
                patch((p) => ({ choices: applyProposals(p.choices, sug) }))
                haptic('success')
                toast(`${sug.length} ${sug.length === 1 ? 'troca aplicada' : 'trocas aplicadas'} — tudo do seu plano ✨`, { tone: 'win' })
              }}
            >
              Aplicar {sug.length === 1 ? 'essa troca' : `essas ${sug.length} trocas`}
            </Button>
          </>
        ) : (
          <p className="text-[14px] text-muted">{swaps ? 'Semana já variada do jeito certo — nada mais pra trocar.' : 'Essa semana já tem variedade suficiente. Base comum, menos compras.'}</p>
        )}
        {swaps > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            icon={<RotateCcw size={14} />}
            onClick={() => {
              const before = plan?.choices ?? {}
              patch(() => ({ choices: {} }))
              toast('Voltei tudo pro plano original', { action: { label: 'Desfazer', run: () => patch(() => ({ choices: before })) } })
            }}
          >
            Voltar tudo ao plano original ({swaps})
          </Button>
        )}
      </Card>
    </>
  )
}

// ─── 2 · Cardápio ───────────────────────────────────────────────────────────

export function MenuSection({ report, today, openRecipe, openSwap }: SectionProps) {
  const days = report.menu.days
  const [sel, setSel] = useState<DateKey>(() => (days.some((d) => d.date === today) ? today : days[0].date))
  const day = days.find((d) => d.date === sel) ?? days[0]
  return (
    <>
      <div className="grid grid-cols-7 gap-1 mb-4">
        {days.map((d) => {
          const active = d.date === day.date
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSel(d.date)}
              className={cn('h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors', active ? 'bg-ink text-bg' : 'bg-surface text-ink-2 active:bg-surface-2')}
            >
              <span className="text-[11px] font-semibold tracking-[0.08em]">{d.short}</span>
              <span className="text-[13px] tabular-nums">{d.date.slice(8)}</span>
              <span className={cn('h-1 w-1 rounded-full', d.presencial ? (active ? 'bg-bg' : 'bg-accent') : 'bg-transparent')} />
            </button>
          )
        })}
      </div>
      <Card>
        <div className="eyebrow">{formatDayMonth(day.date)}{day.presencial ? ' · presencial 📍' : ''}</div>
        <div className="font-display text-[22px] leading-tight mt-0.5">{cap(day.long)}</div>
        <div className="text-[13px] text-muted mt-0.5">
          {day.planName ? `Plano ${day.planName.toLowerCase()} · ${DAY_TYPE_LABEL[day.dayType].toLowerCase()}` : 'Sem plano cadastrado pra esse tipo de dia'}
          {day.trainings.length > 0 && ` · ${day.trainings.map((t) => `${t.time ?? ''} ${t.title}`.trim()).join(', ')}`}
        </div>
        {day.out && (
          <div className="mt-3 rounded-2xl bg-accent-soft px-3.5 py-2.5 text-[13.5px] text-ink-2">
            Fora de casa das {day.out.leave} às {day.out.back} ({day.out.reason}).
          </div>
        )}
      </Card>
      {day.meals.length === 0 ? (
        <EmptyState emoji="🍽️" title="Nada cadastrado pra esse dia" text="Quando o plano do nutri desse tipo de dia estiver no app, ele aparece aqui sozinho." />
      ) : (
        <div className="space-y-3 mt-3">
          {day.meals.map((m) => (
            <MealCard key={m.potKey} meal={m} onRecipe={() => openRecipe(m.date, m.index)} onSwap={openSwap} />
          ))}
        </div>
      )}
    </>
  )
}

function MealCard({ meal, onRecipe, onSwap }: { meal: MenuMeal; onRecipe: () => void; onSwap: (i: MenuItem) => void }) {
  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
        <span className="font-display text-[20px] tabular-nums w-[52px] shrink-0">{meal.time ?? '—'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold leading-snug">{meal.name}</div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <PlacePill place={meal.place} />
            {meal.moved && <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-surface-2 text-ink-2">horário só hoje</span>}
          </div>
        </div>
        <Button variant="soft" size="sm" icon={<ChefHat size={15} />} onClick={onRecipe}>
          Receita
        </Button>
      </div>
      <ul className="divide-y divide-line/70">
        {meal.items.map((it) => {
          const swappable = it.substitutions.length > 0
          const Comp = swappable ? 'button' : 'div'
          const house = householdText(it)
          return (
            <li key={it.key}>
              <Comp
                type={swappable ? 'button' : undefined}
                onClick={swappable ? () => onSwap(it) : undefined}
                className={cn('w-full flex items-start gap-3 px-4 py-2.5 min-h-[48px] text-left', swappable && 'active:bg-surface-2')}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] leading-snug">{it.food}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <SourceBadge badge={it.badge} />
                    {house && <span className="text-[12px] text-muted">{house}</span>}
                    {swappable && <span className="text-[12px] text-accent">{it.badge === 'troca' ? 'mudar' : `${it.substitutions.length} trocas`}</span>}
                  </div>
                </div>
                <span className="text-[14.5px] font-semibold tabular-nums shrink-0 pt-px">{amountText(it)}</span>
              </Comp>
            </li>
          )
        })}
      </ul>
      {meal.notes && <p className="px-4 py-2.5 text-[12.5px] text-muted whitespace-pre-line border-t border-line/70">Obs. do nutri: {meal.notes}</p>}
    </Card>
  )
}

// ─── 3 · Lista ──────────────────────────────────────────────────────────────

export function ShoppingSection(props: SectionProps) {
  const { report, patch } = props
  const { checked, toggle } = useCheck(props)
  const list = report.shopping
  const total = list.count
  const done = list.groups.reduce((s, g) => s + g.lines.filter((l) => checked.has(l.key)).length, 0)
  const setPantry = (name: string, has: boolean) => patch((p) => ({ pantry: has ? [...new Set([...p.pantry, name])] : p.pantry.filter((x) => x !== name) }))
  return (
    <>
      <p className="text-[14px] text-muted px-1 mb-1">
        Quantidade de compra de verdade (cru, em pacote) — não "100 g de arroz". {done > 0 ? `${done} de ${total} no carrinho.` : `${total} itens.`}
      </p>
      {list.groups.map((g) => (
        <div key={g.category}>
          <SectionTitle>
            {g.emoji} {g.label}
          </SectionTitle>
          <ListCard>
            {g.lines.map((l) => (
              <CheckRow
                key={l.key}
                label={l.label}
                checked={checked.has(l.key)}
                onToggle={() => toggle(l.key)}
                title={
                  <>
                    {l.label}
                    <span className="block font-semibold text-ink">{l.buy}</span>
                  </>
                }
                subtitle={l.detail}
                trailing={
                  <button type="button" onClick={() => setPantry(l.pantryName, true)} className="h-11 -my-2 px-2 text-[12px] text-muted active:text-ink">
                    já tenho
                  </button>
                }
              />
            ))}
          </ListCard>
        </div>
      ))}
      {list.atHome.length > 0 && (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Home size={13} /> já tem em casa
            </span>
          </SectionTitle>
          <ListCard>
            {list.atHome.map((l) => (
              <div key={l.key} className="flex items-center gap-3 px-4 min-h-[48px]">
                <span className="flex-1 text-[14.5px] text-muted">{l.label}</span>
                <button type="button" onClick={() => setPantry(l.pantryName, false)} className="h-11 px-2 text-[12.5px] text-accent">
                  voltar pra lista
                </button>
              </div>
            ))}
          </ListCard>
        </>
      )}
      <p className="text-[12.5px] text-muted px-1 mt-4">Carnes, grãos e legumes vêm convertidos de pronto → cru (perdas e ganho no preparo). Por isso é "aproximadamente".</p>
    </>
  )
}

// ─── 4 · Meal prep (cozinhar) ───────────────────────────────────────────────

export function CookSection(props: SectionProps) {
  const { report } = props
  const { checked, toggle } = useCheck(props)
  const b = report.batch
  const h = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`)
  return (
    <>
      <Card>
        <div className="eyebrow">cozinhar uma vez</div>
        <div className="font-display text-[22px] leading-tight mt-0.5">
          {cap(longDay(b.prepDate))}, {formatDayMonth(b.prepDate)}
        </div>
        <div className="text-[14px] text-muted mt-1">
          ~{h(b.totalMinutes[0])}–{h(b.totalMinutes[1])} · {b.potCount} potes ({b.fridgeCount} geladeira · {b.freezerCount} freezer)
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {b.bases.map((x) => (
            <span key={x.key} className="inline-flex items-center h-7 px-2.5 rounded-full text-[12.5px] bg-surface-2 text-ink-2">
              {x.label} · {x.ready >= 1000 ? `${String(Math.round(x.ready / 100) / 10).replace('.', ',')} kg` : `${x.ready} g`}
            </span>
          ))}
        </div>
      </Card>
      <SectionTitle>passo a passo</SectionTitle>
      <ListCard>
        {b.steps.map((s) => (
          <CheckRow
            key={s.key}
            label={s.title}
            checked={checked.has(s.key)}
            onToggle={() => toggle(s.key)}
            title={s.title}
            subtitle={
              <>
                {s.dayBefore ? 'na véspera · ' : s.passive ? 'cozinha sozinho · ' : ''}~{s.minutes} min — {s.detail}
              </>
            }
          />
        ))}
      </ListCard>
      {b.second && (
        <>
          <SectionTitle>rodada rápida</SectionTitle>
          <ListCard>
            <CheckRow
              label="Rodada rápida"
              checked={checked.has(b.second.key)}
              onToggle={() => toggle(b.second!.key)}
              title={`${cap(b.second.label)} · ~${b.second.minutes} min`}
              subtitle={`${b.second.bases.map((x) => `${x.label} ${x.text}`).join(' · ')} — não congela bem, então vai fresquinho pros últimos dias.`}
            />
          </ListCard>
        </>
      )}
      {b.eggsNote && <p className="text-[13px] text-muted px-1 mt-3">🥚 {b.eggsNote}</p>}
    </>
  )
}

// ─── 5 · Potes ──────────────────────────────────────────────────────────────

const POT_OPTS: { value: PotState; label: string }[] = [
  { value: 'geladeira', label: '❄️ geladeira' },
  { value: 'freezer', label: '🧊 freezer' },
  { value: 'consumido', label: '✓ comi' },
]

export function PotsSection({ report, patch }: SectionProps) {
  const byDay = new Map<DateKey, Pot[]>()
  for (const p of report.pots) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p])
  if (!report.pots.length) return <EmptyState emoji="🍱" title="Sem marmitas essa semana" text="Quando o plano tiver almoço e jantar com preparo, os potes aparecem aqui." />
  const setState = (p: Pot, s: PotState) => {
    if (s === 'consumido') haptic('success')
    patch((x) => ({ pots: withPotState(x.pots, p.key, s, p.defaultState) }))
  }
  return (
    <>
      <p className="text-[14px] text-muted px-1">Exatamente o que vai em cada pote. Toque pra marcar onde ele está.</p>
      {[...byDay.entries()].map(([date, list]) => (
        <div key={date}>
          <SectionTitle>
            {longDay(date)} · {formatDayMonth(date)}
          </SectionTitle>
          <div className="space-y-2.5">
            {list.map((p) => (
              <Card key={p.key} className={cn(p.state === 'consumido' && 'opacity-60')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[18px]">
                    {p.label} <span className="text-[14px] text-muted font-sans">· {p.mealName}</span>
                  </span>
                  {p.badgeTroca && <SourceBadge badge="troca" />}
                </div>
                <div className="text-[15px] leading-snug mt-1">{p.parts.map((x) => `${x.short} ${x.amount != null ? `${String(x.amount).replace('.', ',')}${x.unit ?? 'g'}` : ''}`).join(' · ')}</div>
                {p.extras.length > 0 && <div className="text-[13px] text-muted mt-1">na hora: {p.extras.join(' · ')}</div>}
                {p.noFreeze.length > 0 && <div className="text-[13px] text-sand mt-1">{p.noFreeze.join(', ')}: vem da rodada rápida (não congela bem)</div>}
                <div className="flex gap-1.5 mt-3">
                  {POT_OPTS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setState(p, o.value)}
                      className={cn('flex-1 h-9 rounded-full text-[12.5px] border transition-colors', p.state === o.value ? 'bg-ink text-bg border-ink' : 'border-line text-ink-2 active:bg-surface-2')}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

// ─── 6 · Cafés e lanches portáteis ──────────────────────────────────────────

const WHEN_LABEL = { domingo: 'no meal prep', vespera: 'na véspera', na_hora: 'na hora' } as const

export function GrabSection({ report }: SectionProps) {
  return (
    <>
      <p className="text-[14px] text-muted px-1">Pré, pós, café e lanche no esquema peguei e saí. Dias com o mesmo formato aparecem juntos.</p>
      <div className="space-y-3 mt-3">
        {report.grab.map((g) => (
          <Card key={`${g.title}-${g.days[0].date}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold leading-snug">{g.title}</div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {g.days.map((d) => (
                    <span key={d.date} className={cn('inline-flex items-center h-6 px-2 rounded-full text-[11.5px] font-semibold tracking-[0.06em]', d.place === 'fora' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2')}>
                      {d.label}
                      {d.place === 'fora' ? ' 📍' : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <ul className="mt-3 space-y-2.5">
              {g.items.map((i) => (
                <li key={i.title + i.detail} className="text-[14.5px] leading-snug">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{i.title}</span>
                    <KitIcons icons={i.icons} />
                  </div>
                  <div className="text-[13px] text-ink-2">{i.detail}</div>
                  {i.prep && (
                    <div className="text-[12.5px] text-muted mt-0.5">
                      {WHEN_LABEL[i.when]} · {i.prep}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <IconLegend icons={['geladeira', 'microondas', 'bolsa', 'termica']} />
    </>
  )
}

export function IconLegend({ icons }: { icons: KitIcon[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 mt-4 text-[12.5px] text-muted">
      {icons.map((i) => (
        <span key={i}>
          {KIT_ICON[i].emoji} {KIT_ICON[i].label}
        </span>
      ))}
    </div>
  )
}

// ─── 7 · Geladeira x freezer ────────────────────────────────────────────────

export function StorageSection(props: SectionProps) {
  const { report } = props
  const { checked, toggle } = useCheck(props)
  const s = report.storage
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="!p-3.5">
          <div className="eyebrow">❄️ geladeira</div>
          <div className="text-[12.5px] text-muted mb-2">próximos {s.fridgeDays} dias</div>
          <PotList pots={s.fridge} />
        </Card>
        <Card className="!p-3.5">
          <div className="eyebrow">🧊 freezer</div>
          <div className="text-[12.5px] text-muted mb-2">resto da semana</div>
          <PotList pots={s.freezer} />
        </Card>
      </div>
      {s.transfers.length > 0 && (
        <>
          <SectionTitle>na noite anterior</SectionTitle>
          <ListCard>
            {s.transfers.map((t) => (
              <CheckRow
                key={t.key}
                label={t.title}
                checked={checked.has(t.key)}
                onToggle={() => toggle(t.key)}
                title={
                  <>
                    <span className="tabular-nums font-semibold mr-1.5">{t.time}</span>
                    {longDay(t.date)}: {t.title.replace('Transferir do freezer pra geladeira: ', 'freezer → geladeira: ')}
                  </>
                }
              />
            ))}
          </ListCard>
        </>
      )}
      <SectionTitle>como guardar</SectionTitle>
      <ListCard>
        {s.tips.map((t) => (
          <div key={t.title} className="px-4 py-3">
            <div className="text-[14.5px] font-semibold">{t.title}</div>
            <div className="text-[13.5px] text-ink-2 leading-snug mt-0.5">{t.text}</div>
          </div>
        ))}
      </ListCard>
    </>
  )
}

function PotList({ pots }: { pots: Pot[] }) {
  if (!pots.length) return <div className="text-[13px] text-muted">nada por aqui</div>
  return (
    <ul className="space-y-1">
      {pots.map((p) => (
        <li key={p.key} className="text-[13.5px] tabular-nums">
          {p.label}
        </li>
      ))}
    </ul>
  )
}

// ─── 8 · Kit presencial ─────────────────────────────────────────────────────

export function KitSection(props: SectionProps) {
  const { report } = props
  const { checked, toggle } = useCheck(props)
  if (!report.kits.length)
    return <EmptyState emoji="🏡" title="Semana sem dia presencial" text="Quando tiver dia no escritório, o kit pegou-e-saiu aparece aqui com horários." />
  return (
    <div className="space-y-5">
      {report.kits.map((k) => (
        <div key={k.date}>
          <Card>
            <div className="eyebrow">
              {formatDayMonth(k.date)} · sai {k.out.leave} · volta ~{k.out.back}
            </div>
            <div className="font-display text-[22px] leading-tight mt-0.5">{k.title}</div>
            <p className="text-[14px] text-ink-2 mt-1.5">{k.intro}</p>
            <ol className="mt-3 space-y-3">
              {k.meals.map((m, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-display text-[17px] tabular-nums w-[50px] shrink-0">{m.time}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-semibold leading-snug">{m.name}</div>
                    {m.take.length ? (
                      <ul className="mt-0.5 space-y-1">
                        {m.take.map((t, j) => (
                          <li key={j} className="text-[13.5px] text-ink-2 leading-snug">
                            {t.text} <KitIcons icons={t.icons} className="ml-1 align-middle" />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[13.5px] text-muted">{m.note}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          <SectionTitle>checklist</SectionTitle>
          <ListCard>
            {k.checklist.map((c) => (
              <CheckRow
                key={c.key}
                label={c.title}
                checked={checked.has(c.key)}
                onToggle={() => toggle(c.key)}
                title={
                  <>
                    <span className="tabular-nums font-semibold mr-1.5">{c.time}</span>
                    {c.title}
                  </>
                }
                subtitle={c.date !== k.date ? `${longDay(c.date)} à noite` : undefined}
              />
            ))}
          </ListCard>
        </div>
      ))}
      <IconLegend icons={['geladeira', 'microondas', 'bolsa', 'termica']} />
    </div>
  )
}

