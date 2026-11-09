/** Building sessions from what she said / typed. Pure. */
import type { DateKey, NewItem } from '@/data/types'
import { normalize } from '@/lib/text'
import type { ParsedStudy } from './parse'

/** Small stable hash (djb2) → base36. */
export function stableHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Same sentence on the same day → same id (Lumos logging is idempotent). */
export function retroSessionId(date: DateKey, text: string): string {
  return `lumos-study:${date}:${stableHash(normalize(text).replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim())}`
}

export function sessionFromParsed(p: ParsedStudy & { minutes: number; domain: string }, text: string, id: string): NewItem<'studySessions'> {
  const s: NewItem<'studySessions'> = { id, date: p.date, minutes: p.minutes, domain: p.domain, source: 'retroativo', status: 'concluido', notes: `Lumos: “${text.trim()}”` }
  if (p.relatedDomains.length) s.relatedDomains = p.relatedDomains
  if (p.trackId) s.trackId = p.trackId
  if (p.skills.length) s.skills = p.skills
  if (p.contentLanguage) s.contentLanguage = p.contentLanguage
  if (p.learningMode) s.learningMode = p.learningMode
  if (p.resourceType) s.resourceType = p.resourceType
  if (p.tool) s.tool = p.tool
  if (p.context) s.context = p.context
  if (p.pages) s.pages = p.pages
  return s
}
