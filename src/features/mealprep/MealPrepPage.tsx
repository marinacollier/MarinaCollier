import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDB } from '@/data/store'
import type { DateKey } from '@/data/types'
import { weekReport, type MenuItem } from '@/data/mealprep'
import { toast } from '@/app/ui-store'
import { Card, Chip, IconButton, Page, PageHeader, Segmented, SheetFrame } from '@/components/ui'
import { useToday } from '@/hooks/useToday'
import { addDays, formatDayMonth, startOfWeek, weekday } from '@/lib/date'
import { Fade } from './components'
import { useMealPrepPlan, withChoice } from './mutations'
import { CookSection, GrabSection, KitSection, MenuSection, PotsSection, ShoppingSection, StorageSection, StrategySection, type SectionProps } from './sections'
import { RecipeSheet, SwapSheet } from './sheets'

type Tab = 'estrategia' | 'cardapio' | 'lista' | 'cozinhar' | 'potes' | 'portateis' | 'geladeira' | 'kit'

/** Section-15 order (the sub-chips inside each of the three tabs). */
const TABS: { value: Tab; label: string }[] = [
  { value: 'estrategia', label: 'Estratégia' },
  { value: 'cardapio', label: 'Cardápio' },
  { value: 'lista', label: 'Lista' },
  { value: 'cozinhar', label: 'Meal prep' },
  { value: 'potes', label: 'Potes' },
  { value: 'portateis', label: 'Portáteis' },
  { value: 'geladeira', label: 'Geladeira x freezer' },
  { value: 'kit', label: 'Kit presencial' },
]

/** Three tabs; each holds one or more sections, picked with chips. */
type Group = 'cardapio' | 'compras' | 'preparo'
const GROUPS: { value: Group; label: string; sections: Tab[] }[] = [
  { value: 'cardapio', label: 'Cardápio', sections: ['estrategia', 'cardapio'] },
  { value: 'compras', label: 'Compras', sections: ['lista'] },
  { value: 'preparo', label: 'Preparo', sections: ['cozinhar', 'potes', 'portateis', 'geladeira', 'kit'] },
]
const groupOf = (t: Tab): Group => GROUPS.find((g) => g.sections.includes(t))!.value

const SECTIONS: Record<Tab, (p: SectionProps) => React.ReactNode> = {
  estrategia: StrategySection,
  cardapio: MenuSection,
  lista: ShoppingSection,
  cozinhar: CookSection,
  potes: PotsSection,
  portateis: GrabSection,
  geladeira: StorageSection,
  kit: KitSection,
}

const TAB_KEY = 'mealprep:tab'

function readTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY) as Tab | null
    return v && TABS.some((t) => t.value === v) ? v : 'estrategia'
  } catch {
    return 'estrategia'
  }
}

/** Weekend → the coming week (that's the one she preps on Sunday); weekdays → this week. */
export function defaultWeek(today: DateKey): DateKey {
  const wd = weekday(today)
  return wd === 6 || wd === 0 ? addDays(startOfWeek(today), 7) : startOfWeek(today)
}

type OpenSheet = { kind: 'recipe'; date: DateKey; mealIndex: number } | { kind: 'swap'; item: MenuItem }

export default function MealPrepPage() {
  const db = useDB()
  const today = useToday()
  const [weekStart, setWeekStart] = useState<DateKey>(() => defaultWeek(today))
  const [tab, setTabState] = useState<Tab>(readTab)
  const [sheet, setSheet] = useState<OpenSheet | null>(null)
  const { plan, patch } = useMealPrepPlan(weekStart)
  const report = useMemo(() => weekReport(db, weekStart, plan), [db, weekStart, plan])

  const setTab = (t: Tab) => {
    setTabState(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      /* per-viewer convenience only */
    }
  }

  const Section = SECTIONS[tab]
  const group = GROUPS.find((g) => g.value === groupOf(tab))!
  const end = addDays(weekStart, 6)
  const isDefault = weekStart === defaultWeek(today)
  const props: SectionProps = {
    report,
    plan,
    patch,
    today,
    openRecipe: (date, mealIndex) => setSheet({ kind: 'recipe', date, mealIndex }),
    openSwap: (item) => setSheet({ kind: 'swap', item }),
  }

  return (
    <Page>
      <PageHeader eyebrow="corpo · alimentação" title="Meal prep da semana" subtitle="o plano do nutri, pronto" back search={false} />

      <div className="flex items-center justify-between -mx-1.5 -mt-1 mb-3">
        <IconButton label="Semana anterior" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft size={20} />
        </IconButton>
        <button type="button" onClick={() => setWeekStart(defaultWeek(today))} className="text-center min-h-11 px-2">
          <div className="text-[15px] font-semibold tabular-nums">
            {formatDayMonth(weekStart)} – {formatDayMonth(end)}
          </div>
          <div className="text-[12px] text-muted">{isDefault ? 'semana do próximo preparo' : 'toque pra voltar à semana atual'}</div>
        </button>
        <IconButton label="Próxima semana" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <Card className="bg-accent-soft !shadow-none">
        <div className="eyebrow text-accent">Lumos</div>
        <p className="font-display text-[19px] leading-snug mt-1">{report.headline}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[13px] text-ink-2">
          <span>🛒 {report.shopping.count} itens</span>
          <span>🍱 {report.pots.length} potes</span>
          <span>📍 {report.kits.length} {report.kits.length === 1 ? 'dia presencial' : 'dias presenciais'}</span>
        </div>
      </Card>

      <div className="sticky top-0 z-10 -mx-4 px-4 bg-bg/95 backdrop-blur mt-4 mb-4">
        <Segmented<Group> variant="tabs" value={group.value} onChange={(g) => setTab(GROUPS.find((x) => x.value === g)!.sections[0])} options={GROUPS} />
      </div>
      {group.sections.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 -mt-1 mb-4" aria-label="Seções">
          {TABS.filter((t) => group.sections.includes(t.value)).map((t) => (
            <Chip key={t.value} selected={tab === t.value} onClick={() => setTab(t.value)} className="whitespace-nowrap">
              {t.label}
            </Chip>
          ))}
        </div>
      )}

      <Fade k={`${tab}-${weekStart}`}>
        <Section {...props} />
      </Fade>

      <AnimatePresence>
        {sheet && (
          <SheetFrame key="mealprep-sheet" onClose={() => setSheet(null)}>
            {sheet.kind === 'recipe' ? (
              <RecipeSheet date={sheet.date} mealIndex={sheet.mealIndex} plan={plan} onClose={() => setSheet(null)} />
            ) : (
              <SwapSheet
                item={sheet.item}
                current={plan?.choices[sheet.item.key]}
                onClose={() => setSheet(null)}
                onPick={(value) => {
                  patch((p) => ({ choices: withChoice(p.choices, sheet.item.key, value) }))
                  setSheet(null)
                  toast(value ? 'Troca do nutri aplicada — lista e potes já atualizaram' : 'De volta ao plano original')
                }}
              />
            )}
          </SheetFrame>
        )}
      </AnimatePresence>
    </Page>
  )
}
