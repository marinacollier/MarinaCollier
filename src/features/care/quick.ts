/**
 * "Preciso me acalmar" — 8 portas de entrada, cada uma com 2–3 técnicas (versão curta primeiro).
 * Pura e testada: toda opção aponta para técnicas que existem.
 */
import { ROUTES } from '@/app/routes'
import { techniqueById, type Technique } from './techniques'

export type QuickId = 'ansiosa' | 'ruminando' | 'impulsiva' | 'triste' | 'rejeicao' | 'raiva' | 'escrever' | 'conversar'

export interface QuickOption {
  id: QuickId
  label: string
  emoji: string
  /** Uma frase acolhedora, sem rótulo. */
  intro: string
  techniqueIds: string[]
  link?: { label: string; to: string }
  /** 'escrever' abre a área de rascunho não salva; 'conversar' mostra o plano de apoio. */
  kind?: 'write' | 'talk'
}

export const QUICK_OPTIONS: QuickOption[] = [
  {
    id: 'ansiosa',
    label: 'Estou ansiosa',
    emoji: '🌬️',
    intro: 'Primeiro o corpo, depois os pensamentos. Comece pelo que parecer mais fácil.',
    techniqueIds: ['aterramento-54321', 'tipp', 'stop'],
  },
  {
    id: 'ruminando',
    label: 'Estou ruminando',
    emoji: '🌀',
    intro: 'A cabeça está repetindo a mesma coisa. Dá para criar um pouco de distância.',
    techniqueIds: ['desfusao', 'checar-fatos', 'aterramento-54321'],
  },
  {
    id: 'impulsiva',
    label: 'Vontade de responder no impulso',
    emoji: '✋',
    intro: 'Você não precisa responder agora. Uma pausa protege você e a conversa.',
    techniqueIds: ['stop', 'mente-sabia', 'acao-oposta'],
    link: { label: 'Escrever uma mensagem de pausa', to: ROUTES.careTab('pausa') },
  },
  {
    id: 'triste',
    label: 'Triste ou sem energia',
    emoji: '🌧️',
    intro: 'Sem cobrança. Um passo pequeno já conta.',
    techniqueIds: ['ativacao-comportamental', 'tolerancia-mal-estar', 'acao-oposta'],
  },
  {
    id: 'rejeicao',
    label: 'Medo de rejeição',
    emoji: '🫧',
    intro: 'Esse medo dói de verdade. Vale separar o que aconteceu do que a cabeça está imaginando.',
    techniqueIds: ['checar-fatos', 'registro-pensamentos', 'mente-sabia'],
  },
  {
    id: 'raiva',
    label: 'Estou com raiva',
    emoji: '🔥',
    intro: 'A raiva tem informação importante. Antes de agir, baixe um pouco a intensidade.',
    techniqueIds: ['tipp', 'stop', 'acao-oposta'],
    link: { label: 'Escrever uma mensagem de pausa', to: ROUTES.careTab('pausa') },
  },
  {
    id: 'escrever',
    label: 'Quero escrever',
    emoji: '✍️',
    intro: 'Escrever ajuda a organizar. O diário privado ainda não está disponível; por enquanto há um rascunho que não é salvo.',
    techniqueIds: ['registro-pensamentos', 'desfusao'],
    kind: 'write',
  },
  {
    id: 'conversar',
    label: 'Só quero conversar',
    emoji: '🤍',
    intro: 'Falar com alguém de confiança é um ótimo caminho. Seus contatos e ajuda humana estão aqui.',
    techniqueIds: ['dear-man', 'give-fast'],
    link: { label: 'Abrir meu plano de apoio', to: ROUTES.careTab('apoio') },
    kind: 'talk',
  },
]

export function quickOption(id: QuickId): QuickOption | undefined {
  return QUICK_OPTIONS.find((q) => q.id === id)
}

export function quickTechniques(id: QuickId): Technique[] {
  return (quickOption(id)?.techniqueIds ?? []).map(techniqueById).filter((t): t is Technique => !!t)
}
