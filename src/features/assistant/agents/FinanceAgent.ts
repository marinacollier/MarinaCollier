import type { DateKey, DB, Expense } from '@/data/types'
import { ROUTES } from '@/app/routes'
import { categoryOf, expensesBetween, paidExpenses, sumCents } from '@/data/selectors'
import { addDays, endOfMonth, endOfWeek, MONTHS, startOfMonth, startOfWeek } from '@/lib/date'
import { formatBRL } from '@/lib/money'
import { routeAction, sheetAction } from '@/features/search/actions'
import { tokenize, topCategories } from '@/features/search/engine'
import { has } from '../parse'
import type { Agent, AgentContext, AnswerBlock, ParsedQuestion } from '../types'
import { capitalize, dayLabel, plural } from './common'

interface Period {
  from: DateKey
  to: DateKey
  label: string
}

export function periodFor(q: ParsedQuestion, today: DateKey): Period {
  if (q.month != null) {
    const [y, m] = today.split('-').map(Number)
    const year = q.month + 1 <= m ? y : y - 1
    const from = `${year}-${String(q.month + 1).padStart(2, '0')}-01`
    return { from, to: endOfMonth(from), label: `em ${MONTHS[q.month]}` }
  }
  if (q.time === 'hoje') return { from: today, to: today, label: 'hoje' }
  if (has(q, 'ontem')) {
    const y = addDays(today, -1)
    return { from: y, to: y, label: 'ontem' }
  }
  if (q.time === 'semana') return { from: startOfWeek(today), to: endOfWeek(today), label: 'essa semana' }
  return { from: startOfMonth(today), to: endOfMonth(today), label: 'este mês' }
}

function filterByTopic(db: DB, q: ParsedQuestion, list: Expense[]): { list: Expense[]; topic?: string } {
  if (q.trips.length) {
    const ids = new Set(q.trips.map((t) => t.id))
    return { list: list.filter((e) => e.tripId && ids.has(e.tripId)), topic: q.trips.map((t) => t.name).join(', ') }
  }
  if (has(q, 'viagem', 'viagens')) return { list: list.filter((e) => e.categoryId === 'cat-viagem' || !!e.tripId), topic: 'viagem' }
  const cats = db.financialCategories.filter((c) => tokenize(c.name).some((w) => w.length >= 3 && q.tokens.includes(w)))
  if (cats.length) {
    const ids = new Set(cats.map((c) => c.id))
    return { list: list.filter((e) => ids.has(e.categoryId)), topic: cats.map((c) => c.name.toLowerCase()).join(', ') }
  }
  return { list }
}

function spend(ctx: AgentContext): AnswerBlock[] {
  const { db, today, q } = ctx
  const topical = q.trips.length > 0 || has(q, 'viagem', 'viagens')
  // Trip spending defaults to "all time" unless a period was asked.
  const period = topical && !q.time && q.month == null ? undefined : periodFor(q, today)
  const base = period ? expensesBetween(db, period.from, period.to) : paidExpenses(db)
  const { list, topic } = filterByTopic(db, q, base)
  const total = sumCents(list)
  const when = period?.label ?? 'no total'
  const about = topic ? ` com ${topic}` : ''

  if (!list.length)
    return [
      { kind: 'headline', text: `Nenhum gasto${about} registrado ${when} ✨` },
      { kind: 'list', title: 'Quer registrar algo?', emoji: '💸', items: [{ id: 'add', emoji: '➕', title: 'Adicionar gasto', action: sheetAction('expense') }] },
    ]

  const cats = topCategories(db, list, 3)
  const biggest = [...list].sort((a, b) => b.amountCents - a.amountCents).slice(0, 3)
  const top = cats[0]
  const blocks: AnswerBlock[] = [
    {
      kind: 'headline',
      text: `${capitalize(when)}${about}: ${formatBRL(total)} em ${plural(list.length, 'gasto', 'gastos')}.${!topic && cats.length > 1 ? ` O que mais pesou foi ${top.name.toLowerCase()}.` : ''}`,
    },
  ]
  if (cats.length > 1)
    blocks.push({
      kind: 'list',
      title: 'Por categoria',
      emoji: '🧺',
      items: cats.map((c) => ({ id: `cat:${c.name}`, emoji: c.emoji, title: c.name, trailing: formatBRL(c.cents), action: routeAction(ROUTES.money) })),
    })
  blocks.push({
    kind: 'list',
    title: 'Maiores gastos',
    emoji: '🧾',
    items: biggest.map((e) => ({
      id: `expense:${e.id}`,
      emoji: categoryOf(db, e.categoryId)?.emoji ?? '💸',
      title: e.title,
      subtitle: e.date ? dayLabel(e.date, today) : undefined,
      trailing: formatBRL(e.amountCents),
      action: sheetAction('expense', { id: e.id }),
    })),
    more: { label: 'Abrir Dinheiro', action: routeAction(ROUTES.money) },
  })
  return blocks
}

function planned({ db }: AgentContext): AnswerBlock[] {
  const list = db.expenses.filter((e) => e.status === 'planned_purchase')
  if (!list.length) return [{ kind: 'headline', text: 'Nenhuma compra planejada na lista agora.' }]
  return [
    { kind: 'headline', text: `${plural(list.length, 'compra planejada', 'compras planejadas')} na lista.` },
    {
      kind: 'list',
      title: 'Compras planejadas',
      emoji: '🛍️',
      items: list.map((e) => ({ id: `expense:${e.id}`, emoji: '🛍️', title: e.title, trailing: e.amountCents ? formatBRL(e.amountCents) : undefined, action: sheetAction('expense', { id: e.id }) })),
    },
  ]
}

export const FinanceAgent: Agent = {
  id: 'finance',
  name: 'Dinheiro',
  emoji: '💸',
  match(q) {
    if (has(q, 'gast*', 'despesa*', 'paguei', 'gastei')) return 0.9
    if (has(q, 'dinheiro', 'orcamento', 'financas', 'compras planejadas', 'lista de compras')) return 0.8
    if (has(q, 'quanto') && has(q, 'compra*', 'paguei', 'custou', 'custo')) return 0.75
    return 0
  },
  answer(ctx) {
    if (has(ctx.q, 'compras planejadas', 'lista de compras', 'planejada*') && !has(ctx.q, 'gast*')) return planned(ctx)
    return spend(ctx)
  },
}
