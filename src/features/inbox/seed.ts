import type { FeatureSeed } from '@/data/seed/context'
import { seedId } from '@/data/seed/context'

/** Inbox groups, in the order Marina thinks about them (§41). Groups without items don't show. */
export const INBOX_GROUPS = ['Hoje', 'Trabalho', 'África do Sul', 'Recife', 'UGC', 'Estudos', 'Vida', 'Algum dia'] as const

/**
 * Genuinely open thoughts from Marina's brief — not tasks, not reservations.
 * Anything already modeled elsewhere (trip items, projects, content) is not repeated here.
 */
const ITEMS: [group: (typeof INBOX_GROUPS)[number], text: string][] = [
  ['Trabalho', 'Day One AI: qual o próximo foco — ranking do Match ou padronização do Planner?'],
  ['África do Sul', 'Conferir pendências da África antes do dia 22'],
  ['África do Sul', 'Johannesburg / safari (13–16/11): o que ainda falta confirmar?'],
  ['Recife', 'Recife: definir data, voo e logística'],
  ['UGC', 'Banco de ideias pra série “Um mês sozinha na África do Sul”'],
  ['Estudos', 'Definir próximo foco da pós / Tera'],
  ['Vida', 'Montar minha semana no domingo'],
  ['Vida', 'Luna durante as viagens: creche ou hotel?'],
  ['Algum dia', 'Réveillon em Itacaré: pensar hospedagem quando as datas fecharem'],
]

export const seedInbox: FeatureSeed = (ctx) => ({
  brainDump: ITEMS.map(([group, text]) => ctx.make('brainDump', { id: seedId('inbox', text.slice(0, 48)), text, group, status: 'inbox' })),
})
