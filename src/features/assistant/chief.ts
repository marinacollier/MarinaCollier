/**
 * Lumos, the Chief of Staff. Deterministic orchestrator: parse the question, ask the agents how
 * well they can answer, run the best one(s) and compose a short answer (headline + blocks).
 * No generative AI here — see ./llm.ts for where that would plug in (server-side, behind a flag).
 */
import type { DateKey, DB } from '@/data/types'
import { search, topResults, type SearchResult } from '@/features/search/engine'
import { AGENTS } from './agents'
import { parseQuestion } from './parse'
import type { Agent, AnswerBlock, AnswerItem, LumosAnswer } from './types'

export const EXAMPLE_QUESTIONS = [
  'Amanhã é presencial?',
  'Tem conflito essa semana?',
  'Quando consigo encaixar yoga?',
  'Como está minha semana de treino?',
  'Tenho alguma coisa urgente hoje?',
  'Qual foi meu gasto essa semana?',
  'Que projeto está ficando para trás?',
  'O que tenho pendente antes da África?',
  'Quando consigo encaixar musculação?',
  'O que estou esperando do FashionFinder?',
  'Que livros coloquei na fila?',
  'Que coisas preciso resolver antes de viajar?',
]

const MIN_SCORE = 0.5
const SPREAD = 0.15
const MAX_AGENTS = 3

export function pickAgents(scored: { agent: Agent; score: number }[]): Agent[] {
  const max = Math.max(0, ...scored.map((s) => s.score))
  if (max < MIN_SCORE) return []
  return scored
    .filter((s) => s.score >= MIN_SCORE && s.score >= max - SPREAD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_AGENTS)
    .map((s) => s.agent)
}

const QUESTION_WORDS = new Set([
  'que', 'qual', 'quais', 'quem', 'como', 'onde', 'quando', 'quanto', 'quantos', 'porque', 'por',
  'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'pra', 'para', 'com', 'e',
  'eu', 'meu', 'minha', 'meus', 'minhas', 'tenho', 'tem', 'estou', 'esta', 'sobre', 'preciso', 'mari', 'lumos', 'me', 'fala', 'mostra',
  'tudo', 'coisa', 'coisas', 'algo', 'alguma', 'ja', 'ainda', 'isso', 'sei', 'voce', 'pode', 'consegue',
])

function resultItem(r: SearchResult): AnswerItem {
  return { id: r.key, emoji: r.emoji, title: r.title, subtitle: r.subtitle, action: r.action }
}

/** Search with the meaningful words of a question; if the AND finds nothing, try each word alone. */
export function searchForQuestion(db: DB, question: string, today: DateKey, n = 5): SearchResult[] {
  const words = parseQuestion(db, question).tokens.filter((t) => !QUESTION_WORDS.has(t) && t.length >= 3)
  if (!words.length) return []
  const all = topResults(search(db, words.join(' '), today), n)
  if (all.length) return all
  const seen = new Map<string, SearchResult>()
  for (const w of words) for (const r of topResults(search(db, w, today), n)) if (!seen.has(r.key)) seen.set(r.key, r)
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, n)
}

function fallback(db: DB, question: string, today: DateKey): LumosAnswer {
  const found = searchForQuestion(db, question, today)
  const blocks: AnswerBlock[] = [
    { kind: 'text', text: 'Por enquanto eu cruzo seus dados com regras simples — tenta perguntar de um destes jeitos:' },
    { kind: 'suggestions', questions: EXAMPLE_QUESTIONS.slice(0, 4) },
  ]
  if (found.length) blocks.splice(0, 0, { kind: 'list', title: 'Achei isso na busca', emoji: '🔎', items: found.map(resultItem) })
  return {
    question,
    headline: found.length ? 'Não sei responder isso direitinho ainda, mas achei umas coisas relacionadas 👇' : 'Hmm, essa eu ainda não sei responder 🙈',
    blocks,
    agents: [],
    fallback: true,
  }
}

export function askLumos(db: DB, question: string, today: DateKey, minutes: number): LumosAnswer {
  const q = parseQuestion(db, question)
  if (!q.tokens.length) return fallback(db, question, today)
  const chosen = pickAgents(AGENTS.map((agent) => ({ agent, score: agent.match(q) })))
  if (!chosen.length) return fallback(db, question, today)

  let headline = ''
  const blocks: AnswerBlock[] = []
  for (const agent of chosen) {
    const out = agent.answer({ db, today, minutes, q })
    for (const b of out) {
      if (b.kind === 'headline') {
        if (!headline) headline = b.text
        else blocks.push({ kind: 'text', text: `${agent.emoji} ${b.text}` })
      } else blocks.push(b)
    }
  }
  return {
    question,
    headline: headline || 'Aqui está o que encontrei:',
    blocks,
    agents: chosen.map(({ id, name, emoji }) => ({ id, name, emoji })),
    fallback: false,
  }
}
