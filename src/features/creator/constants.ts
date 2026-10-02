import type { ContentStage, PartnershipStage, Tone } from '@/data/types'

export interface StageMeta<S extends string> {
  value: S
  label: string
  /** Short label for the "avançar →" button. */
  short: string
  emoji: string
  tone: Tone
}

export const PARTNERSHIP_STAGES: StageMeta<PartnershipStage>[] = [
  { value: 'ideia', label: 'Ideia', short: 'Ideia', emoji: '💭', tone: 'sand' },
  { value: 'contato', label: 'Contato', short: 'Contato', emoji: '👋', tone: 'sand' },
  { value: 'negociacao', label: 'Negociação', short: 'Negociação', emoji: '🤝', tone: 'ocean' },
  { value: 'fechado', label: 'Fechado', short: 'Fechado', emoji: '✍️', tone: 'ocean' },
  { value: 'producao', label: 'Produção', short: 'Produção', emoji: '🎬', tone: 'accent' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação', short: 'Aprovação', emoji: '👀', tone: 'plum' },
  { value: 'publicado', label: 'Publicado', short: 'Publicado', emoji: '📣', tone: 'sage' },
  { value: 'aguardando_pagamento', label: 'Aguardando pagamento', short: 'Pagamento', emoji: '💸', tone: 'sand' },
  { value: 'finalizado', label: 'Finalizado', short: 'Finalizado', emoji: '✨', tone: 'sage' },
]

export const CONTENT_STAGES: StageMeta<ContentStage>[] = [
  { value: 'ideia', label: 'Ideias', short: 'Ideia', emoji: '💡', tone: 'sand' },
  { value: 'gravar', label: 'Gravar', short: 'Gravar', emoji: '🎥', tone: 'accent' },
  { value: 'editando', label: 'Editando', short: 'Editando', emoji: '✂️', tone: 'plum' },
  { value: 'pronto', label: 'Pronto', short: 'Pronto', emoji: '✅', tone: 'ocean' },
  { value: 'publicado', label: 'Publicado', short: 'Publicado', emoji: '📣', tone: 'sage' },
]

export const FORMATS = ['Reels', 'TikTok', 'Stories', 'Carrossel', 'YouTube', 'Shorts', 'Post', 'Blog'] as const
export const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Blog'] as const
export const CATEGORIES = [
  'esporte',
  'viagem',
  'lifestyle',
  'rotina',
  'trabalho',
  'tecnologia',
  'IA',
  'wellness',
  'surf',
  'corrida',
  'bike',
] as const

export function partnershipStageMeta(s: PartnershipStage): StageMeta<PartnershipStage> {
  return PARTNERSHIP_STAGES.find((m) => m.value === s) ?? PARTNERSHIP_STAGES[0]
}

export function contentStageMeta(s: ContentStage): StageMeta<ContentStage> {
  return CONTENT_STAGES.find((m) => m.value === s) ?? CONTENT_STAGES[0]
}

export const toOptions = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }))
