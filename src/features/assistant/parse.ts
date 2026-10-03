/**
 * Question parsing for Lumos: pt-BR keywords (accent-insensitive) + entity resolution
 * (projects, trips incl. "África" → "África do Sul", modalities, time words, months).
 */
import type { DB } from '@/data/types'
// People are matched only by data (Project.people / waiting "who"), never by hardcoded names.
import { MONTHS } from '@/lib/date'
import { normalize } from '@/lib/text'
import { MODALITY_SYNONYMS, tokenize } from '@/features/search/engine'
import type { ParsedQuestion, TimeWord } from './types'

const GENERIC_WORDS = new Set(['do', 'da', 'de', 'dos', 'das', 'e', 'projeto', 'studio', 'app', 'sul', 'norte', 'the'])

/** Words of an entity name that are specific enough to identify it alone. */
function keyWords(name: string): string[] {
  return tokenize(name).filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w))
}

export function parseQuestion(db: DB, raw: string): ParsedQuestion {
  const norm = normalize(raw)
  const tokens = tokenize(raw)
  const compact = tokens.join('')
  const tokenSet = new Set(tokens)

  let time: TimeWord | undefined
  if (tokenSet.has('amanha')) time = 'amanha'
  else if (tokenSet.has('hoje') || tokenSet.has('agora')) time = 'hoje'
  else if (tokenSet.has('semana')) time = 'semana'
  else if (tokenSet.has('mes')) time = 'mes'

  const monthIdx = MONTHS.findIndex((m) => tokenSet.has(normalize(m)))

  const projects = db.projects.filter((p) => {
    const c = tokenize(p.name).join('')
    if (c.length >= 3 && compact.includes(c)) return true
    return keyWords(p.name).some((w) => tokenSet.has(w))
  })

  const trips = db.trips.filter((t) => {
    const c = tokenize(t.name).join('')
    if (c.length >= 3 && compact.includes(c)) return true
    return [...keyWords(t.name), ...keyWords(t.place ?? '')].some((w) => w.length >= 4 && tokenSet.has(w))
  })

  const modalities = db.profile.modalities
    .filter((m) => {
      const words = [m.id, ...tokenize(m.label), ...(MODALITY_SYNONYMS[m.id] ?? [])]
      return words.some((w) => tokenSet.has(w))
    })
    .map((m) => m.id)

  const people = findPeople(db, compact, tokenSet)

  return { raw, norm, tokens, time, month: monthIdx >= 0 ? monthIdx : undefined, projects, trips, modalities, people }
}

const PEOPLE_GENERIC = new Set([...GENERIC_WORDS, 'time', 'equipe', 'pessoal', 'cliente', 'turma', 'galera', 'alguem', 'todos'])

/**
 * People Marina mentions by name: anyone listed in a project's `people` or as the "who" of a
 * waiting-for task. Matches the full name, or its first word when it is specific enough.
 */
function findPeople(db: DB, compact: string, tokenSet: Set<string>): ParsedQuestion['people'] {
  const byName = new Map<string, { name: string; projectIds: Set<string> }>()
  const consider = (name: string | undefined, projectId?: string) => {
    if (!name?.trim()) return
    const words = tokenize(name)
    const first = words[0]
    const full = words.join('')
    const hit = (full.length >= 3 && compact.includes(full)) || (!!first && first.length >= 3 && !PEOPLE_GENERIC.has(first) && tokenSet.has(first))
    if (!hit) return
    const key = first ?? full
    const entry = byName.get(key) ?? { name: name.trim(), projectIds: new Set<string>() }
    if (projectId) entry.projectIds.add(projectId)
    byName.set(key, entry)
  }
  for (const p of db.projects) for (const person of p.people) consider(person.name, p.id)
  for (const t of db.tasks) if (t.status === 'waiting') consider(t.waiting?.who, t.projectId)
  return [...byName.values()].map((e) => ({ name: e.name, projectIds: [...e.projectIds] }))
}

/**
 * True when the question has any of the words. Entries ending in '*' are prefixes;
 * entries with spaces are matched as phrases on the normalized text.
 */
export function has(q: ParsedQuestion, ...words: string[]): boolean {
  return words.some((w) => {
    if (w.includes(' ')) return ` ${q.tokens.join(' ')} `.includes(` ${w} `)
    if (w.endsWith('*')) {
      const stem = w.slice(0, -1)
      return q.tokens.some((t) => t.startsWith(stem))
    }
    return q.tokens.includes(w)
  })
}
