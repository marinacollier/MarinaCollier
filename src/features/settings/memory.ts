/**
 * "O que Lumos sabe sobre mim" — grouping and labels (pure + tested).
 * Layers come from the intelligence layer (memoryView); history items get their own section so
 * "livros terminados / viagens feitas" don't read as current facts. Observed patterns are never rules.
 */
import type { MemoryLayer, MemoryView } from '@/data/intel'
import type { MemoryArea, MemoryKind, Provenance } from '@/data/types'

export type MemorySection = MemoryLayer | 'history'

export const SECTION_META: Record<MemorySection, { title: string; hint: string }> = {
  state: { title: 'Agora', hint: 'o momento atual — muda com o tempo' },
  fact: { title: 'Fatos', hint: 'coisas que não mudam fácil' },
  preference: { title: 'Preferências', hint: 'como você gosta que as coisas sejam' },
  exception: { title: 'Só desta vez', hint: 'mudanças de um dia, sem mexer no padrão' },
  pattern: { title: 'Percebi, mas ainda não é regra', hint: 'só vira preferência se você confirmar' },
  history: { title: 'Histórico', hint: 'o que já aconteceu' },
}

export const SECTION_ORDER: MemorySection[] = ['state', 'fact', 'preference', 'pattern', 'exception', 'history']

export const AREA_LABEL: Record<MemoryArea, string> = {
  rotina: 'rotina',
  trabalho: 'trabalho',
  esportes: 'esportes',
  alimentacao: 'alimentação',
  estudos: 'estudos',
  leitura: 'leitura',
  viagens: 'viagens',
  habitos: 'hábitos',
  luna: 'Luna',
  casa: 'casa',
  financas: 'finanças',
  uso_app: 'uso do app',
}

export const KIND_OPTIONS: { value: MemoryKind; label: string }[] = [
  { value: 'fact', label: 'Fato' },
  { value: 'preference', label: 'Preferência' },
  { value: 'state', label: 'Agora' },
  { value: 'history', label: 'Histórico' },
]

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  user: 'você contou',
  fact: 'fato',
  integration: 'integração',
  inference: 'percebi',
  suggestion: 'sugestão',
}

export function sectionOf(v: MemoryView): MemorySection {
  if (v.item?.kind === 'history' && v.layer !== 'pattern') return 'history'
  return v.layer
}

export function groupMemory(views: MemoryView[]): { section: MemorySection; items: MemoryView[] }[] {
  const by = new Map<MemorySection, MemoryView[]>()
  for (const v of views) {
    if (v.item?.status === 'archived') continue
    const s = sectionOf(v)
    by.set(s, [...(by.get(s) ?? []), v])
  }
  return SECTION_ORDER.filter((s) => by.get(s)?.length).map((section) => ({ section, items: by.get(section)! }))
}
