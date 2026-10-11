/**
 * Local draft (works offline, no server): written FROM the strategy, never a template with the name swapped.
 * - opening, relationship line, brand detail, proposal and closing each have several real ways of saying it;
 *   the combination is chosen so the opening and the closing differ from her recent messages;
 * - the relationship line says only what is registered ("conheci recentemente", "já uso" — never "há meses");
 * - the brand detail appears only when there is a TRUE fact (with source); otherwise nothing is praised;
 * - only 1–2 of her contexts, the ones the strategy picked;
 * - shaped per channel (DM short without links, e-mail with subject + portfolio, form straight to the point).
 * The result is always run through checkText before it's shown.
 */
import type { MessageStrategy } from './strategy'
import { checkText } from './strategy'
import { normalize } from '@/lib/text'

export interface Draft {
  subject?: string
  text: string
  variant: number
  issues: string[]
}

const pick = <T,>(list: T[], i: number) => list[((i % list.length) + list.length) % list.length]

function hash(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function relationshipLine(s: MessageStrategy, v: number): string {
  const b = s.brand.name
  const r = s.brand
  if (r.alreadyCustomer) {
    const p = r.productsUsed?.[0]
    return pick(p ? [`Já sou cliente de vocês — uso ${p}.`, `Sou cliente da ${b}, uso ${p}.`] : [`Já sou cliente da ${b}.`, `Sou cliente de vocês.`], v)
  }
  if (r.alreadyUsedProduct) {
    const p = r.productsUsed?.[0]
    return pick(p ? [`Já usei ${p} e gostei.`, `Usei ${p} nos meus treinos.`] : [`Já usei produtos de vocês.`, `Já tive a chance de usar a ${b}.`], v)
  }
  const how = r.howDiscovered?.trim()
  if (how) return pick([`Conheci a ${b} ${lower1(how)}.`, `Cheguei até vocês ${lower1(how)}.`], v)
  return pick([`Conheci a ${b} recentemente.`, `Tenho acompanhado o trabalho de vocês.`, `Achei muito interessante a proposta da ${b}.`], v)
}

function factLine(s: MessageStrategy, v: number): string | undefined {
  if (!s.fact) return undefined
  const f = s.fact.text.trim().replace(/[.!]+$/, '')
  return pick([`${f.charAt(0).toUpperCase()}${f.slice(1)} me chamou atenção.`, `Gostei de ver ${lower1(f)}.`, `O que mais me pegou foi ${lower1(f)}.`], v)
}

/** Her contexts, said the way a person says them (never "X faz parte da minha rotina real"). */
const SAY: Record<string, string> = {
  corrida: 'corro',
  triathlon: 'treino triathlon',
  'musculação': 'faço musculação',
  bike: 'pedalo',
  yoga: 'pratico yoga',
  'natação': 'nado',
  surf: 'surfo',
  trekking: 'faço trekking',
  viagens: 'viajo bastante',
  tecnologia: 'trabalho com tecnologia',
  IA: 'uso IA no dia a dia',
  'café': 'não vivo sem café',
  'Luna (cachorro)': 'divido a rotina com a Luna, minha cachorra',
  'rotina real de treino': 'mostro minha rotina real de treino',
  'lifestyle ativo': 'levo uma rotina bem ativa',
  'viagens e experiências outdoor': 'gosto de viagens com experiências outdoor',
}

function introLine(s: MessageStrategy, v: number): string {
  const talk = s.talk.find((t) => SAY[t])
  const how = talk ? SAY[talk] : undefined
  return pick(
    [
      `Sou a Marina, crio conteúdo UGC${how ? ` e ${how}` : ''}.`,
      `Aqui é a Marina, creator de UGC${how ? ` — ${how}` : ''}.`,
      `Me chamo Marina e produzo conteúdo UGC para marcas${how ? `; ${how}` : ''}.`,
    ],
    v,
  )
}

function proposalLine(s: MessageStrategy, v: number): string {
  return pick([`Queria propor ${s.angle}.`, `Tenho uma ideia de ${s.angle}.`, `Pensei em ${s.angle} pra vocês.`], v)
}

const CLOSINGS = ['Faz sentido conversarmos?', 'Posso te mandar algumas ideias?', 'Se fizer sentido, te mando uma proposta rápida.', 'Topam uma conversa curta essa semana?', 'Quer que eu te mande um roteiro de exemplo?']

function greeting(s: MessageStrategy, v: number): string {
  const c = s.contact?.split(' ')[0]
  if (s.channel === 'linkedin') return c ? `Olá, ${c}!` : `Olá, time ${s.brand.name}!`
  if (s.channel === 'whatsapp') return c ? `Oi, ${c}! Tudo bem?` : 'Oi! Tudo bem?'
  return pick(c ? [`Oi, ${c}!`, `Oi, ${c}, tudo bem?`, `Olá, ${c}!`] : [`Oi, time ${s.brand.name}!`, `Oi, pessoal da ${s.brand.name}!`, `Olá! Tudo certo por aí?`], v)
}

function assemble(s: MessageStrategy, v: number): Draft {
  const parts: string[] = []
  const greet = s.spec.greeting ? greeting(s, v) : undefined
  const rel = relationshipLine(s, v + 1)
  const fact = factLine(s, v + 2)
  const intro = introLine(s, v + 3)
  const prop = proposalLine(s, v + 4)
  const close = pick(CLOSINGS, v + hash(s.brand.id))
  const c = s.creator
  let subject: string | undefined
  if (s.channel === 'dm' || s.channel === 'whatsapp') {
    parts.push([greet, intro].filter(Boolean).join(' '), [rel, fact].filter(Boolean).join(' '), `${prop} ${close}`)
  } else if (s.channel === 'linkedin') {
    parts.push(greet!, `${intro} ${rel}`, [fact, prop].filter(Boolean).join(' '), close)
  } else if (s.channel === 'formulario') {
    parts.push(`${intro} ${rel}`, [fact, prop].filter(Boolean).join(' '), `Portfólio: ${c.portfolio ?? ''} · Instagram: ${c.instagram ?? ''}`.trim(), close)
  } else {
    subject = pick([`UGC ${s.talk[0] ? `de ${s.talk[0]} ` : ''}para a ${s.brand.name}`, `Ideia de conteúdo para a ${s.brand.name}`, `${s.brand.name} × Marina Collier (UGC)`], v)
    parts.push(greet!, `${intro} ${rel}`, [fact, prop].filter(Boolean).join(' '), `Meu portfólio está em ${c.portfolio ?? ''} e no Instagram ${c.instagram ?? ''}.`, close, `Um abraço,\n${c.name}`)
  }
  const text = parts.filter((p) => p && p.trim()).join(s.channel === 'dm' || s.channel === 'whatsapp' ? '\n\n' : '\n\n')
  return { subject, text, variant: v, issues: [] }
}

/** The best local draft: the first variant whose opening/closing differ from recent ones and passes all checks. */
export function composeDraft(s: MessageStrategy, seed = 0): Draft {
  let best: Draft | undefined
  for (let i = 0; i < 24; i++) {
    const d = assemble(s, seed + i)
    const check = checkText(s, d.text, d.subject)
    const draft = { ...d, issues: check.issues }
    if (check.ok) return draft
    if (!best || draft.issues.length < best.issues.length) best = draft
  }
  return best!
}

/** "Outra versão": the next variant that is not the current text. */
export function nextDraft(s: MessageStrategy, current: Draft): Draft {
  for (let i = 1; i < 24; i++) {
    const d = composeDraft(s, current.variant + i)
    if (normalize(d.text) !== normalize(current.text)) return d
  }
  return current
}
