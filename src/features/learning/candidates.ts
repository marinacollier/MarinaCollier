/**
 * Learning Engine → Priority Engine. `studyCandidates(db, ctx)` lists what could be studied in a free
 * slot, from every domain, using only real records: resources in progress, due review cards, the
 * language split (inside 'idiomas' only), goals, and commitments in a language within 48h.
 *
 * Three kinds (`studyOptions`): prioritária (aligned with an active goal / a real commitment),
 * complementar, livre (curiosity, no pressure). A subject she chose ("30 minutos de política",
 * "não quero idiomas") is respected — never redirected to inglês/espanhol.
 *
 * Time × energy matrix (any domain): ≤20 min or low energy → light (review, podcast, pleasant reading);
 * ~30 min medium → focused concept / conversation / listening / targeted grammar; 45–60 high → deep,
 * structured study (reading + workbook, writing, product case, technical). Pure.
 */
import { calendarEntries } from '@/data/calendar/universal'
import type { Candidate, DayContext, Energy, LifeArea } from '@/data/priority/contract'
import type { DB, Goal, ID, LearningTool } from '@/data/types'
import { addDays, diffDays, formatDayMonth, hmToMinutes } from '@/lib/date'
import { normalize } from '@/lib/text'
import { studyEntries, totalMinutes } from './engine/minutes'
import { domainLabel, domainOfTrackId, isLanguageSkill, LANG_DOMAIN, languageTracks, planOf, SKILL_LABEL, toolsOf, trackName, TRACK_EN, TRACK_ES } from './engine/model'
import { dueCards, DEFAULT_MAX_REVIEWS } from './engine/srs'
import { weekOf } from './engine/stats'
import { isInProgress, itemDomain } from './engine/progress'

export type StudyOptionKind = 'prioritaria' | 'complementar' | 'livre'

export interface StudyOption extends Candidate {
  kind: StudyOptionKind
  domain: string
  trackId?: ID
  tool?: LearningTool
}

export interface StudyAsk {
  /** A subject she chose: only this domain (main or related). */
  domain?: string
  /** "não quero idiomas". */
  excludeDomains?: string[]
  /** "tenho uma hora no Cambly". */
  tool?: LearningTool
}

export const KIND_LABEL: Record<StudyOptionKind, string> = { prioritaria: 'Prioritária', complementar: 'Complementar', livre: 'Livre' }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const LONG_TODAY = 45
const OTHER_LANG_CAP = 20
const EXAM = /\b(prova|exame|teste|exam|test|ielts|toefl|toeic|dele|siele|cambridge|proficiencia)\b/

const LANG_WORDS: Record<string, RegExp> = {
  [TRACK_EN]: /\b(ingles|english|in english|em ingles)\b/,
  [TRACK_ES]: /\b(espanhol|spanish|espanol|en espanol|castelhano)\b/,
}

function areaFor(domain: string, trackId?: ID): LifeArea {
  if (domain === LANG_DOMAIN) return 'idiomas'
  if (trackId === 'track-pos') return 'faculdade'
  return 'estudos'
}

export function budgetOf(ctx: DayContext): number {
  return Math.max(0, Math.min(ctx.freeMin, ctx.focusMin ?? ctx.freeMin))
}

/** Rest is a fine answer: very low energy, or low energy with almost no time. */
export function restAdvised(ctx: DayContext): boolean {
  return ctx.energy === 1 || (ctx.energy <= 2 && budgetOf(ctx) < 15)
}

// ─── Real commitments in a language (≤ 48h) ─────────────────────────────────

export interface LanguageCommitment {
  trackId: ID
  title: string
  date: string
  time?: string
  why: string
  exam: boolean
}

export function languageCommitments(db: DB, ctx: Pick<DayContext, 'date' | 'now'>): LanguageCommitment[] {
  const plan = planOf(db)
  const nowMin = hmToMinutes(ctx.now)
  const limit = addDays(ctx.date, 2)
  const out: LanguageCommitment[] = []
  let entries: ReturnType<typeof calendarEntries> = []
  try {
    entries = calendarEntries(db, ctx.date, limit, { today: ctx.date })
  } catch {
    entries = []
  }
  for (const e of entries) {
    if (e.base || e.suggested || e.status === 'cancelado' || e.sourceType === 'school') continue
    const d = e.startAt.date
    const t = e.startAt.time
    const mins = diffDays(ctx.date, d) * 1440 + (t ? hmToMinutes(t) : 12 * 60) - nowMin
    if (mins < 0 || mins > 48 * 60) continue
    const ev = e.sourceType === 'event' ? db.events.find((x) => x.id === e.sourceId) : undefined
    const ti = e.sourceType === 'tripItem' ? db.tripItems.find((x) => x.id === e.sourceId) : undefined
    const project = ev?.projectId ? db.projects.find((p) => p.id === ev.projectId) : undefined
    const text = normalize([e.title, ev?.notes, ti?.notes, project?.name].filter(Boolean).join(' '))
    for (const trackId of Object.keys(plan.split)) {
      let why: string | undefined
      const explicit = ev?.language ?? ti?.language ?? project?.language
      if (explicit === trackId) why = `marcado como em ${trackName(db, trackId).toLowerCase()}`
      else if (!explicit && LANG_WORDS[trackId]?.test(text)) why = `o título fala em ${trackName(db, trackId).toLowerCase()}`
      else if (!explicit) {
        const terms = plan.contextTerms?.find((c) => c.trackId === trackId)?.terms ?? []
        const hit = terms.find((term) => term.trim() && new RegExp(`\\b${normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
        if (hit) why = `“${hit}” é um contexto em ${trackName(db, trackId).toLowerCase()} (você configurou)`
      }
      if (why) out.push({ trackId, title: e.title, date: d, time: t, why, exam: EXAM.test(text) })
    }
  }
  return out
}

// ─── Matrix ─────────────────────────────────────────────────────────────────

interface Shape {
  title: string
  minMin: number
  maxMin: number
  energyNeed: Energy
  skills: string[]
  nextStep: string
  tool?: LearningTool
}

function languageShape(budget: number, energy: Energy, least: string | undefined, tools: LearningTool[], lang: string): Shape {
  const has = (t: LearningTool) => tools.includes(t)
  if (energy <= 2) {
    if (budget < 20) return { title: `Revisão leve de ${lang}`, minMin: 5, maxMin: Math.min(15, budget), energyNeed: 1, skills: ['review', 'vocabulary'], nextStep: 'Abra a revisão e passe pelos cartões do dia — sem produzir nada novo.' }
    return { title: `Listening leve em ${lang}`, minMin: 15, maxMin: Math.min(30, budget), energyNeed: 2, skills: ['listening'], tool: has('podcast') ? 'podcast' : undefined, nextStep: 'Um podcast ou episódio de série que você goste, com legenda se ajudar.' }
  }
  if (budget <= 20) return { title: `Revisão + vocabulário de ${lang}`, minMin: 10, maxMin: Math.min(20, budget), energyNeed: 2, skills: ['review', 'vocabulary'], nextStep: 'Revise os cartões do dia e anote 5 palavras novas em frases suas.' }
  if (budget < 45) {
    if (energy >= 4) return { title: `Conversação em ${lang}`, minMin: 25, maxMin: 30, energyNeed: 4, skills: ['speaking'], tool: has('conversa') ? 'conversa' : undefined, nextStep: 'Fale em voz alta sobre o seu dia ou um tema do trabalho por 25 min (grave se quiser).' }
    if (least === 'grammar') return { title: `Gramática direcionada de ${lang}`, minMin: 25, maxMin: 30, energyNeed: 3, skills: ['grammar'], nextStep: 'Escolha um dos seus erros recorrentes e faça exercícios só dele.' }
    return { title: `Listening focado em ${lang}`, minMin: 25, maxMin: 30, energyNeed: 3, skills: ['listening'], nextStep: 'Um áudio curto: ouça, anote o que entendeu, ouça de novo com transcrição.' }
  }
  if (energy >= 4) return { title: `Sessão estruturada de ${lang} com produção`, minMin: 45, maxMin: Math.min(60, budget), energyNeed: 4, skills: ['speaking', 'writing'], tool: has('flexcil') ? 'flexcil' : undefined, nextStep: 'Use o modelo de 60 min: revisão → leitura/gramática → produção → registro.' }
  return { title: `Leitura + workbook de ${lang}`, minMin: 45, maxMin: Math.min(60, budget), energyNeed: 3, skills: ['reading', 'grammar'], tool: has('flexcil') ? 'flexcil' : undefined, nextStep: 'Leitura com anotações no Flexcil e exercícios do workbook; termine registrando o que aprendeu.' }
}

function generalShape(budget: number, energy: Energy, subject: string): Omit<Shape, 'skills'> & { short: string } {
  if (energy <= 2 || budget < 20) return { short: 'Leve', title: `Algo leve de ${subject}`, minMin: Math.min(15, budget), maxMin: Math.min(20, budget), energyNeed: 2, nextStep: 'Um podcast, uma leitura agradável ou um vídeo curto — sem anotar nada se não quiser.' }
  if (budget < 45) return { short: 'Um conceito', title: `Estudo de um conceito de ${subject}`, minMin: 25, maxMin: 30, energyNeed: 3, nextStep: 'Escolha um conceito, leia/assista e escreva 3 linhas com suas palavras.' }
  if (energy >= 4) return { short: 'Estudo profundo', title: `Estudo profundo de ${subject}`, minMin: 45, maxMin: Math.min(60, budget), energyNeed: 4, nextStep: 'Bloco sem interrupção: estude, aplique em um caso real seu e registre a evidência.' }
  return { short: 'Leitura com anotações', title: `Leitura com anotações de ${subject}`, minMin: 45, maxMin: Math.min(60, budget), energyNeed: 3, nextStep: 'Leia com calma e anote o que vale virar cartão de revisão.' }
}

// ─── Goals ──────────────────────────────────────────────────────────────────

function goalFor(db: DB, domain: string, words: string[]): Goal | undefined {
  const active = db.goals.filter((g) => g.status === 'ativa')
  return active.find((g) => g.learningDomain === domain) ?? active.find((g) => words.some((w) => w && normalize(g.title).includes(normalize(w))))
}

// ─── Options ────────────────────────────────────────────────────────────────

export function studyOptions(db: DB, ctx: DayContext, ask: StudyAsk = {}): StudyOption[] {
  const budget = budgetOf(ctx)
  if (budget < 5) return []
  const now = { date: ctx.date, minutes: hmToMinutes(ctx.now) }
  const plan = planOf(db)
  const tools = toolsOf(db)
  const week = weekOf(ctx.date)
  const entries = studyEntries(db, week.from, week.to, now)
  const todayEntries = entries.filter((e) => e.date === ctx.date)
  const allowed = (domain: string, related: string[] = []) =>
    (!ask.domain || domain === ask.domain || related.includes(ask.domain)) && !(ask.excludeDomains ?? []).includes(domain)
  const out: StudyOption[] = []
  const commitments = allowed(LANG_DOMAIN) ? languageCommitments(db, ctx) : []

  // 1. Languages (only inside 'idiomas'; the split never applies to other domains).
  if (allowed(LANG_DOMAIN)) {
    const langWeek = totalMinutes(entries.filter((e) => e.domain === LANG_DOMAIN))
    const tracks = languageTracks(db).filter((t) => db.studyTracks.find((x) => x.id === t)?.status !== 'pausado')
    const today = new Map(tracks.map((t) => [t, totalMinutes(todayEntries.filter((e) => e.trackId === t))]))
    const longDone = tracks.find((t) => (today.get(t) ?? 0) >= LONG_TODAY)
    for (const t of tracks) {
      const lang = trackName(db, t).toLowerCase()
      const todayMin = today.get(t) ?? 0
      const weekMin = totalMinutes(entries.filter((e) => e.trackId === t))
      const planned = plan.split[t] ?? 0
      const actual = langWeek ? weekMin / langWeek : 0
      const reasons: string[] = []
      const commit = commitments.filter((c) => c.trackId === t).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))[0]
      if (todayMin >= LONG_TODAY && !commit?.exam) continue // already did a long one today: no more of the same
      let cap = budget
      if (longDone && longDone !== t) {
        cap = Math.min(cap, OTHER_LANG_CAP)
        reasons.push(`Hoje você já fez ${today.get(longDone)} min de ${trackName(db, longDone).toLowerCase()} — algo curto de ${lang} varia sem cansar.`)
      }
      const skillMin = new Map<string, number>()
      for (const e of entries.filter((x) => x.trackId === t)) for (const s of e.skills) skillMin.set(s, (skillMin.get(s) ?? 0) + e.minutes / e.skills.length)
      const least = (['speaking', 'listening', 'writing', 'grammar', 'reading'] as const).find((s) => !skillMin.get(s))
      let shape = languageShape(cap, ctx.energy, least, tools, lang)
      if (ask.tool === 'cambly' && tools.includes('cambly') && cap >= 25) {
        const purpose = commit ? `preparar “${commit.title}”` : least ? `praticar ${SKILL_LABEL[least as keyof typeof SKILL_LABEL].toLowerCase()} (ainda não apareceu nesta semana)` : 'trabalhar seus erros recorrentes'
        shape = { title: `Cambly com objetivo: ${purpose}`, minMin: 25, maxMin: Math.min(60, cap), energyNeed: 3, skills: ['speaking', 'listening'], tool: 'cambly', nextStep: `Abra a aula dizendo o objetivo ao professor: ${purpose}.` }
      }
      if (shape.minMin > cap) continue
      if (commit) {
        reasons.unshift(`“${commit.title}” ${commit.date === ctx.date ? 'hoje' : formatDayMonth(commit.date)}${commit.time ? ` às ${commit.time}` : ''} — ${commit.why}.`)
        if (!longDone || longDone !== t) {
          if (ctx.energy >= 3 && cap >= 25 && !ask.tool) shape = { title: `Preparar “${commit.title}” em ${lang}`, minMin: 20, maxMin: Math.min(45, cap), energyNeed: 3, skills: ['speaking', 'vocabulary'], nextStep: 'Liste 5 frases que você quer dizer, ensaie em voz alta e revise o vocabulário do tema.' }
        }
      }
      if (langWeek) reasons.push(`Nesta semana: ${weekMin} min de ${lang} (${Math.round(actual * 100)}% do tempo de idiomas; plano ${Math.round(planned * 100)}%).`)
      else reasons.push(`Nenhuma sessão de idiomas registrada nesta semana ainda (plano: ${Math.round(planned * 100)}% ${lang}).`)
      if (least && shape.skills.includes(least)) reasons.push(`${SKILL_LABEL[least as keyof typeof SKILL_LABEL]} ainda não apareceu nesta semana.`)
      const track = db.studyTracks.find((x) => x.id === t)
      const goal = goalFor(db, LANG_DOMAIN, [trackName(db, t)])
      const hasGoal = !!goal || !!track?.goalLevel || t === TRACK_EN
      if (goal) reasons.push(`Meta ativa: ${goal.title}.`)
      const deficit = Math.max(0, planned - actual)
      let score = 45 + deficit * 40 + (least && shape.skills.includes(least) ? 5 : 0) + (commit ? 25 : 0) - (longDone && longDone !== t ? 10 : 0)
      if (shape.energyNeed > ctx.energy) score -= 15
      const kind: StudyOptionKind = commit || (hasGoal && !(longDone && longDone !== t)) ? 'prioritaria' : 'complementar'
      out.push({
        key: `study:lang:${t}`,
        title: shape.title,
        area: 'idiomas',
        minMin: shape.minMin,
        maxMin: shape.maxMin,
        energyNeed: shape.energyNeed,
        moscow: commit?.exam ? 'must' : kind === 'prioritaria' ? 'should' : 'could',
        score: clamp(score),
        reasons,
        nextStep: shape.nextStep,
        contributesTo: [trackName(db, t), ...(goal ? [goal.title] : []), ...(commit ? [commit.title] : [])],
        deadline: commit?.exam ? commit.date : undefined,
        open: { kind: 'study', id: t },
        kind,
        domain: LANG_DOMAIN,
        trackId: t,
        tool: shape.tool,
      })
    }
  }

  // 2. Due review cards (any domain she chose to memorize).
  const cap = plan.maxReviewsPerDay ?? DEFAULT_MAX_REVIEWS
  const cards = (db.learningErrors ?? []).filter((c) => allowed(c.domain ?? (c.trackId ? domainOfTrackId(db, c.trackId) : LANG_DOMAIN)))
  const due = dueCards(cards, ctx.date, cap)
  if (due.length && budget >= 5) {
    const top = due[0]
    out.push({
      key: 'study:review',
      title: `Revisar ${due.length} ${due.length === 1 ? 'flashcard' : 'flashcards'}${reviewTheme(db, due)}`,
      area: areaFor(top.domain ?? LANG_DOMAIN, top.trackId),
      minMin: 5,
      maxMin: Math.min(budget, Math.max(5, due.length * 2)),
      energyNeed: 1,
      moscow: 'should',
      score: clamp(40 + due.length * 4 + Math.min(15, top.count * 3)),
      reasons: [`${due.length} para revisar hoje (limite ${cap}/dia).`, `Mais importante: “${top.front}” → “${top.back}” (${top.count}×).`],
      nextStep: 'Abrir a revisão: ver a frente, lembrar, conferir a resposta e marcar acertei/errei.',
      open: { kind: 'route', to: '/estudos/aprendizagem?v=revisar' },
      kind: 'prioritaria',
      domain: top.domain ?? LANG_DOMAIN,
      trackId: top.trackId,
    })
  }

  // 3. Real resources in progress (any domain), within the matrix.
  const langLong = languageTracks(db).some((t) => totalMinutes(todayEntries.filter((e) => e.trackId === t)) >= LONG_TODAY)
  for (const item of db.studyItems.filter(isInProgress).slice(0, 6)) {
    const domain = itemDomain(db, item)
    if (!allowed(domain, item.relatedDomains)) continue
    if (domain === LANG_DOMAIN && (out.some((o) => o.trackId === item.trackId) || langLong)) continue
    const subject = domainLabel(db, domain).toLowerCase()
    const shape = generalShape(budget, ctx.energy, subject)
    if (shape.minMin > budget || shape.minMin < 5) continue
    const last = (db.studySessions ?? []).filter((s) => s.resourceId === item.id || (item.trackId && s.trackId === item.trackId && domain !== LANG_DOMAIN)).sort((a, b) => b.date.localeCompare(a.date))[0]
    const goal = goalFor(db, domain, [item.title, domainLabel(db, domain)])
    const kind: StudyOptionKind = goal || item.trackId === 'track-pos' ? 'prioritaria' : 'complementar'
    const since = last ? diffDays(last.date, ctx.date) : undefined
    const reasons = [`Em andamento: “${item.title}”${item.progress ? ` (${item.progress}%)` : ''}.`]
    if (item.nextContent) reasons.push(`Próximo: ${item.nextContent}.`)
    reasons.push(last ? `Última sessão: ${formatDayMonth(last.date)}.` : 'Nenhuma sessão registrada com ele ainda.')
    if (goal) reasons.push(`Ajuda a meta: ${goal.title}.`)
    let score = 40 + (kind === 'prioritaria' ? 15 : 0) + Math.min(20, since ?? 10)
    if (shape.energyNeed > ctx.energy) score -= 15
    out.push({
      key: `study:item:${item.id}`,
      title: `${shape.short}: ${item.title}`,
      area: areaFor(domain, item.trackId),
      minMin: shape.minMin,
      maxMin: shape.maxMin,
      energyNeed: shape.energyNeed,
      moscow: kind === 'prioritaria' ? 'should' : 'could',
      score: clamp(score),
      reasons,
      nextStep: item.nextContent ? `Siga de onde parou: ${item.nextContent}.` : shape.nextStep,
      contributesTo: goal ? [goal.title] : undefined,
      open: { kind: 'study', id: item.id },
      kind,
      domain,
      trackId: item.trackId,
    })
  }

  // 4. Livre: something she saved to know, or plain curiosity in the subject she asked for.
  const saved = db.studyItems.filter((i) => i.libraryStatus === 'quero_conhecer' || (!i.libraryStatus && (i.status === 'proximo' || (i.status === 'backlog' && i.reference))))
  const savedHere = saved.filter((i) => allowed(itemDomain(db, i), i.relatedDomains))
  const freeShape = generalShape(Math.min(budget, 30), ctx.energy, ask.domain ? domainLabel(db, ask.domain).toLowerCase() : 'algo que você guardou')
  if (savedHere.length && budget >= 10) {
    const pick = savedHere[[...ctx.date].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % savedHere.length]
    out.push({
      key: `study:free:${pick.id}`,
      title: `Por curiosidade: ${pick.title}`,
      area: areaFor(itemDomain(db, pick), pick.trackId),
      minMin: Math.min(10, budget),
      maxMin: Math.min(30, budget),
      energyNeed: 2,
      moscow: 'could',
      score: clamp(ask.domain ? 55 : 30),
      reasons: [`Você guardou “${pick.title}” para conhecer${pick.source ? ` (${pick.source})` : ''}.`, 'Livre: sem meta, só se der vontade.'],
      nextStep: 'Abra e veja se prende. Se não prender, tudo bem largar.',
      open: { kind: 'study', id: pick.id },
      kind: 'livre',
      domain: itemDomain(db, pick),
      trackId: pick.trackId,
    })
  } else if (ask.domain && !out.length && budget >= 10) {
    const label = domainLabel(db, ask.domain).toLowerCase()
    out.push({
      key: `study:free:${ask.domain}`,
      title: `Explorar ${label}`,
      area: areaFor(ask.domain),
      minMin: Math.min(freeShape.minMin, budget),
      maxMin: Math.min(freeShape.maxMin, budget),
      energyNeed: freeShape.energyNeed,
      moscow: 'could',
      score: 50,
      reasons: [`Você escolheu ${label}.`, `Nada de ${label} em andamento na sua biblioteca — então é exploração livre.`],
      nextStep: 'Escolha um artigo, vídeo ou podcast sobre o tema; se gostar, guarde na biblioteca.',
      open: { kind: 'route', to: '/estudos/aprendizagem' },
      kind: 'livre',
      domain: ask.domain,
    })
  }

  // Low energy: what needs effort sinks; nothing is removed by judgement of "productivity".
  return out.filter((o) => o.minMin <= budget).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
}

/** " — da sessão Bluemoon (09/11)" when the due cards came from one real session; nothing otherwise. */
function reviewTheme(db: DB, due: { sessionId?: string; source?: string }[]): string {
  const ids = new Set(due.map((c) => c.sessionId).filter(Boolean))
  if (ids.size !== 1) return ''
  const s = (db.studySessions ?? []).find((x) => x.id === [...ids][0])
  return s?.date ? ` da sessão de ${s.date.slice(8, 10)}/${s.date.slice(5, 7)}` : ''
}

/** For the Priority Engine: plain Candidates (contract.ts). */
export function studyCandidates(db: DB, ctx: DayContext): Candidate[] {
  return studyOptions(db, ctx).map((o) => {
    const { kind, domain, trackId, tool, ...c } = o
    void tool
    const track = trackId ? db.studyTracks.find((t) => t.id === trackId) : undefined
    const subject = track?.name ?? (domain ? domainLabel(db, domain) : undefined)
    return { ...c, subject, study: domain ? { domain, trackId } : undefined, reasons: [`${KIND_LABEL[kind]}.`, ...c.reasons] }
  })
}

/** Skill ids → readable list ("speaking, listening"). */
export function skillsText(skills: string[]): string {
  return skills.map((s) => (isLanguageSkill(s) ? SKILL_LABEL[s].toLowerCase() : s)).join(', ')
}
