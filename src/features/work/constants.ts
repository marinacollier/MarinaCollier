import type { Priority, ProjectStatus, Tone, WinKind, WorkInboxItem, WorkInboxKind } from '@/data/types'

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  ativo: { label: 'ativo', cls: 'bg-sage-soft text-sage' },
  planejando: { label: 'planejando', cls: 'bg-ocean-soft text-ocean' },
  pausado: { label: 'pausado', cls: 'bg-surface-2 text-muted' },
  concluido: { label: 'concluído', cls: 'bg-sand-soft text-sand' },
}

export const PROJECT_STATUS_OPTIONS = (Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((s) => ({
  value: s,
  label: PROJECT_STATUS[s].label,
}))

export const PRIORITY: Record<Priority, { label: string; dot: string }> = {
  alta: { label: 'prioridade alta', dot: 'bg-accent' },
  media: { label: 'prioridade média', dot: 'bg-sand' },
  baixa: { label: 'prioridade baixa', dot: 'bg-sage' },
}

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
]

export const TONE_OPTIONS: Tone[] = ['accent', 'sage', 'ocean', 'sand', 'plum', 'ink']

export const WIN_KINDS: { value: WinKind; label: string; emoji: string }[] = [
  { value: 'entrega', label: 'entrega', emoji: '📦' },
  { value: 'contrato', label: 'contrato', emoji: '🤝' },
  { value: 'reconhecimento', label: 'reconhecimento', emoji: '🌟' },
  { value: 'projeto', label: 'projeto', emoji: '🚀' },
  { value: 'feedback', label: 'feedback', emoji: '💬' },
  { value: 'resultado', label: 'resultado', emoji: '📈' },
  { value: 'certificacao', label: 'certificação', emoji: '🎓' },
  { value: 'conquista', label: 'conquista', emoji: '🏆' },
]

export function winKind(k: WinKind) {
  return WIN_KINDS.find((w) => w.value === k) ?? WIN_KINDS[WIN_KINDS.length - 1]
}

export const INBOX_KINDS: { value: WorkInboxKind; label: string }[] = [
  { value: 'responder', label: 'responder' },
  { value: 'pedido', label: 'pedido' },
  { value: 'aprovacao', label: 'aprovação' },
  { value: 'deadline', label: 'deadline' },
  { value: 'documento', label: 'documento' },
  { value: 'compromisso', label: 'compromisso' },
  { value: 'follow_up', label: 'follow-up' },
  { value: 'mencao', label: 'menção' },
  { value: 'decisao', label: 'decisão' },
  { value: 'action_item', label: 'action item' },
]

export function inboxKindLabel(k: WorkInboxKind): string {
  return INBOX_KINDS.find((i) => i.value === k)?.label ?? k
}

export const INBOX_SOURCES: Record<WorkInboxItem['source'], { label: string; cls: string }> = {
  outlook: { label: 'Outlook', cls: 'bg-ocean-soft text-ocean' },
  teams: { label: 'Teams', cls: 'bg-plum-soft text-plum' },
  nota: { label: 'Nota', cls: 'bg-sand-soft text-sand' },
  projeto: { label: 'Projeto', cls: 'bg-sage-soft text-sage' },
  manual: { label: 'Manual', cls: 'bg-surface-2 text-ink-2' },
}

export const INBOX_SOURCE_OPTIONS = (Object.keys(INBOX_SOURCES) as WorkInboxItem['source'][]).map((s) => ({
  value: s,
  label: INBOX_SOURCES[s].label,
}))

export const PRIVACY_NOTE = 'Guardamos só assunto, remetente e data — nunca o e-mail inteiro.'
export const CALM_EMPTY = 'Nada pedindo sua atenção aqui. Gostoso, né?'
