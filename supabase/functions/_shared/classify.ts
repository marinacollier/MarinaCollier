/**
 * Heuristic Work Inbox classification from *metadata only* (subject + flags).
 * It is a suggestion: Marina decides what becomes a task. Pure, no Deno APIs.
 */
import type { WorkInboxKind } from './types.ts'

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const RULES: [WorkInboxKind, RegExp][] = [
  ['aprovacao', /\b(aprova\w*|approv\w*|sign.?off|de acordo|validar|validacao|homologa\w*)\b/],
  ['deadline', /\b(prazo|deadline|vence|vencimento|due|urgente|urgent|asap|ate (hoje|amanha|segunda|terca|quarta|quinta|sexta))\b/],
  ['decisao', /\b(decisao|decidir|decide|decision|definir|definicao|escolher)\b/],
  ['pedido', /\b(pedido|request|solicita\w*|preciso|precisamos|poderia|pode(m)? (me )?(enviar|mandar|ajudar|revisar|olhar)|could you|can you|please|por favor)\b/],
  ['documento', /\b(documento|contrato|anexo|planilha|apresentacao|deck|proposta|relatorio|report|nda|briefing)\b/],
  ['follow_up', /\b(follow.?up|lembrete|reminder|retomando|pendente|pendencia|cobranca|status)\b/],
  ['compromisso', /\b(convite|invitation|invite|reuniao|meeting|call|workshop|evento)\b/],
  ['responder', /(\?\s*$|\b(duvida|pergunta|question|feedback|retorno)\b)/],
]

export interface MessageMeta {
  subject: string
  flagged?: boolean
  importance?: 'low' | 'normal' | 'high'
}

/** Returns a kind when the message looks actionable, undefined otherwise. */
export function classifyMessage(m: MessageMeta): WorkInboxKind | undefined {
  const s = norm(m.subject.replace(/^((re|res|fw|fwd|enc|tr)\s*:\s*)+/i, ''))
  for (const [kind, re] of RULES) if (re.test(s)) return kind
  if (m.flagged || m.importance === 'high') return 'action_item'
  return undefined
}
