/**
 * Aprendizagem in Lumos (deterministic, no AI calls):
 *   "hoje estudei 60 minutos de inglês preparando a reunião com Hillary" → ONE session (idempotent per text/day)
 *   "Estudei IA por 45 minutos" · "Li 20 páginas de teologia" (asks the time) · "Assisti a um vídeo sobre moda em inglês"
 *   "o que eu estudo agora" · "tenho 20 minutos e estou cansada" · "já fiz inglês hoje, faço espanhol?"
 *   "tenho uma hora no Cambly" · "hoje quero aprender algo de geopolítica" · "me ajuda a escolher entre espanhol ou Product AI"
 *   "qual meu erro mais recorrente?" · "guarda esse podcast na minha biblioteca" · "não quero estudar agora, quero descansar"
 * Skills are recorded only when she names them; when a language session has none, she picks them with chips.
 */
import { ROUTES } from '@/app/routes'
import type { Energy } from '@/data/priority/contract'
import { getDB } from '@/data/store'
import type { DB, LanguageSkill, LearningResourceType, NewItem, StudyItem } from '@/data/types'
import { formatDayMonth, minutesToHM } from '@/lib/date'
import { logCareerActivity, quotaFor } from '@/data/career/activities'
import { uid } from '@/lib/id'
import { normalize } from '@/lib/text'
import { KIND_LABEL, restAdvised, studyOptions, type StudyAsk, type StudyOption } from '@/features/learning/candidates'
import { minutesToday } from '@/features/learning/engine/stats'
import { domainLabel, LANG_DOMAIN, LANGUAGE_SKILLS, SKILL_LABEL, trackName, TRACK_EN, TRACK_ES } from '@/features/learning/engine/model'
import { askedDomain, domainsIn, minutesIn, parseStudyLog } from '@/features/learning/engine/parse'
import { recurring } from '@/features/learning/engine/srs'
import { retroSessionId, sessionFromParsed } from '@/features/learning/engine/session'
import { createUndoable, eventDraft, runLogged, updateUndoable } from '../log'
import { policyFor } from '../policy'
import type { Handler, HandlerInput, LumosReply, ReplyOption } from '../types'

const AREA = 'estudos'
const LINK = { label: 'Abrir Aprendizagem', to: ROUTES.learning }

// ─── Logging ────────────────────────────────────────────────────────────────

function logSession(input: HandlerInput): LumosReply | undefined {
  const { db, text, now } = input
  const p = parseStudyLog(db, text, now.date)
  if (!p) return undefined
  const base = text.trim().replace(/[.!]+$/, '')
  if (!p.domain) {
    return {
      area: AREA,
      text: 'Anoto essa sessão — de qual assunto foi?',
      options: ['idiomas', 'ia', 'produto_negocios', 'cristianismo_teologia', 'literatura_escrita_cultura'].map((d) => ({ label: domainLabel(db, d), ask: `${base} de ${domainLabel(db, d).toLowerCase()}` })),
    }
  }
  if (p.needsLanguage) {
    return {
      area: AREA,
      text: 'Em qual idioma foi?',
      options: [
        { label: trackName(db, TRACK_EN), ask: `${base} em inglês` },
        { label: trackName(db, TRACK_ES), ask: `${base} em espanhol` },
      ],
    }
  }
  if (!p.minutes) {
    return {
      area: AREA,
      text: `Quanto tempo foi${p.pages ? ` (${p.pages} páginas)` : ''}? Registro os minutos uma vez só.`,
      options: [15, 30, 45, 60].map((m) => ({ label: `${m} min`, ask: `${base} por ${m} minutos` })),
    }
  }
  const id = retroSessionId(p.date, text)
  const existing = (db.studySessions ?? []).find((s) => s.id === id)
  if (existing) return { area: AREA, text: 'Essa sessão já está registrada ✓ — não contei de novo.', ref: { type: 'studySession', id }, link: LINK }
  const data = sessionFromParsed({ ...p, minutes: p.minutes, domain: p.domain }, text, id)
  const what = p.domain === LANG_DOMAIN && p.trackId ? trackName(db, p.trackId).toLowerCase() : domainLabel(db, p.domain).toLowerCase()
  const also = p.relatedDomains.length ? ` (também tocou ${p.relatedDomains.map((d) => domainLabel(db, d).toLowerCase()).join(', ')})` : ''
  const askSkills = p.domain === LANG_DOMAIN && !p.skills.length
  const options: ReplyOption[] = askSkills
    ? LANGUAGE_SKILLS.map((s: LanguageSkill) => ({
        label: SKILL_LABEL[s],
        act: {
          run: () => {
            const cur = getDB().studySessions?.find((x) => x.id === id)?.skills ?? []
            return updateUndoable('studySessions', id, { skills: [...new Set([...cur, s])] })
          },
          done: `${SKILL_LABEL[s]} marcado nessa sessão ✓`,
        },
      }))
    : []
  // Her career quota "Inglês executivo" is a separate count: offered, never added on its own.
  if (p.trackId === TRACK_EN && quotaFor(db, 'ingles_exec')) {
    options.push({ label: 'Contar no Inglês executivo', act: { run: () => logCareerActivity('ingles_exec', p.date, { minutes: p.minutes, by: 'lumos' })?.undo ?? (() => {}), done: 'Contado também no Inglês executivo ✓' } })
  }
  return {
    area: AREA,
    text: `Registrei ${p.minutes} min de ${what}${p.date !== now.date ? ` em ${formatDayMonth(p.date)}` : ''}${also} ✓`,
    sub: [p.context ? `Contexto: ${p.context}.` : undefined, askSkills ? 'Quais habilidades você praticou? Toque nas que valem — não vou adivinhar.' : undefined].filter(Boolean).join(' ') || undefined,
    ref: { type: 'studySession', id },
    options: options.length ? options : undefined,
    link: LINK,
    action: {
      mode: policyFor('study_record'),
      run: () => runLogged(() => createUndoable('studySessions', data).undo, [eventDraft(now, { kind: 'logged', title: `Estudou ${p.minutes} min de ${what}`, area: 'estudos', date: p.date, ref: { type: 'studySession', id } })]),
    },
  }
}

// ─── Recommending ───────────────────────────────────────────────────────────

const WHAT_NOW = /\bo que (?:eu )?(?:estudo|estudar|devo estudar|posso estudar|vale estudar)\b/
const HAVE_TIME = /^(?:agora\s+)?(?:eu\s+)?(?:so\s+)?tenho\s+(?:so\s+)?(\d{1,3}|uma|meia|duas)\s*(?:min|minutos|h|hora|horas)\b(.*)$/
const DID_LANG = /\bja fiz (ingles|espanhol)\b.*\b(faco|devo fazer|posso fazer|estudo)\b/
const WANT = /\b(?:quero|queria|vou|posso)\s+(?:estudar|aprender)\b(?!.*\bdescans)/
const CHOOSE = /\b(?:escolher|decidir)\s+entre\s+(.+?)\s+(?:ou|e)\s+(.+)$/
const EXCLUDE = /\bnao quero (?:estudar )?(?:nada de )?(idiomas?|ingles|espanhol|[a-z]+)\b/
const REST = /\bnao quero estudar\b|\bquero (?:so )?descansar\b|\bprefiro descansar\b/

function energyOf(db: DB, n: string, date: string): Energy {
  if (/\b(muito cansada|exausta|esgotada|morta|destruida)\b/.test(n)) return 1
  if (/\b(cansada|sem energia|energia baixa|com sono|cansaco)\b/.test(n)) return 2
  if (/\b(disposta|animada|com energia|energia alta|cheia de energia)\b/.test(n)) return 4
  const ci = db.checkins.find((c) => c.date === date)?.energia
  return ci === 'baixa' ? 2 : ci === 'alta' ? 4 : 3
}

function optionLine(db: DB, o: StudyOption) {
  return {
    text: `${o.title} · ${o.minMin === o.maxMin ? o.maxMin : `${o.minMin}–${o.maxMin}`} min`,
    emoji: o.kind === 'prioritaria' ? '🎯' : o.kind === 'livre' ? '🌱' : '➕',
    sub: [`${KIND_LABEL[o.kind]} · ${domainLabel(db, o.domain)}`, ...o.reasons.slice(0, 2)].join(' · '),
  }
}

function recommend(input: HandlerInput): LumosReply | undefined {
  const { db, n, now } = input
  if (REST.test(n)) {
    return { area: AREA, text: 'Combinado: descansar também faz parte de aprender. Nada fica “atrasado” por isso 🌙', sub: 'Quando quiser voltar, é só me perguntar o que estudar.' }
  }
  const time = HAVE_TIME.exec(n)
  const choose = CHOOSE.exec(n)
  const did = DID_LANG.exec(n)
  const cambly = /\bcambly\b/.test(n) && /\btenho\b/.test(n)
  const wantsStudy = WANT.test(n) && !/\b(estudei|li|assisti|fiz)\b/.test(n)
  if (time && time[2].trim() && !/\b(cansad|exaust|esgotad|energia|disposta|animada|estud|aprend|ingles|espanhol|cambly|sono|ler|livre)/.test(time[2])) return undefined
  if (!(WHAT_NOW.test(n) || time || choose || did || cambly || wantsStudy)) return undefined

  const said = minutesIn(n)
  const freeMin = said ?? 45
  const energy = energyOf(db, n, now.date)
  const ctx = { date: now.date, freeMin, energy, now: minutesToHM(Math.max(0, Math.min(1439, Math.round(now.minutes)))) }
  const ask: StudyAsk = {}
  if (cambly) ask.tool = 'cambly'
  const ex = EXCLUDE.exec(n)
  if (ex) ask.excludeDomains = [domainsIn(db, ex[1])[0] ?? (/idioma|ingles|espanhol/.test(ex[1]) ? LANG_DOMAIN : ex[1])]
  if (did) ask.domain = LANG_DOMAIN
  else if (cambly) ask.domain = LANG_DOMAIN
  else if (!choose && !ex) ask.domain = askedDomain(db, n.replace(HAVE_TIME, '$2'))
  const assumed = said ? '' : ' Considerei ~45 min; me diz quanto tempo você tem se for diferente.'

  if (choose) {
    const pick = (s: string): StudyOption | undefined => {
      const d = askedDomain(db, normalize(s))
      const lang = /espanhol/.test(s) ? TRACK_ES : /ingles/.test(s) ? TRACK_EN : undefined
      const opts = studyOptions(db, ctx, { domain: d })
      return (lang ? opts.find((o) => o.trackId === lang) : undefined) ?? opts[0]
    }
    const a = pick(choose[1])
    const b = pick(choose[2])
    if (!a && !b) return { area: AREA, text: `Não achei nada registrado para “${choose[1]}” nem “${choose[2]}” — qualquer um vale; escolha o que der mais vontade.`, link: LINK }
    const best = !b || (a && a.score >= b.score) ? a! : b
    return {
      area: AREA,
      text: `Eu iria de ${best.title.toLowerCase()} agora.`,
      sub: (restAdvised(ctx) ? 'Com pouca energia, descansar também é uma boa escolha. ' : '') + assumed.trim(),
      lines: [a, b].filter((o): o is StudyOption => !!o).map((o) => optionLine(db, o)),
      link: LINK,
    }
  }

  const opts = studyOptions(db, ctx, ask)
  const notes: string[] = []
  if (did) {
    const t = did[1] === 'ingles' ? TRACK_EN : TRACK_ES
    const m = minutesToday(db, now, t)
    notes.push(m ? `Hoje: ${m} min de ${trackName(db, t).toLowerCase()} registrados.` : `Não vejo ${trackName(db, t).toLowerCase()} registrado hoje — se fez, me conta quanto tempo que eu anoto.`)
  }
  if (restAdvised(ctx)) {
    return {
      area: AREA,
      text: 'Com essa energia, descansar é uma ótima escolha.',
      sub: opts.length ? 'Se quiser algo mesmo assim, o mais leve:' : undefined,
      lines: opts.slice(0, 1).map((o) => optionLine(db, o)),
      link: LINK,
    }
  }
  if (!opts.length) {
    const subject = ask.domain ? domainLabel(db, ask.domain).toLowerCase() : 'estudo'
    return { area: AREA, text: `Não tenho uma sugestão boa de ${subject} para esse tempo.`, sub: [...notes, 'Descansar ou algo livre também vale.'].join(' '), link: LINK }
  }
  const top = opts[0]
  return {
    area: AREA,
    text: `Sugestão: ${top.title} (${top.minMin === top.maxMin ? top.maxMin : `${top.minMin}–${top.maxMin}`} min).`,
    sub: [...notes, top.nextStep, assumed.trim()].filter(Boolean).join(' '),
    lines: opts.slice(0, 3).map((o) => optionLine(db, o)),
    link: LINK,
  }
}

// ─── Errors / library ───────────────────────────────────────────────────────

const TOP_ERROR = /\b(?:erros?)\b.*\b(?:recorrentes?|frequentes?|mais comuns?|que mais (?:cometo|faco|erro))\b|\b(?:qual|quais)\b.*\berros?\b.*\bmais\b/

function topErrors(input: HandlerInput): LumosReply | undefined {
  const { db, n } = input
  if (!TOP_ERROR.test(n)) return undefined
  const top = recurring(db.learningErrors ?? [], 3)
  if (!top.length) return { area: AREA, text: 'Ainda não tenho erros registrados para contar.', sub: 'Em Aprendizagem → Revisão você pode adicionar (ou importar os do seu estudo de inglês).', link: { label: 'Abrir revisão', to: `${ROUTES.learning}?v=revisar` } }
  return {
    area: AREA,
    text: `O mais recorrente: “${top[0].front}” → ${top[0].back} (${top[0].count}×).`,
    lines: top.slice(1).map((e) => ({ text: `“${e.front}” → ${e.back}`, emoji: '🔁', sub: `${e.count}× · ${e.category ?? ''}`.trim() })),
    link: { label: 'Revisar agora', to: `${ROUTES.learning}?v=revisar` },
  }
}

const SAVE = /^(?:guarda|guardar|salva|salvar|coloca|adiciona|anota)\b.*\b(?:na|pra|para a|em)\s+(?:minha\s+)?biblioteca\b/
const KIND_OF: [LearningResourceType, StudyItem['kind'], RegExp][] = [
  ['podcast', 'podcast', /\bpodcast\b/],
  ['livro', 'livro', /\blivro\b/],
  ['artigo', 'artigo', /\bartigo\b/],
  ['video', 'video', /\bvideo\b/],
  ['curso', 'curso', /\bcurso\b/],
  ['documentario', 'video', /\bdocumentario\b/],
  ['newsletter', 'newsletter', /\bnewsletter\b/],
]

function saveToLibrary(input: HandlerInput): LumosReply | undefined {
  const { db, n, text, now } = input
  if (!SAVE.test(n)) return undefined
  const kind = KIND_OF.find(([, , re]) => re.test(n))
  const url = /https?:\/\/\S+/.exec(text)?.[0]
  const named = /[“"«]([^”"»]+)[”"»]/.exec(text)?.[1] ?? /:\s*(.+)$/.exec(text)?.[1]?.replace(/https?:\/\/\S+/, '').trim()
  const title = named || undefined
  if (!title && !url) {
    return { area: AREA, text: `Guardo sim — qual ${kind ? kind[0] : 'conteúdo'}? Me manda o nome ou o link (não vou inventar).`, link: LINK }
  }
  const id = uid()
  const domain = askedDomain(db, normalize(title ?? '')) ?? undefined
  const item: NewItem<'studyItems'> = {
    id,
    title: title ?? url!,
    kind: kind?.[1] ?? 'outro',
    status: 'backlog',
    progress: 0,
    order: db.studyItems.reduce((m, i) => Math.max(m, i.order), -1) + 1,
    libraryStatus: 'quero_conhecer',
    libraryLog: [{ status: 'quero_conhecer', date: now.date }],
  }
  if (url) item.link = url
  if (kind) item.resourceType = kind[0]
  if (domain) item.domain = domain
  return {
    area: AREA,
    text: `Guardei “${item.title}” na biblioteca como “quero conhecer” ✓`,
    ref: { type: 'studyItem', id },
    link: { label: 'Abrir biblioteca', to: `${ROUTES.learning}?v=biblioteca` },
    action: { mode: policyFor('study_record'), run: () => runLogged(() => createUndoable('studyItems', item).undo, [eventDraft(now, { kind: 'created', title: `Biblioteca: ${item.title}`, area: 'estudos', ref: { type: 'studyItem', id } })]) },
  }
}

function run(input: HandlerInput): LumosReply | undefined {
  return saveToLibrary(input) ?? topErrors(input) ?? logSession(input) ?? recommend(input)
}

export const learningHandler: Handler = { id: 'learning', run }
