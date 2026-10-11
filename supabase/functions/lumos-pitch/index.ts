/**
 * lumos-pitch — writes ONE outreach message (UGC) from a strategy the app already decided.
 *
 *   POST { channel, strategy: { brand, talk, avoid, angle, fact, relationship, contact, spec, recentOpenings,
 *          recentClosings, creator }, feedback? }
 *   → { subject: string | null, message: string }
 *
 * - Signed-in user only, and only e-mails in ALLOWED_EMAILS (paid call, least privilege).
 * - ANTHROPIC_API_KEY lives in the function's secrets; it never reaches the app.
 * - Nothing is stored and nothing is SENT: the text goes back to the app, Marina reviews, copies and sends herself.
 * - The model only writes from what the app gives it. It must not invent brand facts or experiences;
 *   the app re-checks every text (clichés, invented experience, length, repeated opening/closing).
 */
import Anthropic from 'npm:@anthropic-ai/sdk'
import { z } from 'npm:zod'
import { requireAllowed, requireUser } from '../_shared/db.ts'
import { HttpError, json, requiredEnv, serve } from '../_shared/http.ts'

const MODEL = 'claude-opus-5-5'
const CHANNELS = ['dm', 'email', 'formulario', 'linkedin', 'whatsapp'] as const

const short = (max: number) => z.string().max(max)
const Input = z.object({
  channel: z.enum(CHANNELS),
  feedback: z.array(short(200)).max(10).optional(),
  strategy: z.object({
    brand: z.object({ name: short(120), category: short(120).optional(), products: z.array(short(120)).max(10).optional() }),
    talk: z.array(short(120)).max(3),
    avoid: z.array(short(120)).max(20),
    angle: short(300),
    fact: z.object({ text: short(400), source: short(200) }).nullable().optional(),
    relationship: short(200),
    contact: short(120).nullable().optional(),
    spec: z.object({ min: z.number().int(), max: z.number().int(), subject: z.boolean(), links: z.boolean(), tone: short(200) }),
    recentOpenings: z.array(short(200)).max(20),
    recentClosings: z.array(short(300)).max(20),
    creator: z.object({ name: short(80), instagram: short(120).nullable().optional(), portfolio: short(200).nullable().optional() }),
  }),
})

const Output = z.object({ subject: z.string().nullable(), message: z.string().min(1) })
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'message'],
  properties: { subject: { anyOf: [{ type: 'string' }, { type: 'null' }] }, message: { type: 'string' } },
}

const SYSTEM = `Você escreve UMA mensagem de prospecção UGC em pt-BR para a Marina Collier mandar ela mesma (ela revisa e envia; você nunca envia nada).

A estratégia já foi decidida pelo app. Escreva A PARTIR dela, como a Marina falaria: humana, específica, curta, sem cara de agência nem de robô.

Verdade — nunca invente:
- Use só os contextos em "falar de" (no máximo 2). Não liste tudo o que ela faz.
- Não mencione nada de "evitar".
- Fato da marca: use SOMENTE o fato informado, sem enfeitar. Sem fato → não elogie nada específico da marca (nada de "amei a nova coleção").
- Relação com a marca: diga exatamente o que está em "relação". Se ela nunca usou, pode dizer "conheci recentemente" ou "tenho acompanhado"; NUNCA "uso há meses", "sempre fui fã", "já faz parte da minha rotina", "sou cliente" — a menos que a relação diga isso.
- Nada de números, resultados, prazos ou preços que não estejam na estratégia.

Tom:
- Proibido: "seria uma honra", "sou apaixonada pela missão de vocês", "acredito que juntos podemos criar algo incrível", "sinergia", "parceria de sucesso", "espero que esteja tudo bem", "venho por meio desta", "agregar valor".
- No máximo 1 emoji (de preferência nenhum).
- Não comece com nenhuma das aberturas recentes nem termine com nenhum dos fechamentos recentes listados — varie estrutura e palavras.
- Termine com uma pergunta ou próximo passo simples.

Canal:
- dm: 30–80 palavras, sem links, primeira mensagem sem cara de proposta formal.
- email: 80–170 palavras, com assunto (subject), portfólio e Instagram no fim, assinatura "Marina Collier".
- formulario: 40–130 palavras, direto, sem saudação longa, com portfólio e Instagram.
- linkedin: 35–100 palavras, profissional e enxuto, sem links.
- whatsapp: 20–70 palavras, conversacional.
subject = null em todo canal que não seja email.`

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError('bad_request', 'Use POST', 405)
  const user = await requireUser(req)
  requireAllowed(user)
  const parsedIn = Input.safeParse(await req.json().catch(() => null))
  if (!parsedIn.success) throw new HttpError('bad_request', 'Estratégia inválida', 400)
  const { channel, strategy: s, feedback } = parsedIn.data

  const brief = [
    `Canal: ${channel} (${s.spec.min}–${s.spec.max} palavras; ${s.spec.tone}).`,
    `Marca: ${s.brand.name}${s.brand.category ? ` — ${s.brand.category}` : ''}${s.brand.products?.length ? ` (produtos: ${s.brand.products.join(', ')})` : ''}.`,
    s.contact ? `Contato: ${s.contact}.` : 'Contato: desconhecido (não invente um nome).',
    `Falar de: ${s.talk.length ? s.talk.join(' + ') : 'rotina real dela, sem detalhar'}.`,
    `Evitar: ${s.avoid.join(', ') || '—'}.`,
    `Ângulo da proposta: ${s.angle}.`,
    s.fact ? `Fato verdadeiro da marca: "${s.fact.text}" (fonte: ${s.fact.source}).` : 'Fato da marca: NENHUM — não elogie nada específico.',
    `Relação: ${s.relationship}.`,
    `Creator: ${s.creator.name}${s.creator.instagram ? ` · Instagram ${s.creator.instagram}` : ''}${s.creator.portfolio ? ` · portfólio ${s.creator.portfolio}` : ''}.`,
    s.recentOpenings.length ? `Aberturas recentes (não repetir): ${s.recentOpenings.map((o) => `"${o}"`).join('; ')}.` : '',
    s.recentClosings.length ? `Fechamentos recentes (não repetir): ${s.recentClosings.map((o) => `"${o}"`).join('; ')}.` : '',
    feedback?.length ? `A versão anterior foi recusada pela checagem: ${feedback.join('; ')}. Corrija isso.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const client = new Anthropic({ apiKey: requiredEnv('ANTHROPIC_API_KEY') })
  let response
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${brief}\n\nEscreva a mensagem.` }],
    } as never)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new HttpError('upstream', 'Muitos pedidos agora — tenta de novo em instantes', 429)
    if (err instanceof Anthropic.BadRequestError) throw new HttpError('bad_request', 'Não consegui escrever com essa estratégia', 400)
    if (err instanceof Anthropic.APIError) throw new HttpError('upstream', 'Serviço de escrita indisponível', 502)
    throw err
  }
  const msg = response as { stop_reason?: string; content: { type: string; text?: string }[] }
  if (msg.stop_reason === 'refusal') throw new HttpError('policy_blocked', 'Não consigo escrever essa mensagem', 422)
  const raw = msg.content.find((b) => b.type === 'text')?.text ?? ''
  let data: unknown = null
  try {
    data = JSON.parse(raw || '{}')
  } catch {
    /* handled below */
  }
  const parsed = Output.safeParse(data)
  if (!parsed.success) throw new HttpError('upstream', 'Texto incompleto — tenta de novo', 502)
  return json(req, { subject: channel === 'email' ? parsed.data.subject : null, message: parsed.data.message.trim() })
})
