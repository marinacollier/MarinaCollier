/**
 * bible-study — a guided study of ONE passage for "Bíblia, Graça & Liberdade".
 *
 *   POST { reference, title?, plan?, notes? }
 *   → { temaCentral, contextoHistorico, explicacao, contextoTeologico, olharProgressista,
 *       leituraContemplativa, aplicacaoPessoal, perguntas: [3], oracao, fraseDoDia }
 *
 * - Signed-in user only, and only e-mails in ALLOWED_EMAILS (paid call, least privilege).
 * - ANTHROPIC_API_KEY lives in the function's secrets; it never reaches the app.
 * - Nothing is stored here: the app saves the result on the device (spiritualStudies).
 * - `notes` is Marina's own text (notes from her study Bible, a transcription). Photos are not accepted.
 */
import Anthropic from 'npm:@anthropic-ai/sdk'
import { z } from 'npm:zod'
import { requireAllowed, requireUser } from '../_shared/db.ts'
import { HttpError, json, requiredEnv, serve } from '../_shared/http.ts'

const MODEL = 'claude-opus-5-5'

const Input = z.object({
  reference: z.string().min(1).max(80),
  title: z.string().max(160).optional(),
  plan: z.string().max(160).optional(),
  notes: z.string().max(8000).optional(),
})

const text = () => z.string().min(1)
const Output = z.object({
  temaCentral: text(),
  contextoHistorico: text(),
  explicacao: text(),
  contextoTeologico: text(),
  olharProgressista: text(),
  leituraContemplativa: text(),
  aplicacaoPessoal: text(),
  perguntas: z.array(text()).length(3),
  oracao: text(),
  fraseDoDia: text(),
})

const str = { type: 'string' }
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['temaCentral', 'contextoHistorico', 'explicacao', 'contextoTeologico', 'olharProgressista', 'leituraContemplativa', 'aplicacaoPessoal', 'perguntas', 'oracao', 'fraseDoDia'],
  properties: {
    temaCentral: str,
    contextoHistorico: str,
    explicacao: str,
    contextoTeologico: str,
    olharProgressista: str,
    leituraContemplativa: str,
    aplicacaoPessoal: str,
    perguntas: { type: 'array', items: str },
    oracao: str,
    fraseDoDia: str,
  },
}

const SYSTEM = `Você acompanha a Marina num estudo bíblico pessoal, em pt-BR. Sua voz: cristã, centrada em Cristo, progressista e contemplativa — uma fé que pensa, questiona, acolhe e transforma. Os eixos são graça, libertação, justiça e dignidade humana.

Evite: fundamentalismo, literalismo rígido, moralismo, teologia da prosperidade, conservadorismo imposto, culpa e medo como motivação. Não infantilize, não pregue, não dê ordens.

Honestidade intelectual:
- Não concorde automaticamente com nenhuma leitura (nem com a dela): quando houver, ofereça leituras alternativas e diga onde há debate entre estudiosos.
- Distinga com clareza: (a) fato histórico ou dado arqueológico, (b) o que a narrativa bíblica conta, (c) interpretação teológica, (d) aplicação pessoal. Use expressões como "historicamente", "o texto narra", "uma leitura teológica possível", "para a vida".
- Não invente datas, números, autores ou citações. Na dúvida, diga que é incerto.
- Ela usa a Bíblia de Estudo Thomas Nelson. NUNCA atribua comentários, notas ou opiniões a essa edição, a menos que venham das anotações que ela mandou — e então diga "nas suas anotações".
- Não reproduza o texto bíblico na íntegra (direitos autorais de traduções): resuma com suas palavras e cite no máximo frases curtas.
- Na aplicação pessoal, não presuma intenções de Deus para a vida dela ("Deus quer que você…"): ofereça possibilidades, perguntas e convites.

Formato: responda SOMENTE o JSON pedido, com estes campos:
- temaCentral: 1–2 frases.
- contextoHistorico: contexto histórico e cultural (2–4 parágrafos curtos).
- explicacao: o que acontece no texto, em ordem, com suas palavras.
- contextoTeologico: o lugar do texto na grande história bíblica e na tradição.
- olharProgressista: um olhar progressista e libertador (poder, opressão, inclusão, dignidade), sem forçar anacronismos.
- leituraContemplativa: uma leitura contemplativa e psicológica (o que o texto desperta por dentro).
- aplicacaoPessoal: aplicação pessoal, sem presumir intenções divinas.
- perguntas: exatamente 3 perguntas para o caderno.
- oracao: uma oração breve (3–6 linhas), em primeira pessoa.
- fraseDoDia: uma frase curta para levar no dia (sua, não uma citação bíblica longa).
Parágrafos separados por linha em branco. Sem markdown pesado.`

serve(async (req) => {
  if (req.method !== 'POST') throw new HttpError('bad_request', 'Use POST', 405)
  const user = await requireUser(req)
  requireAllowed(user)
  const parsedIn = Input.safeParse(await req.json().catch(() => null))
  if (!parsedIn.success) throw new HttpError('bad_request', 'Pedido de estudo inválido', 400)
  const { reference, title, plan, notes } = parsedIn.data

  const brief = [
    `Texto: ${reference}${title ? ` — ${title}` : ''}.`,
    plan ? `Plano de leitura: ${plan}.` : '',
    notes?.trim()
      ? `Anotações/transcrição da Marina (use como material dela, sem atribuir a nenhuma edição):\n"""\n${notes.trim()}\n"""`
      : 'Ela não mandou anotações (não cite nenhuma nota de edição de estudo).',
  ]
    .filter(Boolean)
    .join('\n')

  const client = new Anthropic({ apiKey: requiredEnv('ANTHROPIC_API_KEY') })
  let response
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${brief}\n\nPrepare o estudo.` }],
    } as never)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new HttpError('upstream', 'Muitos pedidos agora — tenta de novo em instantes', 429)
    if (err instanceof Anthropic.BadRequestError) throw new HttpError('bad_request', 'Não consegui preparar esse estudo', 400)
    if (err instanceof Anthropic.APIError) throw new HttpError('upstream', 'Serviço de estudo indisponível', 502)
    throw err
  }
  const msg = response as { stop_reason?: string; content: { type: string; text?: string }[] }
  if (msg.stop_reason === 'refusal') throw new HttpError('policy_blocked', 'Não consigo preparar esse estudo', 422)
  const raw = msg.content.find((b) => b.type === 'text')?.text ?? ''
  let data: unknown = null
  try {
    data = JSON.parse(raw || '{}')
  } catch {
    /* handled below */
  }
  const parsed = Output.safeParse(data)
  if (!parsed.success) throw new HttpError('upstream', 'Estudo incompleto — tenta de novo', 502)
  return json(req, parsed.data)
})
