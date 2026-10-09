/**
 * Career & money, by conversation. READ · REASON · WRITE · ACT on the same records the screens use.
 *   "recebi o Santander hoje" · "o Fashion Finder ainda não pagou" · "registra que o pagamento do Fashion Finder foi recebido"
 *   "quanto tenho previsto para receber este mês?"
 *   "registra 30 minutos de inglês executivo hoje" · "qual meu progresso na carreira este mês?"
 *   "adiciona uma vaga de Head of Product ao meu pipeline" · "essa vaga não faz mais sentido"
 *   "falei com a Ana da empresa X hoje" · "qual é meu próximo follow-up de networking?"
 *   "isso foi um baita resultado no FashionFinder" · "quais cases ainda estão sem métricas?"
 *   "tenho entrevista na próxima terça. me ajuda a preparar"
 * Never invents a company, person, value or result; asks when something essential is missing; never
 * picks between two similar names; money/career answers respect the privacy lock.
 */
import { ROUTES } from '@/app/routes'
import { openSheet } from '@/app/ui-store'
import { areaLocked } from '@/app/lock-store'
import { CAREER_META, logCareerActivity, quotaFor, weekProgress } from '@/data/career/activities'
import {
  OPP_STATUS_LABEL,
  addContact,
  addOpportunity,
  casesWithoutMetrics,
  logInteraction,
  matchContacts,
  matchOpportunities,
  nextFollowUp,
  openOpportunities,
  setOpportunityStatus,
  updateOpportunity,
} from '@/data/career/pipeline'
import { findContract, markExpected, markReceived, monthIncome, receivableStatus, receivablesFor } from '@/data/finance/receivables'
import { actions } from '@/data/store'
import { REVIEW_QUESTIONS, reviewDraft, saveCareerReview, savedReview } from '@/data/career/review'
import { isCareerQuota } from '@/data/selectors'
import type { CareerKind, DB, LockArea, Opportunity } from '@/data/types'
import { addDays, monthKey } from '@/lib/date'
import { formatBRL, parseSpokenBRL } from '@/lib/money'
import { policyFor } from '../policy'
import { cap, dayIn, ddmm, numberOf } from '../text'
import type { Handler, HandlerInput, LumosReply } from '../types'

const MONEY = 'dinheiro'
const CAREER = 'carreira'

function locked(db: DB, area: LockArea): LumosReply | undefined {
  if (!areaLocked(db.profile.privacyLock, area)) return undefined
  return {
    area: area === 'dinheiro' ? MONEY : CAREER,
    text: `${area === 'dinheiro' ? 'Dinheiro' : 'Carreira'} está protegido — desbloqueia e me pergunta de novo.`,
    link: { label: 'Desbloquear', to: area === 'dinheiro' ? ROUTES.money : ROUTES.career },
  }
}

const isoAt = (date: string) => `${date}T12:00:00.000-03:00`

// ─── Money ──────────────────────────────────────────────────────────────────

const RECEIVED = /\b(recebi|caiu|entrou|pagou|pagaram|foi recebido|foi pago)\b/
const NOT_YET = /\b(ainda nao|nao)\s+(pagou|pagaram|caiu|entrou|recebi)\b/
const FORECAST = /\b(quanto|o que)\b.*\b(previsto|receber|recebo|entra|vou receber)\b|\bprevisao de recebimento/

function money(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (FORECAST.test(n)) {
    const l = locked(db, 'dinheiro')
    if (l) return l
    const m = monthIncome(db, monthKey(now.date), now.date)
    if (!m.items.length) return { area: MONEY, text: 'Não tenho recebimentos cadastrados pra este mês.', link: { label: 'Abrir Dinheiro', to: ROUTES.money } }
    return {
      area: MONEY,
      text: `Neste mês: ${formatBRL(m.grossCents)} previstos (bruto, antes de impostos) — ${formatBRL(m.receivedCents)} já recebidos.`,
      lines: m.items.map((e) => ({
        text: `${e.title} · ${formatBRL(e.effective === 'received' ? (e.receivedAmountCents ?? e.amountCents) : (e.expectedAmountCents ?? e.amountCents))}`,
        sub: e.effective === 'received' ? `recebido ${ddmm(e.receivedAt!.slice(0, 10))}` : e.effective === 'overdue' ? `atrasado desde ${ddmm(e.expectedDate!)}` : e.effective === 'cancelled' ? 'cancelado' : `previsto ${ddmm(e.expectedDate!)}`,
      })),
      link: { label: 'Abrir Dinheiro', to: ROUTES.money },
    }
  }
  const notYet = NOT_YET.test(n)
  if (!notYet && !RECEIVED.test(n)) return undefined
  const contract = findContract(db, input.text)
  if (!contract) {
    // Money words without a known client: only answer when it clearly is about a payment.
    if (!/\b(pagamento|recebimento|cliente)\b/.test(n)) return undefined
    const names = db.contracts.filter((c) => c.status === 'ativo').map((c) => c.client)
    return { area: MONEY, text: names.length ? 'De qual contrato?' : 'Não achei esse contrato.', options: names.map((c) => ({ label: c, prefill: `${notYet ? `${c} ainda não pagou` : `recebi o ${c} hoje`}` })) }
  }
  const l = locked(db, 'dinheiro')
  if (l) return l
  const period = monthKey(now.date)
  // The month it refers to: this month's, or last month's if this one is still far and last month's is open.
  const mine = receivablesFor(db, period).find((e) => e.contractId === contract.id) ?? receivablesFor(db, monthKey(addDays(`${period}-01`, -1))).find((e) => e.contractId === contract.id && e.status === 'expected')
  if (!mine) return { area: MONEY, text: `${contract.client} não tem recebimento previsto pra este mês — o contrato está ${contract.status}.`, link: { label: 'Ver contrato', to: ROUTES.money } }
  const status = receivableStatus(mine, now.date)

  if (notYet) {
    if (mine.status === 'received')
      return {
        area: MONEY,
        text: `${contract.client} está marcado como recebido em ${ddmm(mine.receivedAt!.slice(0, 10))}. Quer que eu volte pra previsto?`,
        options: [{ label: 'Voltar pra previsto', act: { done: `${contract.client}: voltou pra previsto.`, run: () => markExpected(mine.id, 'lumos') } }],
      }
    return {
      area: MONEY,
      text: status === 'overdue' ? `Anotado — ${contract.client} segue em aberto, atrasado desde ${ddmm(mine.expectedDate!)}. Não criei nada novo.` : `Ok — ${contract.client} segue previsto pra ${ddmm(mine.expectedDate!)}. Nada mudou.`,
      ref: { type: 'expense', id: mine.id },
    }
  }

  if (mine.status === 'received') return { area: MONEY, text: `${contract.client} já está como recebido em ${ddmm(mine.receivedAt!.slice(0, 10))} ✓ Não dupliquei nada.` }
  const day = dayIn(n, now.date) ?? now.date
  const expected = mine.expectedAmountCents ?? mine.amountCents
  const at = day === now.date ? undefined : isoAt(day)
  const receive = (value: number): LumosReply['action'] => ({
    mode: value === expected ? policyFor('finance_record') : 'confirm',
    label: `Confirmar ${formatBRL(value)}`,
    done: `${contract.client} recebido ✓ ${formatBRL(value)} em ${ddmm(day)}${value !== expected ? ` — o previsto (${formatBRL(expected)}) ficou guardado.` : '.'}`,
    run: () => markReceived(mine.id, { at, amountCents: value, by: 'lumos' }),
  })
  // The amount she said, read safely ("18 mil e 500", "R$ 18.500", "dezoito mil"); ask when it has two readings.
  const spoken = parseSpokenBRL(input.text)
  if (spoken.kind === 'ambiguous')
    return {
      area: MONEY,
      text: `Quanto caiu do ${contract.client}? Entendi mais de um valor.`,
      sub: `Previsto: ${formatBRL(expected)} (bruto).`,
      options: [
        ...spoken.options.map((c) => ({ label: formatBRL(c), act: { done: receive(c)!.done!, run: receive(c)!.run } })),
        { label: 'Outro valor', prefill: `recebi o ${contract.client} ${day === now.date ? 'hoje' : `dia ${Number(day.slice(8, 10))}`}, R$ ` },
      ],
      ref: { type: 'expense', id: mine.id },
    }
  const value = spoken.kind === 'ok' ? spoken.cents : expected
  if (value === expected)
    return {
      area: MONEY,
      text: `${contract.client} recebido ✓ ${formatBRL(value)} em ${ddmm(day)}.`,
      sub: 'Valor bruto. Atualizei o mês em Dinheiro.',
      action: receive(value),
      ref: { type: 'expense', id: mine.id },
    }
  // A different amount is relevant money: she confirms it before it is written.
  return {
    area: MONEY,
    text: `${contract.client}: marco ${formatBRL(value)} recebido em ${ddmm(day)}?`,
    sub: `O previsto era ${formatBRL(expected)} — ele fica guardado e o contrato não muda. Dá pra pôr uma observação no recebimento depois.`,
    action: receive(value),
    ref: { type: 'expense', id: mine.id },
  }
}

// ─── Career activities ──────────────────────────────────────────────────────

const KIND_WORDS: [RegExp, CareerKind][] = [
  [/\bingles (executivo|exec)\b|\bingles\b/, 'ingles_exec'],
  [/\bnetworking\b/, 'networking'],
  [/\bpost(s)?\b|\bconteudo profissional\b|\blinkedin\b/, 'post'],
  [/\blideranca\b/, 'lideranca'],
]

function logActivity(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!/\b(registra|anota|fiz|fazer registro|marca)\b/.test(n)) return undefined
  const kind = KIND_WORDS.find(([re]) => re.test(n))?.[1]
  if (!kind || !/\b(min|minutos|hora|horas|sessao|fiz|post)\b/.test(n)) return undefined
  if (kind === 'ingles_exec' && !/\bexecutivo|exec\b/.test(n) && !quotaFor(db, 'ingles_exec')) return undefined
  const l = locked(db, 'carreira')
  if (l) return l
  const quota = quotaFor(db, kind)
  if (!quota) return { area: CAREER, text: `${CAREER_META[kind].label} não está entre suas atividades de carreira agora.`, link: { label: 'Carreira 2027', to: ROUTES.career } }
  const mins = /(\d+|\w+)\s*(min|minutos)\b/.exec(n)
  const hours = /(\d+|uma|meia)\s*(h|hora|horas)\b/.exec(n)
  const minutes = mins ? numberOf(mins[1]) : hours ? (hours[1] === 'meia' ? 30 : (numberOf(hours[1]) ?? 1) * 60) : undefined
  const date = dayIn(n, now.date) ?? now.date
  const week = weekProgress(db, date).find((p) => p.kind === kind)!
  const after = week.unit === 'min' ? week.done + (minutes ?? CAREER_META[kind].sessionMin) : week.done + 1
  return {
    area: CAREER,
    text: `${CAREER_META[kind].label}: ${minutes ?? CAREER_META[kind].sessionMin} min ${date === now.date ? 'hoje' : `em ${ddmm(date)}`} ✓ Semana: ${after}/${week.target}${week.unit === 'min' ? ' min' : ''}.`,
    action: { mode: policyFor('career_update'), run: () => logCareerActivity(kind, date, { minutes, by: 'lumos' })?.undo ?? (() => {}) },
  }
}

function progress(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!/\b(progresso|como (estou|esta|ta)|como anda)\b.*\bcarreira\b|\bcarreira\b.*\b(progresso|esse mes|este mes)\b/.test(n)) return undefined
  const l = locked(db, 'carreira')
  if (l) return l
  const month = monthKey(now.date)
  const inMonth = (d?: string) => !!d && d.slice(0, 7) === month
  const quotaIds = new Set(db.tasks.filter(isCareerQuota).map((t) => t.id))
  const byKind = new Map<CareerKind, number>()
  for (const t of db.tasks) if (t.careerParentId && t.status === 'done' && inMonth(t.date) && t.careerKind) byKind.set(t.careerKind, (byKind.get(t.careerKind) ?? 0) + 1)
  for (const o of db.occurrences) {
    if (o.parentType !== 'task' || !quotaIds.has(o.parentId) || !inMonth(o.date)) continue
    const k = db.tasks.find((t) => t.id === o.parentId)?.careerKind
    if (k) byKind.set(k, (byKind.get(k) ?? 0) + 1)
  }
  const oppsMoved = db.opportunities.filter((o) => o.history?.some((h) => inMonth(h.date))).length
  const talks = db.contacts.reduce((s, c) => s + (c.interactions ?? []).filter((i) => inMonth(i.date)).length, 0)
  const newCases = db.wins.filter((w) => w.evidence && inMonth(w.updatedAt.slice(0, 10))).length
  const lines = [
    ...[...byKind.entries()].map(([k, c]) => ({ text: `${CAREER_META[k].emoji} ${CAREER_META[k].label}: ${c} ${c === 1 ? 'vez' : 'vezes'}` })),
    { text: `💼 Oportunidades que andaram: ${oppsMoved}` },
    { text: `🤝 Conversas de networking: ${talks}` },
    { text: `📈 Cases trabalhados: ${newCases}` },
  ]
  const nothing = !byKind.size && !oppsMoved && !talks && !newCases
  return {
    area: CAREER,
    text: nothing ? 'Ainda não tem registro de carreira neste mês — quando você me contar o que fez, eu vou somando aqui.' : 'Neste mês, o que está registrado:',
    lines: nothing ? undefined : lines,
    sub: 'Só o que foi registrado — sem nota, sem porcentagem.',
    link: { label: 'Carreira 2027', to: ROUTES.career },
  }
}

// ─── Opportunities ──────────────────────────────────────────────────────────

function pickOpp(db: DB, input: HandlerInput): { one?: Opportunity; many: Opportunity[] } {
  const named = matchOpportunities(db, input.text).filter((o) => o.status !== 'descartada' && o.status !== 'fechada')
  if (named.length === 1) return { one: named[0], many: named }
  if (named.length > 1) return { many: named }
  const last = input.ctx.lastRef?.type === 'opportunity' ? db.opportunities.find((o) => o.id === input.ctx.lastRef!.id) : undefined
  if (last) return { one: last, many: [last] }
  const open = openOpportunities(db)
  return open.length === 1 ? { one: open[0], many: open } : { many: open }
}

function opportunities(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  // Add a role: "adiciona uma vaga de Head of Product (na Empresa X) ao meu pipeline"
  const add = /\b(adiciona|coloca|anota|cria|bota)\b.*\b(vaga|oportunidade)\b(?: de| para| pra)? (.+?)(?: (?:na|no|da|do|em) (.+?))?(?: (?:ao|no|pro|para o) (?:meu )?pipeline)?$/.exec(n)
  if (add) {
    const l = locked(db, 'carreira')
    if (l) return l
    const roleRaw = add[3].replace(/\b(ao|no|pro|para o) (meu )?pipeline\b/, '').trim()
    const company = add[4]?.replace(/\b(ao|no) (meu )?pipeline\b/, '').trim()
    const role = cap(text.slice(normalizeIndex(text, roleRaw), normalizeIndex(text, roleRaw) + roleRaw.length) || roleRaw)
    if (!company) return { area: CAREER, text: `Anoto “${role}” — de qual empresa?`, options: [{ label: 'Dizer a empresa', prefill: `adiciona uma vaga de ${role} na ` }] }
    const companyNice = cap(text.slice(normalizeIndex(text, company), normalizeIndex(text, company) + company.length) || company)
    return {
      area: CAREER,
      text: `${role} · ${companyNice} entrou no pipeline ✓ Status: no radar.`,
      sub: 'Quando tiver próxima ação ou data, me fala que eu anoto.',
      action: { mode: policyFor('career_update'), run: () => addOpportunity({ role, company: companyNice }, now.date, 'lumos').undo },
      link: { label: 'Carreira 2027', to: ROUTES.career },
    }
  }
  // Discard: "essa vaga não faz mais sentido"
  if (/\b(vaga|oportunidade|processo)\b.*\b(nao faz mais sentido|desisti|descarta|nao rola|nao quero mais)\b|\bdescarta (essa|a) (vaga|oportunidade)\b/.test(n)) {
    const l = locked(db, 'carreira')
    if (l) return l
    const { one, many } = pickOpp(db, input)
    if (!one) return many.length ? { area: CAREER, text: 'Qual delas?', options: many.map((o) => ({ label: `${o.role} · ${o.company}`, prefill: `a vaga ${o.company} não faz mais sentido` })) } : { area: CAREER, text: 'Não tem vaga aberta no seu pipeline agora.' }
    return {
      area: CAREER,
      text: `${one.role} · ${one.company} saiu do pipeline ✓ Fica no histórico como descartada.`,
      action: { mode: policyFor('career_update'), run: () => setOpportunityStatus(one.id, 'descartada', now.date, { note: input.text, by: 'lumos' }) },
      ref: { type: 'opportunity', id: one.id },
    }
  }
  // Interview: "tenho entrevista na próxima terça. me ajuda a preparar"
  if (/\bentrevista\b/.test(n)) {
    const l = locked(db, 'carreira')
    if (l) return l
    const date = dayIn(n.replace(/\bproxima\b/, ''), now.date)
    const { one, many } = pickOpp(db, input)
    if (!one) return { area: CAREER, text: many.length ? 'Entrevista pra qual vaga?' : 'Pra qual empresa e vaga? Eu coloco no pipeline e já monto o preparo.', options: many.map((o) => ({ label: `${o.role} · ${o.company}`, prefill: `tenho entrevista na ${o.company}${date ? ` ${ddmm(date)}` : ''}` })) }
    const weak = casesWithoutMetrics(db)
    const prep = [
      { text: `Pesquisar ${one.company}: produto, momento, liderança` },
      { text: weak.length ? `Fechar números de ${weak.length} case(s) sem métricas: ${weak.slice(0, 2).map((w) => w.title).join(', ')}` : 'Escolher 3 cases e ensaiar contexto → decisão → impacto' },
      { text: 'Preparar 3 perguntas pra quem entrevista' },
      ...(one.country && !/brasil/i.test(one.country) ? [{ text: 'Ensaiar pitch em inglês (5 min)' }] : []),
    ]
    const dayBefore = date ? addDays(date, -1) : undefined
    return {
      area: CAREER,
      text: `${one.role} · ${one.company}: entrevista ${date ? `em ${ddmm(date)}` : 'anotada'} ✓ Preparo sugerido:`,
      lines: prep,
      action: { mode: policyFor('career_update'), run: () => {
        const u1 = updateOpportunity(one.id, { nextAction: 'Entrevista', nextActionDate: date ?? one.nextActionDate }, now.date)
        const u2 = one.status !== 'entrevista' ? setOpportunityStatus(one.id, 'entrevista', now.date, { by: 'lumos' }) : () => {}
        return () => { u2(); u1() }
      } },
      options: dayBefore
        ? [{ label: `Pôr o preparo na agenda (${ddmm(dayBefore)})`, act: { done: 'Preparo no seu dia ✓', run: () => {
            const created = prep.map((p, i) => actions.create('tasks', { title: p.text, date: dayBefore, status: 'todo', context: 'carreira', area: 'profissional', planType: 'flexivel', order: 950 + i }))
            return () => created.forEach((t) => actions.remove('tasks', t.id))
          } } }]
        : undefined,
      ref: { type: 'opportunity', id: one.id },
    }
  }
  return undefined
}

/** Position of a normalized fragment in the original text (accent-insensitive, same length for pt-BR). */
function normalizeIndex(original: string, fragment: string): number {
  const n = original.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const i = n.indexOf(fragment)
  return i < 0 ? 0 : i
}

// ─── People ─────────────────────────────────────────────────────────────────

function people(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  if (/\bproximo follow[ -]?up\b|\bquem (eu )?preciso (chamar|cobrar|responder)\b/.test(n)) {
    const l = locked(db, 'carreira')
    if (l) return l
    const f = nextFollowUp(db, now.date)
    return f ? { area: CAREER, text: `Próximo follow-up: ${f.who} — ${f.date < now.date ? `estava pra ${ddmm(f.date)}` : f.date === now.date ? 'hoje' : ddmm(f.date)}.` } : { area: CAREER, text: 'Nenhum follow-up marcado. Quando falar com alguém, me conta que eu guardo.' }
  }
  const talked = /\b(falei|conversei|tomei um cafe|almocei|encontrei)\b com (?:a |o )?([a-z]+(?: [a-z]+)?)(?: (?:da|do|de) (?:empresa )?(.+?))?(?: (hoje|ontem|amanha))?$/.exec(n)
  if (!talked) return undefined
  const l = locked(db, 'carreira')
  if (l) return l
  const name = talked[2].replace(/\b(hoje|ontem)\b/, '').trim()
  const company = talked[3]?.replace(/\b(hoje|ontem)\b/, '').trim()
  const date = /\bontem\b/.test(n) ? addDays(now.date, -1) : now.date
  const found = matchContacts(db, name, company)
  const niceName = cap(text.slice(normalizeIndex(text, name), normalizeIndex(text, name) + name.length) || name)
  const niceCompany = company ? cap(text.slice(normalizeIndex(text, company), normalizeIndex(text, company) + company.length) || company) : undefined
  if (found.length === 1) {
    const c = found[0]
    return { area: CAREER, text: `Anotado: conversa com ${c.name}${c.company ? ` (${c.company})` : ''} em ${ddmm(date)} ✓`, action: { mode: policyFor('career_update'), run: () => logInteraction(c.id, date, undefined, 'lumos') }, ref: { type: 'contact', id: c.id } }
  }
  if (found.length > 1) return { area: CAREER, text: `Tenho mais de uma ${niceName}. Qual?`, options: found.map((c) => ({ label: `${c.name}${c.company ? ` · ${c.company}` : ''}`, prefill: `falei com ${c.name}${c.company ? ` da ${c.company}` : ''} ${date === now.date ? 'hoje' : 'ontem'}` })) }
  return {
    area: CAREER,
    text: `Não tenho ${niceName}${niceCompany ? ` (${niceCompany})` : ''} nos seus contatos ainda.`,
    options: [{ label: `Guardar ${niceName}${niceCompany ? ` · ${niceCompany}` : ''}`, act: { done: `${niceName} guardada, com a conversa de ${ddmm(date)} ✓`, run: () => addContact({ name: niceName, company: niceCompany, lastInteraction: date, interactions: [{ date }] }, 'lumos').undo } }],
  }
}

// ─── Evidence ───────────────────────────────────────────────────────────────

function evidence(input: HandlerInput): LumosReply | undefined {
  const { db, n, now, text } = input
  if (/\bcases?\b.*\bsem (metrica|numero)s?\b/.test(n)) {
    const l = locked(db, 'carreira')
    if (l) return l
    const list = casesWithoutMetrics(db)
    return list.length ? { area: CAREER, text: `${list.length} ${list.length === 1 ? 'case ainda está' : 'cases ainda estão'} sem métricas:`, lines: list.map((w) => ({ text: w.title })), link: { label: 'Carreira 2027', to: ROUTES.career } } : { area: CAREER, text: 'Todos os seus cases têm números ✓' }
  }
  if (/\btransforma (o |meu )?(ultimo )?win em (case|evidencia)\b/.test(n)) {
    const w = [...db.wins].filter((x) => !x.evidence).sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!w) return { area: CAREER, text: 'Não achei um win recente pra transformar.' }
    return { area: CAREER, text: `“${w.title}” — vamos contar como case: contexto, decisão, impacto e números.`, options: [{ label: 'Abrir o case', act: { done: 'Aberto ✓', run: () => { openSheet('evidence', { id: w.id }); return () => {} } } }] }
  }
  if (!/\b(baita|otimo|grande|enorme|belo|importante) resultado\b|\b(foi|deu) (um )?(baita|otimo|grande) (resultado|win)\b|\bisso foi um win\b/.test(n)) return undefined
  const project = db.projects.find((p) => n.includes(p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '')) || n.includes(p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')))
  const title = `Resultado${project ? ` no ${project.name}` : ''} (${ddmm(now.date)})`
  return {
    area: CAREER,
    text: `Boa! Quer guardar isso${project ? ` no ${project.name}` : ''}? Um win vira evidência executiva quando tiver contexto, decisão e números.`,
    options: [
      { label: 'Registrar como win', act: { done: 'Win registrado ✓ Dá pra virar case em Carreira 2027.', run: () => {
        const w = actions.create('wins', { date: now.date, title, kind: 'entrega', projectId: project?.id, description: text })
        return () => actions.remove('wins', w.id)
      } } },
      { label: 'Contar os detalhes', prefill: 'o resultado foi ' },
    ],
  }
}

// ─── Executive Career Review ────────────────────────────────────────────────

function review(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (!/\b(revisao|review)\b.*\b(executiva|carreira|career)\b|\bexecutive career review\b/.test(n)) return undefined
  const l = locked(db, 'carreira')
  if (l) return l
  const month = monthKey(now.date)
  const draft = reviewDraft(db, month, now.date)
  const sections = REVIEW_QUESTIONS.map((q) => ({ title: q.label, lines: (draft[q.key] ?? '').split('\n').filter(Boolean).map((text) => ({ text })) })).filter((s) => s.lines.length)
  const done = savedReview(db, month)?.completedAt
  return {
    area: CAREER,
    text: sections.length ? 'Montei o rascunho com o que já está registrado — você não precisa recadastrar nada.' : 'Ainda não tem registro de carreira neste mês, então o rascunho está em branco — me conta o que avançou?',
    sections,
    sub: 'Faltam as três prioridades do próximo mês — essas são suas.',
    options: [{ label: done ? 'Atualizar com este rascunho' : 'Salvar este rascunho', act: { done: 'Revisão salva ✓ Dá pra ajustar em Carreira 2027.', run: () => saveCareerReview(month, { ...draft, ...(savedReview(db, month)?.career ?? {}) }, 'lumos') } }],
    link: { label: 'Abrir e ajustar', to: ROUTES.careerReview },
  }
}

function careerAll(input: HandlerInput): LumosReply | undefined {
  return money(input) ?? logActivity(input) ?? progress(input) ?? review(input) ?? opportunities(input) ?? people(input) ?? evidence(input)
}

export const careerHandler: Handler = { id: 'career', run: careerAll }
export { OPP_STATUS_LABEL }
