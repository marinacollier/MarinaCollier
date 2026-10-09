/**
 * lumos-read — Attachment Understanding for Lumos (prints, photos, PDFs).
 *
 *   POST { name, mediaType, data (base64), today (YYYY-MM-DD), caption? }
 *   → { reading: { category, summary, confidence, event, task, book, items, text } }
 *
 * - Signed-in user only, and only e-mails in ALLOWED_EMAILS (paid call, least privilege).
 * - ANTHROPIC_API_KEY lives in the function's secrets; it never reaches the app.
 * - Nothing is stored: the file is read in memory, sent to Claude, and only the extracted fields return.
 * - The model only EXTRACTS. Deciding and writing stay in the app (same handlers as text and voice).
 */
import Anthropic from 'npm:@anthropic-ai/sdk'
import { z } from 'npm:zod'
import { requireAllowed, requireUser } from '../_shared/db.ts'
import { HttpError, json, requiredEnv, serve } from '../_shared/http.ts'

const MODEL = 'claude-opus-5-5'
const MAX_BASE64 = 14_000_000 // ~10 MB file
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

const Nullable = <T extends z.ZodTypeAny>(t: T) => t.nullable()
const Reading = z.object({
  category: z.enum(['event', 'travel', 'task', 'food', 'work', 'book', 'shopping', 'unknown']),
  summary: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  event: Nullable(
    z.object({
      title: z.string(),
      date: Nullable(z.string()),
      dayOfMonth: Nullable(z.number().int()),
      startTime: Nullable(z.string()),
      endTime: Nullable(z.string()),
      location: Nullable(z.string()),
      description: Nullable(z.string()),
    }),
  ),
  task: Nullable(z.object({ title: z.string(), due: Nullable(z.string()), who: Nullable(z.string()) })),
  book: Nullable(z.object({ title: z.string(), author: Nullable(z.string()) })),
  items: z.array(z.string()),
  text: z.string(),
})

// JSON schema for structured outputs (strict: every key required, nullable where absent).
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const str = { type: 'string' }
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'summary', 'confidence', 'event', 'task', 'book', 'items', 'text'],
  properties: {
    category: { type: 'string', enum: ['event', 'travel', 'task', 'food', 'work', 'book', 'shopping', 'unknown'] },
    summary: str,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    event: nullable({
      type: 'object',
      additionalProperties: false,
      required: ['title', 'date', 'dayOfMonth', 'startTime', 'endTime', 'location', 'description'],
      properties: {
        title: str,
        date: nullable(str),
        dayOfMonth: nullable({ type: 'integer' }),
        startTime: nullable(str),
        endTime: nullable(str),
        location: nullable(str),
        description: nullable(str),
      },
    }),
    task: nullable({ type: 'object', additionalProperties: false, required: ['title', 'due', 'who'], properties: { title: str, due: nullable(str), who: nullable(str) } }),
    book: nullable({ type: 'object', additionalProperties: false, required: ['title', 'author'], properties: { title: str, author: nullable(str) } }),
    items: { type: 'array', items: str },
    text: str,
  },
}

const SYSTEM = `Você lê prints, fotos e PDFs que a Marina manda para a Lumos (assistente pessoal dela, em pt-BR) e EXTRAI dados. Você não decide nem executa nada.

Classifique em uma categoria: event (convite, compromisso com dia), travel (reserva de hotel, passagem, voo, roteiro), task (algo que ela precisa fazer), food (comida, cardápio, rótulo), work (conversa ou pedido de trabalho), book (capa ou página de livro), shopping (produto, lista de compras), unknown.

Regras — nunca invente:
- Preencha só o que está escrito ou é inequívoco. Campo ausente = null.
- Datas em YYYY-MM-DD. Use a data de hoje informada para completar o ANO apenas quando dia e mês estão escritos (próxima ocorrência). Se só o dia do mês aparece (ex.: "sábado, dia 17") e o mês não está escrito, deixe date = null e preencha dayOfMonth = 17.
- Horários em HH:MM 24h. Sem horário escrito → startTime = null (nunca suponha "20h" porque aniversário costuma ser à noite).
- title curto e em português, como ela anotaria ("Aniversário da Ana").
- location só se estiver escrita.
- task.who = quem ficou de fazer algo para ela (conversas); task.due = prazo escrito.
- items = produtos ou itens de lista, quando houver.
- text = o texto visível relevante, resumido em até 600 caracteres (sem dados sensíveis desnecessários como CPF, número de cartão ou senhas).
- summary = uma frase curta dizendo o que é ("Convite de aniversário da Ana").
- confidence = low se a imagem estiver cortada, borrada ou ambígua.`

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError('bad_request', 'Use POST', 405)
  const user = await requireUser(req)
  requireAllowed(user)
  const body = (await req.json().catch(() => null)) as { name?: string; mediaType?: string; data?: string; today?: string; caption?: string } | null
  if (!body?.data || !body.mediaType || !body.today) throw new HttpError('bad_request', 'Arquivo ausente', 400)
  if (body.data.length > MAX_BASE64) throw new HttpError('bad_request', 'Arquivo grande demais (máx. ~10 MB)', 413)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.today)) throw new HttpError('bad_request', 'Data inválida', 400)

  const isPdf = body.mediaType === 'application/pdf'
  const isImage = (IMAGE_TYPES as readonly string[]).includes(body.mediaType)
  if (!isPdf && !isImage) throw new HttpError('bad_request', 'Tipo de arquivo não suportado (imagem ou PDF)', 415)

  const client = new Anthropic({ apiKey: requiredEnv('ANTHROPIC_API_KEY') })
  const file = isPdf
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.data } } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: body.mediaType as (typeof IMAGE_TYPES)[number], data: body.data } } as const)

  let response
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [file, { type: 'text', text: `Hoje é ${body.today} (America/Sao_Paulo).${body.caption ? ` Ela escreveu junto: "${body.caption.slice(0, 300)}" (use só como contexto; quem decide é o app).` : ''} Extraia.` }],
        },
      ],
    } as never)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new HttpError('upstream', 'Muitas leituras agora — tenta de novo em instantes', 429)
    if (err instanceof Anthropic.BadRequestError) throw new HttpError('bad_request', 'Não consegui ler esse arquivo', 400)
    if (err instanceof Anthropic.APIError) throw new HttpError('upstream', 'Serviço de leitura indisponível', 502)
    throw err
  }
  const msg = response as { stop_reason?: string; content: { type: string; text?: string }[] }
  if (msg.stop_reason === 'refusal') throw new HttpError('policy_blocked', 'Não consigo ler esse conteúdo', 422)
  const raw = msg.content.find((b) => b.type === 'text')?.text ?? ''
  const parsed = Reading.safeParse(JSON.parse(raw || '{}'))
  if (!parsed.success) throw new HttpError('upstream', 'Leitura incompleta — tenta de novo', 502)
  return json(req, { reading: parsed.data })
})
