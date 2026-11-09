/**
 * pt-BR sentences about studying → structured facts. Pure, deterministic (no AI calls).
 * Never infers skills from a title: a skill is recorded only when she names it.
 */
import type { DateKey, DB, LanguageSkill, LearningMode, LearningResourceType, LearningTool } from '@/data/types'
import { addDays } from '@/lib/date'
import { normalize } from '@/lib/text'
import { domainsOf, LANG_DOMAIN, planOf, TRACK_EN, TRACK_ES } from './model'

/** Subject words per default domain (normalized). Custom domains match by their label. */
const DOMAIN_WORDS: Record<string, RegExp> = {
  idiomas: /\b(ingles|espanhol|idiomas?|english|spanish|frances|italiano|alemao)\b/,
  ia: /\b(ia|inteligencia artificial|llms?|agentes? de ia|machine learning|product ai|genai)\b/,
  tecnologia: /\b(tecnologia|programacao|codigo|software|dados|engenharia|tech)\b/,
  produto_negocios: /\b(produto|product|negocios?|discovery|estrategia|gestao|lideranca|startups?|business)\b/,
  moda_fashiontech: /\b(moda|fashion|fashiontech|estilo)\b/,
  cristianismo_teologia: /\b(teologia|biblia|biblico|biblica|cristianismo|cristao|crista|igreja|patristica|estudo biblico)\b/,
  politica_sociedade: /\b(politica|geopolitica|sociedade|economia|diplomacia|historia)\b/,
  psicologia_comportamento: /\b(psicologia|comportamento|neurociencia|emocoes)\b/,
  literatura_escrita_cultura: /\b(literatura|escrita|poesia|romance|cultura|filosofia|ficcao)\b/,
}

const LANG_OF: { track: string; re: RegExp; code: string }[] = [
  { track: TRACK_EN, re: /\b(ingles|english)\b/, code: 'en' },
  { track: TRACK_ES, re: /\b(espanhol|spanish|espanol)\b/, code: 'es' },
]

const SKILL_WORDS: [LanguageSkill, RegExp][] = [
  ['speaking', /\b(speaking|conversacao)\b/],
  ['listening', /\blistening\b/],
  ['reading', /\breading\b/],
  ['writing', /\bwriting\b/],
  ['grammar', /\b(gramatica|grammar)\b/],
  ['vocabulary', /\b(vocabulario|vocabulary)\b/],
  ['pronunciation', /\b(pronuncia|pronunciation)\b/],
  ['review', /\b(revisao|revisei)\b/],
]

const RESOURCE_WORDS: [LearningResourceType, RegExp][] = [
  ['estudo_biblico', /\bestudo biblico\b/],
  ['documentario', /\bdocumentario\b/],
  ['podcast', /\bpodcast\b/],
  ['video', /\bvideos?\b/],
  ['livro', /\blivros?\b/],
  ['artigo', /\bartigos?\b/],
  ['curso', /\bcursos?\b/],
  ['aula', /\baulas?\b/],
  ['newsletter', /\bnewsletter\b/],
]

const TOOLS: [LearningTool, RegExp][] = [
  ['cambly', /\bcambly\b/],
  ['flexcil', /\bflexcil\b/],
  ['chatgpt', /\bchat ?gpt\b/],
]

/** Minutes said in the sentence: "60 minutos", "1h30", "uma hora e meia", "meia hora". */
export function minutesIn(n: string): number | undefined {
  const hm = /\b(\d{1,2})\s*h(?:oras?)?\s*(?:e\s*)?(\d{1,2})\s*(?:min(?:utos)?)?\b/.exec(n)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  const m = /\b(\d{1,3})\s*(?:min|mins|minutos?)\b/.exec(n)
  if (m) return Number(m[1])
  const h = /\b(\d{1,2})\s*(?:h|horas?)\b/.exec(n)
  if (h) return Number(h[1]) * 60
  if (/\buma hora e meia\b/.test(n)) return 90
  if (/\b(?:uma|1) hora\b/.test(n)) return 60
  if (/\bduas horas\b/.test(n)) return 120
  if (/\bmeia hora\b/.test(n)) return 30
  return undefined
}

export function domainsIn(db: Pick<DB, 'profile'>, n: string): string[] {
  const out: string[] = []
  for (const d of domainsOf(db)) {
    const re = DOMAIN_WORDS[d.id]
    const label = normalize(d.label)
    if ((re && re.test(n)) || (!re && label.length > 2 && new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(n))) out.push(d.id)
  }
  return out
}

export interface ParsedStudy {
  date: DateKey
  minutes?: number
  pages?: number
  domain?: string
  relatedDomains: string[]
  trackId?: string
  contentLanguage?: string
  skills: LanguageSkill[]
  learningMode?: LearningMode
  resourceType?: LearningResourceType
  tool?: LearningTool
  context?: string
  /** A language skill was said but not which language. */
  needsLanguage: boolean
}

const VERB = /^(?:(hoje|ontem|anteontem)\s+)?(?:eu\s+)?(?:ja\s+)?(estudei|li|assisti|ouvi|fiz|pratiquei|escrevi|treinei)\b/

/** "hoje estudei 60 minutos de inglês preparando a reunião com Hillary" → facts. Undefined = not a study log. */
export function parseStudyLog(db: Pick<DB, 'profile'>, text: string, today: DateKey): ParsedStudy | undefined {
  const n = normalize(text).replace(/[?!.]+$/g, '').trim()
  const v = VERB.exec(n)
  if (!v || text.trim().endsWith('?')) return undefined
  const verb = v[2]
  const minutes = minutesIn(n)
  const pages = Number(/\b(\d{1,4})\s*paginas?\b/.exec(n)?.[1]) || undefined
  const skills = SKILL_WORDS.filter(([, re]) => re.test(n)).map(([s]) => s)
  // Subject vs language: "sobre moda em inglês" → main moda, related idiomas, content en.
  const contentLang = /\bem (ingles|english|espanhol|spanish|espanol)\b/.exec(n)
  const subjectPart = contentLang ? n.replace(contentLang[0], ' ') : n
  let domains = domainsIn(db, subjectPart)
  const langMentioned = LANG_OF.find((l) => l.re.test(n))
  const hasDomain = domains.length > 0 || !!langMentioned || skills.length > 0
  if ((verb === 'fiz' || verb === 'pratiquei' || verb === 'treinei') && !(minutes && (domains.length || skills.length || langMentioned))) return undefined
  if ((verb === 'li' || verb === 'assisti' || verb === 'ouvi' || verb === 'escrevi') && !hasDomain) return undefined
  if (verb === 'estudei' && !hasDomain && !minutes) return undefined
  if (skills.length && !domains.includes(LANG_DOMAIN) && !contentLang) domains = [LANG_DOMAIN, ...domains.filter((d) => d !== LANG_DOMAIN)]
  let domain = domains[0]
  let related = domains.slice(1)
  if (contentLang) {
    if (!domain) domain = LANG_DOMAIN
    else if (domain !== LANG_DOMAIN && !related.includes(LANG_DOMAIN)) related = [...related, LANG_DOMAIN]
  }
  if (domains.includes(LANG_DOMAIN) && domain !== LANG_DOMAIN && !contentLang) {
    // "estudei IA em inglês" handled above; "estudei inglês e IA": the first named wins.
    related = domains.filter((d) => d !== domain)
  }
  const lang = contentLang ? LANG_OF.find((l) => l.re.test(contentLang[1])) : langMentioned
  const trackId = lang?.track ?? (domain === LANG_DOMAIN ? contextTrack(db, n) : undefined)
  const mode: LearningMode | undefined =
    verb === 'li' ? 'leitura' : verb === 'assisti' || verb === 'ouvi' ? 'listening' : verb === 'escrevi' ? 'escrita' : skills.length === 1 && skills[0] === 'speaking' ? 'speaking' : verb === 'pratiquei' ? 'pratica' : undefined
  const ctx = /\b(preparando|pra|para|sobre)\s+((?:a|o|as|os|minha|meu)\s+.+)$/.exec(text.trim().replace(/[.!]+$/, '').normalize('NFC'))
  const context = ctx && !/\b(min|minutos|hora)/i.test(ctx[2]) && /\b(reuni|aula|prova|apresent|entrevista|call|viagem|encontro|conversa)/i.test(normalize(ctx[2])) ? `${ctx[1]} ${ctx[2]}` : undefined
  const day = v[1] === 'ontem' ? addDays(today, -1) : v[1] === 'anteontem' ? addDays(today, -2) : today
  return {
    date: day,
    minutes,
    pages,
    domain,
    relatedDomains: related,
    trackId,
    contentLanguage: lang?.code,
    skills,
    learningMode: mode,
    resourceType: RESOURCE_WORDS.find(([, re]) => re.test(n))?.[0],
    tool: TOOLS.find(([, re]) => re.test(n))?.[0],
    context,
    needsLanguage: domain === LANG_DOMAIN && !trackId,
  }
}

/** Language from her configured context terms ("Hillary" → inglês). Only what she set. */
export function contextTrack(db: Pick<DB, 'profile'>, n: string): string | undefined {
  for (const c of planOf(db).contextTerms ?? []) if (c.terms.some((t) => t.trim() && n.includes(normalize(t)))) return c.trackId
  return undefined
}

/** Subject she asked for ("quero aprender algo de geopolítica", "30 minutos de política"). */
export function askedDomain(db: Pick<DB, 'profile'>, n: string): string | undefined {
  return domainsIn(db, n)[0]
}
