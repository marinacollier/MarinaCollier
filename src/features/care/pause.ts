/**
 * Modo Pausa — mensagens para ganhar tempo, a partir de modelos (determinístico, sem IA).
 * contexto × intenção × tom → texto. O canal muda a formalidade e o tamanho: Instagram é o mais curto,
 * WhatsApp ganha um "Oi" nos tons próximos, e-mail ganha saudação e despedida.
 *
 * O app NUNCA envia nada: só copia ou abre o app de destino com o texto pronto. Ela é quem envia.
 */
import type { PauseContext, PauseIntent, PauseTone } from '@/data/types'

export const PAUSE_CONTEXTS: { value: PauseContext; label: string }[] = [
  { value: 'pessoal', label: 'Pessoal' },
  { value: 'relacionamento', label: 'Relacionamento' },
  { value: 'amizade', label: 'Amizade' },
  { value: 'familia', label: 'Família' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'email', label: 'E-mail' },
]

export const PAUSE_INTENTS: { value: PauseIntent; label: string }[] = [
  { value: 'tempo', label: 'Tempo para pensar' },
  { value: 'nao_consigo_agora', label: 'Não consigo agora' },
  { value: 'retomar_amanha', label: 'Retomar amanhã' },
  { value: 'falar_com_calma', label: 'Falar com calma' },
  { value: 'limite', label: 'Colocar um limite' },
  { value: 'nao_decidir_agora', label: 'Não decidir agora' },
  { value: 'pedir_apoio', label: 'Pedir apoio' },
]

export const PAUSE_TONES: { value: PauseTone; label: string }[] = [
  { value: 'delicado', label: 'Delicado' },
  { value: 'neutro', label: 'Neutro' },
  { value: 'objetivo', label: 'Objetivo' },
  { value: 'profissional', label: 'Profissional' },
]

const BODY: Record<PauseIntent, Record<PauseTone, string>> = {
  tempo: {
    delicado: 'Recebi sua mensagem e quero te responder com cuidado. Preciso de um tempinho para pensar antes.',
    neutro: 'Recebi sua mensagem. Vou pensar com calma e te respondo depois.',
    objetivo: 'Preciso de um tempo para pensar. Te respondo depois.',
    profissional: 'Recebi sua mensagem. Preciso de um tempo para avaliar com atenção e retorno em seguida.',
  },
  nao_consigo_agora: {
    delicado: 'Agora não estou conseguindo conversar do jeito que esse assunto merece. Podemos falar um pouco mais tarde?',
    neutro: 'Agora não consigo conversar sobre isso. Falamos mais tarde?',
    objetivo: 'Agora não consigo. Falo com você mais tarde.',
    profissional: 'No momento não consigo tratar deste assunto. Retorno assim que possível.',
  },
  retomar_amanha: {
    delicado: 'Quero conversar sobre isso com calma, e acho que hoje não é o melhor momento. Podemos retomar amanhã?',
    neutro: 'Podemos retomar esse assunto amanhã?',
    objetivo: 'Vamos retomar amanhã.',
    profissional: 'Proponho retomarmos este assunto amanhã. Fica bom para você?',
  },
  falar_com_calma: {
    delicado: 'Esse assunto é importante para mim e quero conversar com calma, sem pressa. Podemos combinar um momento melhor?',
    neutro: 'Prefiro conversar sobre isso com calma. Podemos combinar um horário?',
    objetivo: 'Quero falar disso com calma. Qual horário fica bom?',
    profissional: 'Gostaria de tratar este ponto com mais tempo. Podemos agendar uma conversa?',
  },
  limite: {
    delicado: 'Entendo o seu lado e, ao mesmo tempo, preciso dizer que isso não funciona para mim. Obrigada por respeitar.',
    neutro: 'Isso não funciona para mim. Obrigada por entender.',
    objetivo: 'Não vou conseguir. Obrigada por entender.',
    profissional: 'Neste caso, não consigo atender a esse pedido. Agradeço a compreensão.',
  },
  nao_decidir_agora: {
    delicado: 'Não quero decidir isso no impulso. Vou pensar com cuidado e te falo quando tiver clareza.',
    neutro: 'Ainda não vou decidir. Vou pensar e te aviso.',
    objetivo: 'Não vou decidir agora. Te aviso depois.',
    profissional: 'Prefiro não tomar essa decisão agora. Retorno com uma posição assim que avaliar.',
  },
  pedir_apoio: {
    delicado: 'Estou passando por um momento difícil e queria a sua companhia. Você tem um tempinho para conversar comigo?',
    neutro: 'Estou num dia difícil. Você consegue conversar um pouco comigo?',
    objetivo: 'Preciso de apoio hoje. Pode falar comigo?',
    profissional: 'Estou lidando com uma questão pessoal hoje e precisaria de um pouco de flexibilidade. Podemos conversar?',
  },
}

/** Uma linha de carinho, só no tom delicado e só em relações próximas. */
const WARMTH: Partial<Record<PauseContext, string>> = {
  relacionamento: 'Gosto de você e quero que a gente converse bem.',
  amizade: 'Nossa amizade é importante para mim.',
  familia: 'Me importo muito com você.',
}

const CLOSE_TONES: PauseTone[] = ['delicado', 'neutro']

export interface PauseInput {
  context: PauseContext
  intent: PauseIntent
  tone: PauseTone
  /** Assinatura do e-mail (o nome dela no perfil). */
  name?: string
}

export function pauseMessage({ context, intent, tone, name }: PauseInput): string {
  const body = BODY[intent][tone]
  if (context === 'instagram') return body
  if (context === 'whatsapp') return CLOSE_TONES.includes(tone) ? `Oi! ${body}` : body
  if (context === 'email') {
    const formal = tone === 'profissional' || tone === 'objetivo'
    const greeting = formal ? 'Olá, tudo bem?' : 'Oi, tudo bem?'
    const thanks = intent === 'limite' || intent === 'pedir_apoio' ? '' : '\n\nObrigada pela compreensão.'
    const signOff = formal ? 'Atenciosamente,' : 'Um abraço,'
    return `${greeting}\n\n${body}${thanks}\n\n${signOff}${name?.trim() ? `\n${name.trim()}` : ''}`
  }
  const warmth = tone === 'delicado' ? WARMTH[context] : undefined
  return warmth ? `${body} ${warmth}` : body
}

// ─── Abrir o app de destino (ela envia) ────────────────────────────────────

export type OpenTarget = { kind: 'whatsapp' | 'email' | 'instagram'; label: string; url: string; copyFirst: boolean }

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
export const mailtoUrl = (text: string) => `mailto:?body=${encodeURIComponent(text)}`
export const INSTAGRAM_INBOX = 'https://instagram.com/direct/inbox/'

/** Destinos possíveis. Instagram não aceita texto pronto: copia e abre a caixa de mensagens. */
export function openTargets(text: string): OpenTarget[] {
  return [
    { kind: 'whatsapp', label: 'Abrir no WhatsApp', url: whatsappUrl(text), copyFirst: false },
    { kind: 'email', label: 'Abrir no e-mail', url: mailtoUrl(text), copyFirst: false },
    { kind: 'instagram', label: 'Copiar e abrir o Instagram', url: INSTAGRAM_INBOX, copyFirst: true },
  ]
}

// ─── Entender um pedido em texto livre (Lumos) ─────────────────────────────

/** "uma mensagem para o meu chefe dizendo que preciso de tempo" → intenção e contexto, quando dá. */
export function parsePauseRequest(n: string): { intent?: PauseIntent; context?: PauseContext } {
  let intent: PauseIntent | undefined
  if (/\bamanha\b/.test(n)) intent = 'retomar_amanha'
  else if (/\b(nao|sem)\s+decidir\b|\bdecis/.test(n)) intent = 'nao_decidir_agora'
  else if (/\blimite\b|\bdizer nao\b|\bnegar\b|\brecusar\b/.test(n)) intent = 'limite'
  else if (/\bapoio\b|\bajuda\b|\bcompanhia\b/.test(n)) intent = 'pedir_apoio'
  else if (/\bcalma\b|\bconversar direito\b/.test(n)) intent = 'falar_com_calma'
  else if (/\bnao consigo\b|\bagora nao\b|\bnao posso\b/.test(n)) intent = 'nao_consigo_agora'
  else if (/\btempo\b|\bpensar\b/.test(n)) intent = 'tempo'

  let context: PauseContext | undefined
  if (/\be-?mail\b/.test(n)) context = 'email'
  else if (/\b(whats(app)?|zap)\b/.test(n)) context = 'whatsapp'
  else if (/\b(insta(gram)?|direct|dm)\b/.test(n)) context = 'instagram'
  else if (/\b(chefe|gestor|gestora|trabalho|cliente|colega|lider|rh)\b/.test(n)) context = 'profissional'
  else if (/\b(namorad[oa]|marido|esposa|parceir[oa]|crush|ex)\b/.test(n)) context = 'relacionamento'
  else if (/\bamig[oa]s?\b/.test(n)) context = 'amizade'
  else if (/\b(mae|pai|irma|irmao|familia|tia|tio|avo|prima|primo)\b/.test(n)) context = 'familia'
  return { intent, context }
}

/** Link para o Modo Pausa já com o que deu para entender. */
export function pauseLink(pre: { intent?: PauseIntent; context?: PauseContext }): string {
  const q = new URLSearchParams({ v: 'pausa' })
  if (pre.intent) q.set('intencao', pre.intent)
  if (pre.context) q.set('contexto', pre.context)
  return `/cuidar?${q.toString()}`
}
