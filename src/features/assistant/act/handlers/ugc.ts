/**
 * UGC Business by conversation — the same records as the UGC space and the Home:
 *   "adiciona Galápagos na minha lista de prospecção" · "quero abordar a Ocean Drop"
 *   "mandei mensagem pra Nomad hoje" · "mandei e-mail pra Snug" · "mandei follow-up pra Snug"
 *   "Ocean Drop respondeu"                → Conversa, follow-ups cancelled
 *   "faz follow-up da Snug"               → where it stands + "já mandei"
 *   "essa eu já uso" · "nunca usei essa marca" · "sou cliente da X"   (only what she says)
 *   "essa marca não faz mais sentido"     → archived (asks first)
 *   "fechei com a Snug por R$ 800"        → Produção + expected in Dinheiro
 *   "recebi o pagamento da Snug"          → received, deal done
 *   "quem devo abordar hoje?" · "quem está esperando follow-up?" · "quais marcas têm maior potencial?"
 *   "gera uma DM pra Galápagos"          → strategy + draft (asks “já usou?” first when unknown); never sent
 */
import { ROUTES } from '@/app/routes'
import type { Brand, DB, UgcChannel, UgcOpportunity } from '@/data/types'
import {
  approachToday,
  brandOf,
  CHANNEL_LABEL,
  currentOpportunity,
  findBrand,
  followUpDay,
  followUpsDue,
  isLive,
  prefsOf,
  prospects,
  stageIndex,
  stageLabel,
  STATUS_LABEL,
  TIERS,
  toAnswer,
  weekNumbers,
} from '@/data/ugc/model'
import { archiveBrand, closeDeal, ensureProspect, markPaid, opportunityFor, recordOutbound, recordReply, saveDraft, setRelationship } from '@/data/ugc/ops'
import { buildStrategy, describeFact } from '@/data/ugc/strategy'
import { composeDraft } from '@/data/ugc/compose'
import { LEVEL_LABEL, MIN_OUTCOMES, outcomes, potential } from '@/data/ugc/score'
import { addDays, formatDayMonth } from '@/lib/date'
import { formatBRL, parseSpokenBRL } from '@/lib/money'
import { uid } from '@/lib/id'
import { normalize } from '@/lib/text'
import { eventDraft, runLogged } from '../log'
import type { Handler, HandlerInput, LumosReply, ReplyLine, Undo } from '../types'

const AREA = 'ugc'
const clean = (s: string) => s.replace(/[.!?…]+$/g, '').replace(/^(?:a|o|as|os)\s+(?:marca\s+)?/i, '').replace(/^marca\s+/i, '').trim()

/** Brand named in the sentence, or the one the conversation is about ("essa marca"). */
function brandFrom(db: DB, name: string | undefined, input: HandlerInput): Brand | undefined {
  if (name && !/^(essa|esta|ela|isso|essa marca)$/i.test(name.trim())) return findBrand(db, name.replace(/[.!?…]+$/g, '').trim()) ?? findBrand(db, clean(name))
  const ref = input.ctx.lastRef
  if (ref?.type === 'brand') return db.brands.find((b) => b.id === ref.id)
  if (ref?.type === 'ugcOpportunity') {
    const o = db.ugcOpportunities.find((x) => x.id === ref.id)
    return o ? brandOf(db, o) : undefined
  }
  return undefined
}

function channelIn(n: string): UgcChannel | undefined {
  if (/\b(e-?mail|email)\b/.test(n)) return 'email'
  if (/\bformulario\b/.test(n)) return 'formulario'
  if (/\blinkedin\b/.test(n)) return 'linkedin'
  if (/\b(whats|whatsapp|zap)\b/.test(n)) return 'whatsapp'
  if (/\b(dm|direct|mensagem|insta|instagram)\b/.test(n)) return 'dm'
  return undefined
}

const logged = (now: HandlerInput['now'], title: string, write: () => Undo, ref?: { type: 'brand' | 'ugcOpportunity'; id: string }) => runLogged(write, [eventDraft(now, { kind: 'changed', title, area: 'trabalho', ref })])

const when = (now: HandlerInput['now']) => ({ date: now.date, iso: now.iso })

// ─── add / approach ─────────────────────────────────────────────────────────

const ADD = [
  /^(?:adiciona|adicione|adicionar|coloca|coloque|bota|inclui|inclua|p[oõ]e)\s+(?:a\s+marca\s+|a\s+|o\s+)?(.+?)\s+(?:na|no|pra|para|em)\s+(?:minha\s+)?(?:lista\s+(?:de\s+)?)?(?:prospec[cç][aã]o|prospectar|marcas|ugc|pipeline|crm)\b.*$/i,
  /^quero\s+(?:abordar|prospectar|contatar|falar com)\s+(?:a\s+marca\s+|a\s+|o\s+)?(.+)$/i,
  /^nova\s+marca\s*:?\s+(.+)$/i,
]

function add(input: HandlerInput): LumosReply | undefined {
  const { db, text, now } = input
  const m = ADD.map((r) => r.exec(text.trim())).find(Boolean)
  if (!m) return undefined
  const name = clean(m[1])
  if (!name || name.split(' ').length > 5) return undefined
  const existing = findBrand(db, name)
  const live = existing && db.ugcOpportunities.find((o) => o.brandId === existing.id && isLive(db, o))
  if (existing && live) return { area: AREA, text: `${existing.name} já está na sua lista ✓`, sub: `${stageLabel(live.stage)} · ${STATUS_LABEL[live.status]}`, ref: { type: 'brand', id: existing.id }, link: { label: 'Abrir marca', to: ROUTES.ugcBrand(existing.id) } }
  const brandId = existing?.id ?? uid()
  return {
    area: AREA,
    text: `${existing?.name ?? name} na prospecção ✓`,
    sub: existing ? 'Nova oportunidade com uma marca que você já tinha.' : 'Já é cliente ou já usou algo deles? Me conta que eu anoto — sem isso eu não presumo nada.',
    ref: existing ? { type: 'brand', id: existing.id } : undefined,
    options: [
      { label: 'Já uso', ask: `já uso a ${existing?.name ?? name}` },
      { label: 'Nunca usei', ask: `nunca usei a ${existing?.name ?? name}` },
    ],
    action: {
      mode: 'direct',
      run: () =>
        logged(now, `UGC: ${name} na prospecção`, () => {
          const r = ensureProspect(existing?.name ?? name, existing ? {} : { id: brandId })
          return r.undo
        }),
    },
    link: { label: 'Abrir marca', to: ROUTES.ugcBrand(brandId) },
  }
}

// ─── contacts ───────────────────────────────────────────────────────────────

const SENT = /^(?:hoje\s+)?(?:ja\s+)?(?:mandei|enviei|fiz|mandamos|mando|mandei\s+um|mandei\s+uma)\s+(?:uma?\s+)?(follow-?up|dm|direct|mensagem|e-?mail|email|formulario|linkedin|whats(?:app)?|zap|proposta)\s+(?:pra|para|pro|a|ao|à|da|do|na|no)\s+(?:a\s+|o\s+)?(.+?)(?:\s+(?:hoje|agora|de manha|de tarde|a noite))?$/

function sent(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = SENT.exec(n.replace(/[.!]+$/, ''))
  if (!m) return undefined
  const brand = brandFrom(db, m[2], input)
  const kind = m[1]
  const channel = channelIn(kind) ?? undefined
  const name = brand?.name ?? clean(input.text.trim().split(/\s+(?:pra|para|pro)\s+/i).pop() ?? m[2]).replace(/\s+(hoje|agora)$/i, '')
  if (!brand && !/^\p{Lu}/u.test(name)) return undefined // a brand she never added: only when it looks like a name
  const o = brand ? currentOpportunity(db, brand.id) : undefined
  const ch: UgcChannel = channel ?? o?.primaryChannel ?? 'dm'
  const isFollow = /follow/.test(kind)
  const label = isFollow ? 'Follow-up' : kind === 'proposta' ? 'Proposta' : CHANNEL_LABEL[ch]
  // Where the cadence goes after this contact (same rule as recordOutbound).
  const prefs = prefsOf(db)
  const first = !o?.firstContactAt
  const afterReply = !!o?.responseReceivedAt && stageIndex(o.stage) >= stageIndex('conversa')
  const nextDay = first || afterReply ? followUpDay(prefs, now.date, 0) : followUpDay(prefs, o!.cadenceFrom ?? o!.firstContactAt!, (o!.followUpStep ?? 0) + 1)
  const next = nextDay ? `Próximo follow-up: ${formatDayMonth(nextDay)}.` : `Sem resposta depois de ${prefs.cadence.length} follow-ups — tento de novo em ${prefs.reactivateDays} dias.`
  return {
    area: AREA,
    text: `${label} pra ${brand?.name ?? name} registrado ✓`,
    sub: next,
    ref: brand ? { type: 'brand', id: brand.id } : undefined,
    action: {
      mode: 'direct',
      run: () =>
        logged(now, `UGC: ${label} → ${brand?.name ?? name}`, () => {
          const target = brand ? opportunityFor(brand.id) : (() => {
            const r = ensureProspect(name)
            return { opportunity: r.opportunity, undo: r.undo }
          })()
          const r = recordOutbound(target.opportunity.id, ch, when(now), undefined, kind === 'proposta' ? 'proposta' : undefined)
          return () => {
            r.undo()
            target.undo()
          }
        }),
    },
  }
}

const REPLIED = /^(?:a\s+|o\s+)?(.+?)\s+(?:me\s+|ja\s+)?(?:respondeu|retornou|deu retorno|aceitou conversar|topou conversar)\b/

function replied(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = REPLIED.exec(n)
  if (!m) return undefined
  const brand = brandFrom(db, m[1], input)
  if (!brand) return undefined
  const o = currentOpportunity(db, brand.id)
  if (!o) return undefined
  const ch = channelIn(n)
  return {
    area: AREA,
    text: `${brand.name} respondeu ✓ Foi pra Conversa.`,
    sub: o.nextFollowUpAt ? 'Cancelei os follow-ups que faltavam.' : undefined,
    ref: { type: 'brand', id: brand.id },
    options: [{ label: 'Abrir marca', ask: `abre ${brand.name}` }],
    link: { label: 'Abrir marca', to: ROUTES.ugcBrand(brand.id) },
    action: { mode: 'direct', run: () => logged(now, `UGC: ${brand.name} respondeu`, () => recordReply(o.id, when(now), ch), { type: 'brand', id: brand.id }) },
  }
}

const FOLLOW = /^(?:faz|fazer|faca|preciso fazer|bora fazer)\s+(?:o\s+)?follow-?up\s+(?:da|do|de|com a|com o|com)\s+(.+)$/

function followUp(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = FOLLOW.exec(n)
  if (!m) return undefined
  const brand = brandFrom(db, m[1], input)
  if (!brand) return undefined
  const o = currentOpportunity(db, brand.id)
  if (!o) return undefined
  const step = (o.followUpStep ?? 0) + 1
  const ch = o.primaryChannel ?? 'dm'
  return {
    area: AREA,
    text: o.firstContactAt ? `Follow-up ${step} da ${brand.name} · ${CHANNEL_LABEL[ch]}` : `${brand.name} ainda não foi abordada`,
    sub: [o.lastContactAt ? `Último contato ${formatDayMonth(o.lastContactAt)}.` : undefined, o.nextFollowUpAt ? `Estava previsto pra ${formatDayMonth(o.nextFollowUpAt)}.` : undefined, 'O texto sob medida pra cada marca chega com o motor de abordagem (próxima entrega).'].filter(Boolean).join(' '),
    ref: { type: 'brand', id: brand.id },
    options: [
      {
        label: 'Já mandei',
        act: { done: `Follow-up pra ${brand.name} registrado ✓`, run: () => logged(now, `UGC: follow-up → ${brand.name}`, () => recordOutbound(o.id, ch, when(now)).undo) },
      },
    ],
  }
}

// ─── relationship (only what she says) ──────────────────────────────────────

const USE = /^(?:essa\s+(?:marca\s+)?)?(?:eu\s+)?(?:ja\s+)?(uso|usei|sou cliente|tenho|ja tenho|nunca usei|nao uso|nao conheco|nunca comprei|nao sou cliente)(?:\s+(?:da|do|de|a|o|os produtos da|os produtos do|produto da|produto do))?\s*(.*)$/
const THIS_ONE = /^essa\s+(?:eu\s+)?(?:ja\s+)?(uso|usei|tenho|nunca usei|nao uso)$/

function relationship(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = THIS_ONE.exec(n) ?? USE.exec(n)
  if (!m) return undefined
  const verb = m[1]
  const name = (m[2] ?? '').trim()
  const brand = brandFrom(db, name || undefined, input)
  if (!brand) return undefined
  const yes = !/^(nunca|nao)/.test(verb)
  const p = /cliente|comprei/.test(verb) ? { alreadyCustomer: yes } : { alreadyUsedProduct: yes, ...(yes ? {} : { alreadyCustomer: brand.alreadyCustomer === true ? true : false }) }
  return {
    area: AREA,
    text: yes ? `Anotado: você já ${/cliente/.test(verb) ? 'é cliente' : 'usa'} ${brand.name} ✓` : `Anotado: você nunca usou ${brand.name} ✓`,
    sub: yes ? 'Na abordagem isso entra do jeito que é — sem exagero.' : 'Na abordagem eu nunca finjo experiência: “conheci recentemente”, “tenho acompanhado”.',
    ref: { type: 'brand', id: brand.id },
    action: { mode: 'direct', run: () => logged(now, `UGC: relação com ${brand.name}`, () => setRelationship(brand.id, p), { type: 'brand', id: brand.id }) },
  }
}

// ─── end / close / paid ─────────────────────────────────────────────────────

const NO_SENSE = /^(?:a\s+|o\s+)?(?:(.+?)\s+)?(?:nao faz mais sentido|nao quero mais|pode tirar|tira da lista|desisti)(?:\s+(?:da|do|de)\s+(.+))?$/

function noSense(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = NO_SENSE.exec(n)
  if (!m) return undefined
  const brand = brandFrom(db, m[2] ?? (m[1] && !/^essa( marca)?$/.test(m[1]) ? m[1] : undefined), input)
  if (!brand) return undefined
  return {
    area: AREA,
    text: `Tirar ${brand.name} da prospecção?`,
    sub: 'Sai de todas as filas; o histórico fica. Dá pra reabrir quando quiser.',
    ref: { type: 'brand', id: brand.id },
    action: { mode: 'confirm', label: 'Tirar', done: `${brand.name} arquivada ✓`, run: () => logged(now, `UGC: ${brand.name} arquivada`, () => archiveBrand(brand.id), { type: 'brand', id: brand.id }) },
  }
}

const CLOSED = /^(?:fechei|fechamos|fechou)\s+(?:com\s+)?(?:a\s+|o\s+)?(.+?)(?:\s+(?:por|de|valor|em)\s+(.+))?$/

function closed(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = CLOSED.exec(n)
  if (!m) return undefined
  const brand = brandFrom(db, m[1], input)
  if (!brand) return undefined
  const amount = m[2] ? parseSpokenBRL(m[2]) : ({ kind: 'none' } as const)
  if (amount.kind === 'ambiguous') return { area: AREA, text: 'Qual valor?', options: amount.options.map((c) => ({ label: formatBRL(c), ask: `fechei com ${brand.name} por ${formatBRL(c)}` })) }
  const cents = amount.kind === 'ok' ? amount.cents : undefined
  const o = currentOpportunity(db, brand.id)
  if (!o) return undefined
  return {
    area: AREA,
    text: `Fechado com ${brand.name}${cents ? ` por ${formatBRL(cents)}` : ''} ✓`,
    sub: cents ? 'Foi pra Produção e entrou como previsto no Dinheiro.' : 'Foi pra Produção. Quando souber o valor, me fala que eu coloco no Dinheiro.',
    ref: { type: 'brand', id: brand.id },
    action: { mode: 'direct', run: () => logged(now, `UGC: fechado com ${brand.name}`, () => closeDeal(o.id, now.date, cents), { type: 'brand', id: brand.id }) },
  }
}

const PAID = /^(?:recebi|caiu|entrou)\s+(?:o\s+)?(?:pagamento|pix|dinheiro|valor)\s+(?:da|do|de)\s+(?:campanha\s+(?:da|do|de)\s+)?(?:a\s+|o\s+)?(.+?)$|^(?:a\s+|o\s+)?(.+?)\s+(?:me\s+)?pagou$/

function paid(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = PAID.exec(n)
  if (!m) return undefined
  const brand = brandFrom(db, m[1] ?? m[2], input)
  if (!brand) return undefined
  const o = db.ugcOpportunities.filter((x) => x.brandId === brand.id && stageIndex(x.stage) >= stageIndex('producao') && !x.paidAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (!o) return { area: AREA, text: `Não achei campanha fechada da ${brand.name} esperando pagamento.`, ref: { type: 'brand', id: brand.id } }
  return {
    area: AREA,
    text: `Pagamento da ${brand.name} recebido ✓${o.agreedValueCents ? ` ${formatBRL(o.agreedValueCents)}` : ''}`,
    sub: 'Campanha concluída. No Dinheiro, o previsto virou recebido (o mesmo registro).',
    ref: { type: 'brand', id: brand.id },
    action: { mode: 'direct', run: () => logged(now, `UGC: pagamento ${brand.name}`, () => markPaid(o.id, now.date), { type: 'brand', id: brand.id }) },
  }
}

// ─── questions ──────────────────────────────────────────────────────────────

const WHO_TODAY = /\b(?:quem|que marcas?|quais marcas?)\b.*\b(?:abordar|prospectar|contatar|chamar)\b/
const WHO_WAITING = /\b(?:quem|que marcas?|quais marcas?)\b.*\b(?:esperando|espera|precisa|devo|falta)\b.*\bfollow-?up\b|^follow-?ups?\s+(?:de hoje|pendentes)$/
const POTENTIAL = /\b(?:quais|que)\s+marcas?\b.*\b(?:potencial|prioridade|vale a pena|mais importantes)\b/

const line = (db: DB, o: UgcOpportunity, sub?: string): ReplyLine => {
  const b = brandOf(db, o)
  return { text: b?.name ?? o.title, emoji: b?.priorityTier ? undefined : '•', sub: [b?.priorityTier ? `Tier ${b.priorityTier}` : undefined, b?.category, sub].filter(Boolean).join(' · ') || undefined }
}

function questions(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (WHO_TODAY.test(n)) {
    const list = approachToday(db, now.date)
    const why = (o: UgcOpportunity) => {
      const b = brandOf(db, o)
      return b ? `${LEVEL_LABEL[potential(db, b, now.date).level]}: ${potential(db, b, now.date).reasons[0]}` : undefined
    }
    const due = followUpsDue(db, now.date, now.date)
    const answer = toAnswer(db)
    const w = weekNumbers(db, now.date)
    if (!db.brands.length) return { area: AREA, text: 'Sua lista de marcas ainda está vazia.', sub: 'Me diga “adiciona Galápagos na prospecção” ou abra o UGC Business.', link: { label: 'Abrir UGC Business', to: ROUTES.ugc } }
    const sections = [
      ...(answer.length ? [{ title: 'Responder primeiro', lines: answer.map((o) => line(db, o, o.lastContactAt ? `respondeu ${formatDayMonth(o.lastContactAt)}` : undefined)) }] : []),
      ...(list.length ? [{ title: 'Abordar hoje', lines: list.map((o) => line(db, o, [o.primaryChannel ? CHANNEL_LABEL[o.primaryChannel] : undefined, why(o)].filter(Boolean).join(' · '))) }] : []),
      ...(due.length ? [{ title: 'Follow-ups', lines: due.map((o) => line(db, o, `follow-up ${(o.followUpStep ?? 0) + 1}`)) }] : []),
    ]
    const left = prospects(db, now.date).length
    return {
      area: AREA,
      text: list.length ? `Hoje: ${list.map((o) => brandOf(db, o)?.name).join(', ')}.` : left ? 'A cota de abordagens de hoje já foi ✓' : 'Ninguém novo na fila pra abordar.',
      sub: [`${w.newApproaches}/${w.target} na semana`, list.length ? 'Ordem: seu tier primeiro, depois o potencial (com os motivos).' : left ? undefined : 'Adicione marcas pra ter quem abordar.'].filter(Boolean).join(' · '),
      sections,
      provenance: 'fact',
      link: { label: 'Abrir UGC Business', to: ROUTES.ugc },
    }
  }
  if (WHO_WAITING.test(n)) {
    const due = followUpsDue(db, now.date, now.date)
    const soon: UgcOpportunity[] = []
    for (let i = 1; i <= 7; i++) soon.push(...followUpsDue(db, addDays(now.date, i), now.date))
    if (!due.length && !soon.length) return { area: AREA, text: 'Ninguém esperando follow-up agora ✓', provenance: 'fact' }
    return {
      area: AREA,
      text: due.length ? `${due.length === 1 ? '1 follow-up' : `${due.length} follow-ups`} pra hoje.` : 'Nenhum pra hoje.',
      sections: [
        ...(due.length ? [{ title: 'Hoje', lines: due.map((o) => line(db, o, `${o.nextFollowUpAt! < now.date ? 'era pra ' + formatDayMonth(o.nextFollowUpAt!) : 'hoje'} · ${CHANNEL_LABEL[o.primaryChannel ?? 'dm']}`)) }] : []),
        ...(soon.length ? [{ title: 'Próximos 7 dias', lines: soon.map((o) => line(db, o, formatDayMonth(o.nextFollowUpAt!))) }] : []),
      ],
      provenance: 'fact',
    }
  }
  if (POTENTIAL.test(n)) {
    const live = db.brands.filter((b) => !b.archived && db.ugcOpportunities.some((o) => o.brandId === b.id && isLive(db, o)))
    if (!live.length) return { area: AREA, text: 'Ainda não tem marcas ativas na sua lista.' }
    const scored = live.map((b) => ({ b, p: potential(db, b, now.date) }))
    const tier = (b: Brand) => (b.priorityTier ? TIERS.indexOf(b.priorityTier) : 9)
    const ranked = scored.sort((x, y) => tier(x.b) - tier(y.b) || y.p.points - x.p.points)
    const top = ranked.filter((x) => x.p.level === 'alto')
    const known = outcomes(db).length
    return {
      area: AREA,
      text: top.length ? `Maior potencial agora: ${top.slice(0, 3).map((x) => x.b.name).join(', ')}.` : `Nenhuma com potencial alto ainda — a melhor agora é ${ranked[0].b.name}.`,
      sub: known >= MIN_OUTCOMES ? `Com ${known} contatos com resultado, já uso números reais nos motivos.` : `Sem porcentagem: com ${known} contatos com resultado ainda é cedo (preciso de ${MIN_OUTCOMES}+). Os motivos vêm do que você anotou.`,
      lines: ranked.slice(0, 8).map(({ b, p }) => ({ text: b.name, sub: [LEVEL_LABEL[p.level], ...p.reasons.slice(0, 2), ...p.against.slice(0, 1).map((a) => `− ${a}`)].join(' · ') })),
      provenance: 'fact',
      link: { label: 'Abrir marcas', to: `${ROUTES.ugc}?aba=marcas` },
    }
  }
  return undefined
}

// ─── "gera uma DM pra Galápagos" — strategy first, then a draft she reviews (never sent) ──

const WRITE = /^(?:gera|gere|escreve|escreva|faz|faca|cria|crie|monta|monte)\s+(?:uma?\s+)?(dm|direct|mensagem|abordagem|e-?mail|email|pitch|texto|linkedin|whats(?:app)?|formulario)\s+(?:no\s+\w+\s+)?(?:pra|para|pro|da|do)\s+(?:a\s+|o\s+)?(.+)$/

function write(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  const m = WRITE.exec(n)
  if (!m) return undefined
  const brand = brandFrom(db, m[2], input)
  if (!brand)
    return {
      area: AREA,
      text: `Não achei ${m[2]} na sua lista de marcas.`,
      sub: 'Adiciono primeiro — aí eu monto a estratégia e o rascunho.',
      options: [{ label: 'Adicionar na lista', ask: `adiciona ${m[2]} na minha lista de prospecção` }],
    }
  const ref = { type: 'brand', id: brand.id }
  const channel = channelIn(m[1]) ?? currentOpportunity(db, brand.id)?.primaryChannel ?? 'dm'
  const s = buildStrategy(db, brand.id, channel, now.date, currentOpportunity(db, brand.id))
  if (!s) return undefined
  if (s.missing.includes('relação'))
    return {
      area: AREA,
      text: `Antes de escrever: você já usou ${brand.name}?`,
      sub: 'Assim a mensagem nunca diz algo que não aconteceu.',
      ref,
      options: [
        { label: 'Já usei', ask: `já usei ${brand.name}` },
        { label: 'Nunca usei', ask: `nunca usei ${brand.name}` },
      ],
    }
  const draft = composeDraft(s)
  const opp = currentOpportunity(db, brand.id)
  return {
    area: AREA,
    text: `Rascunho de ${CHANNEL_LABEL[channel]} pra ${brand.name} — nada foi enviado.`,
    sub: [...s.warnings, 'Revise, copie e mande você mesma. Na ficha dá pra pedir outra versão.'].join(' '),
    sections: [
      {
        title: 'Estratégia',
        lines: [
          { text: `Falar de: ${s.talk.join(' + ') || '—'}` },
          { text: `Evitar: ${s.avoid.slice(0, 4).join(', ') || '—'}` },
          { text: `Ângulo: ${s.angle}` },
          { text: `Fato: ${s.fact ? describeFact(s.fact) : 'nenhum — não elogio nada específico'}` },
          { text: `Relação: ${s.relationship.say}` },
        ],
      },
      { title: 'Mensagem', lines: [{ text: draft.subject ? `Assunto: ${draft.subject}\n\n${draft.text}` : draft.text }] },
    ],
    ref,
    action: { mode: 'direct', run: () => logged(now, `UGC: rascunho pra ${brand.name}`, () => saveDraft(s, draft.text, opp?.id, draft.subject).undo, { type: 'brand', id: brand.id }) },
    link: { label: 'Abrir na ficha', to: ROUTES.ugcBrand(brand.id) },
  }
}

export const ugcHandler: Handler = {
  id: 'ugc',
  run(input) {
    const n = normalize(input.text).replace(/[.!?…]+$/g, '').trim()
    const i = { ...input, n }
    return add(i) ?? questions(i) ?? write(i) ?? followUp(i) ?? sent(i) ?? replied(i) ?? relationship(i) ?? noSense(i) ?? closed(i) ?? paid(i)
  },
}
