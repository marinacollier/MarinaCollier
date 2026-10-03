/**
 * pt-BR reading of an adjustment sentence: days, times, durations, periods and modality mentions,
 * all with token positions so the planner can tell "source" from "target" ("troco X por Y").
 * Modalities come from profile.modalities; the only words here are generic pt-BR synonyms of
 * modality ids — no names of places, people or services.
 */
import type { DateKey, DayPeriod, DB, Modality, TimeHM, Weekday } from '@/data/types'
import { addDays, weekday } from '@/lib/date'
import { normalize } from '@/lib/text'

/** Generic pt-BR words for modality ids (verbs included). Labels and ids come from the profile. */
export const MODALITY_WORDS: Record<string, string[]> = {
  corrida: ['corrida', 'correr', 'corro', 'corri', 'run', 'rodagem', 'longao'],
  trail: ['trail', 'trilha'],
  natacao: ['natacao', 'nadar', 'nado', 'piscina', 'swim'],
  bike: ['bike', 'pedal', 'pedalar', 'pedalada', 'bicicleta', 'ciclismo'],
  gravel: ['gravel'],
  speed: ['speed'],
  musculacao: ['musculacao', 'academia', 'forca', 'gym', 'perna', 'pernas', 'upper', 'superiores', 'inferiores', 'gluteo'],
  yoga: ['yoga', 'ioga'],
  mobilidade: ['mobilidade', 'alongamento', 'alongar'],
  circo: ['circo', 'aereo', 'aereos', 'tecido', 'lira'],
  surf: ['surf', 'surfe', 'surfar', 'onda', 'ondas'],
  caminhada: ['caminhada', 'caminhar'],
  recuperacao: ['recuperacao', 'regenerativo'],
}

/** Words of a modality label that are too generic to identify it. */
const LABEL_STOP = new Set(['outra', 'outro', 'atividade', 'run', 'de', 'e', 'treino'])

const WEEKDAY_WORDS: Record<string, Weekday> = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terca: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, sab: 6,
}

export const CONNECTORS = new Set(['por', 'pra', 'para', 'p', 'pro', 'pelo', 'pela', 'pros', 'pras'])
const SWAP_VERBS = ['troc', 'mud', 'substitu']
const MOVE_EXACT = new Set(['passa', 'passar', 'passo', 'move', 'mover', 'movo', 'joga', 'jogar', 'jogo', 'leva', 'levar', 'levo', 'empurra', 'empurrar', 'empurro', 'adia', 'adiar', 'adio', 'antecipa', 'antecipar', 'antecipo', 'transfere', 'transferir', 'transfiro'])
const SKIP_EXACT = new Set(['pular', 'pulo', 'pula', 'pulando', 'cancelar', 'cancela', 'cancelo', 'folga', 'descansar', 'descanso'])
const LONG_WORDS = new Set(['longa', 'longo', 'longao', 'long'])
const GENERIC_TRAINING = new Set(['treino', 'treinar', 'treinos', 'treinao', 'sessao'])

export interface DayMention {
  date: DateKey
  pos: number
}

export interface ModMention {
  /** Best modality for this word (the one whose id/label matches; else the first synonym owner). */
  id: string
  /** Every modality the word can mean ("pedal" → bike, gravel, speed). */
  ids: string[]
  pos: number
  word: string
}

export interface Lexed {
  raw: string
  tokens: string[]
  days: DayMention[]
  time?: { hm: TimeHM; pos: number }
  duration?: { min: number; pos: number }
  period?: { period: DayPeriod; pos: number }
  mods: ModMention[]
  /** Positions of "longa/longo". */
  longAt: number[]
  /** Positions of generic "treino/treinar". */
  genericAt: number[]
  swapVerbAt?: number
  moveVerbAt?: number
  /** "em vez de" / "ao invés de" / "no lugar de": position right after the phrase. */
  insteadAt?: number
  skip: boolean
  /** "vai ser", "fica pro": a day after it is where the session goes. */
  becomesAt?: number
  isQuestion: boolean
}

export function tokenizeAdjust(raw: string): string[] {
  return normalize(raw)
    .replace(/(\d)[.,](\d)/g, '$1d$2')
    .split(/[^a-z0-9:]+/)
    .filter(Boolean)
}

/** Words that name a modality: id, label words, generic synonyms. */
export function modalityWords(m: Modality): string[] {
  const label = normalize(m.label)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !LABEL_STOP.has(w))
  return [...new Set([m.id, ...label, ...(MODALITY_WORDS[m.id] ?? [])])]
}

function stem(w: string): string {
  return w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w
}

function resolveDay(tokens: string[], i: number, today: DateKey): { date: DateKey; len: number } | undefined {
  const t = tokens[i]
  if (t === 'hoje') return { date: today, len: 1 }
  if (t === 'depois' && tokens[i + 1] === 'de' && tokens[i + 2] === 'amanha') return { date: addDays(today, 2), len: 3 }
  if (t === 'amanha' && tokens[i - 2] !== 'depois') return { date: addDays(today, 1), len: 1 }
  const wd = WEEKDAY_WORDS[t]
  if (wd === undefined) return undefined
  // "sex" / "qua" / "qui" alone are only days when they look like one.
  if (t.length === 3 && !['dom', 'seg', 'sab'].includes(t) && !['de', 'na', 'no', 'pra', 'pro', 'a', 'o'].includes(tokens[i - 1] ?? '')) return undefined
  let len = 1
  if (tokens[i + 1] === 'feira') len++
  const next = ['proximo', 'proxima'].includes(tokens[i - 1] ?? '') || (tokens[i + len] === 'que' && tokens[i + len + 1] === 'vem')
  if (tokens[i + len] === 'que' && tokens[i + len + 1] === 'vem') len += 2
  let delta = (wd - weekday(today) + 7) % 7
  if (next && delta === 0) delta = 7
  return { date: addDays(today, delta), len }
}

function parseHM(tok: string): { h: number; m: number; unit?: 'h' | 'min' } | undefined {
  let mm = /^(\d{1,2}):(\d{2})$/.exec(tok)
  if (mm) return { h: +mm[1], m: +mm[2] }
  mm = /^(\d{1,2})h(\d{2})?$/.exec(tok)
  if (mm) return { h: +mm[1], m: mm[2] ? +mm[2] : 0, unit: 'h' }
  return undefined
}

function hm(h: number, m: number): TimeHM {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const TIME_PREV = new Set(['as', 'a', 'das', 'pelas', 'umas'])
const DURATION_PREV = new Set(['de', 'por', 'durar', 'dura', 'durante', 'com', 'em'])

/** Times ("às 7h", "19:30") and durations ("de 4h", "90 min", "1h30") from the tokens. */
function numbers(tokens: string[]): { time?: Lexed['time']; duration?: Lexed['duration'] } {
  let time: Lexed['time']
  let duration: Lexed['duration']
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const prev = tokens[i - 1] ?? ''
    const next = tokens[i + 1] ?? ''
    if (t === 'meia' && next === 'hora') {
      duration ??= { min: 30, pos: i }
      continue
    }
    // "4d5h" (4,5h)
    const dec = /^(\d+)d(\d)(h|min)?$/.exec(t)
    if (dec) {
      const n = Number(`${dec[1]}.${dec[2]}`)
      const unit = dec[3] ?? (['h', 'hora', 'horas'].includes(next) ? 'h' : undefined)
      if (unit === 'h') duration ??= { min: Math.round(n * 60), pos: i }
      continue
    }
    const minTok = /^(\d+)(min|mins|minutos)?$/.exec(t)
    if (minTok && (minTok[2] || ['min', 'mins', 'minuto', 'minutos'].includes(next))) {
      duration ??= { min: +minTok[1], pos: i }
      continue
    }
    const plainNum = /^\d{1,2}$/.test(t) ? +t : undefined
    const parsed = parseHM(t) ?? (plainNum !== undefined && ['h', 'hr', 'hrs', 'hora', 'horas'].includes(next) ? { h: plainNum, m: 0, unit: 'h' as const } : undefined)
    const hoursWord = ['hora', 'horas'].includes(next)
    if (parsed) {
      const pm = ['tarde', 'noite'].includes(tokens[i + (hoursWord || next === 'h' ? 2 : 1) + 1] ?? '') && tokens[i + (hoursWord || next === 'h' ? 2 : 1)] === 'da'
      const asTime = () => {
        const h = pm && parsed.h < 12 ? parsed.h + 12 : parsed.h
        if (h <= 23 && parsed.m < 60) time ??= { hm: hm(h, parsed.m), pos: i }
      }
      if (t.includes(':') || TIME_PREV.has(prev)) asTime()
      else if (DURATION_PREV.has(prev) || hoursWord) duration ??= { min: parsed.h * 60 + parsed.m, pos: i }
      else if (CONNECTORS.has(prev)) {
        if (parsed.h <= 4) duration ??= { min: parsed.h * 60 + parsed.m, pos: i }
        else asTime()
      } else if (parsed.h >= 5 && parsed.h <= 23) asTime()
      else duration ??= { min: parsed.h * 60 + parsed.m, pos: i }
      continue
    }
    if (plainNum !== undefined && TIME_PREV.has(prev) && plainNum <= 23) {
      const pm = tokens[i + 1] === 'da' && ['tarde', 'noite'].includes(tokens[i + 2] ?? '') && plainNum < 12
      time ??= { hm: hm(pm ? plainNum + 12 : plainNum, 0), pos: i }
    }
  }
  return { time, duration }
}

function period(tokens: string[]): Lexed['period'] {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const prev = tokens[i - 1] ?? ''
    if (t === 'cedo' || t === 'cedinho') return { period: 'manha', pos: i }
    if (t === 'manha' && ['de', 'pela', 'na', 'a'].includes(prev)) return { period: 'manha', pos: i }
    if (t === 'almoco') return { period: 'almoco', pos: i }
    if (t === 'tarde' && ['de', 'a', 'na', 'pela', 'a'].includes(prev) && tokens[i - 2] !== 'as') return { period: 'tarde', pos: i }
    if (t === 'noite' || t === 'noitinha') {
      if (tokens[i - 1] === 'da' && /^\d/.test(tokens[i - 2] ?? '')) continue
      return { period: 'noite', pos: i }
    }
    if (t === 'fim' && tokens[i + 1] === 'do' && tokens[i + 2] === 'dia') return { period: 'noite', pos: i }
  }
  return undefined
}

function modalityMentions(db: DB, tokens: string[]): ModMention[] {
  const mods = db.profile.modalities.filter((m) => m.active)
  const words = mods.map((m) => ({ m, own: [m.id, ...normalize(m.label).split(/[^a-z0-9]+/)], all: modalityWords(m) }))
  const out: ModMention[] = []
  tokens.forEach((tok, pos) => {
    const s = stem(tok)
    const owners = words.filter((w) => w.all.some((x) => x === tok || stem(x) === s))
    if (!owners.length) return
    const best = owners.find((w) => w.own.includes(tok) || w.own.includes(s)) ?? owners[0]
    out.push({ id: best.m.id, ids: owners.map((w) => w.m.id), pos, word: tok })
  })
  return out
}

function hasPhrase(tokens: string[], phrase: string[]): number {
  for (let i = 0; i + phrase.length <= tokens.length; i++) if (phrase.every((p, j) => tokens[i + j] === p)) return i
  return -1
}

const QUESTION_START = new Set(['quando', 'qual', 'quais', 'quanto', 'quantos', 'quantas', 'como', 'onde', 'porque', 'que', 'o', 'tem', 'tenho'])

export function lex(db: DB, raw: string, today: DateKey): Lexed {
  const tokens = tokenizeAdjust(raw)
  const days: DayMention[] = []
  for (let i = 0; i < tokens.length; i++) {
    const d = resolveDay(tokens, i, today)
    if (d) {
      days.push({ date: d.date, pos: i })
      i += d.len - 1
    }
  }
  const { time, duration } = numbers(tokens)
  const swapVerbAt = tokens.findIndex((t) => SWAP_VERBS.some((v) => t.startsWith(v)))
  const moveVerbAt = tokens.findIndex((t) => MOVE_EXACT.has(t))
  let insteadAt: number | undefined
  for (const phrase of [['em', 'vez', 'de'], ['em', 'vez', 'do'], ['em', 'vez', 'da'], ['ao', 'inves', 'de'], ['ao', 'inves', 'do'], ['ao', 'inves', 'da'], ['no', 'lugar', 'de'], ['no', 'lugar', 'do'], ['no', 'lugar', 'da']]) {
    const at = hasPhrase(tokens, phrase)
    if (at >= 0) {
      insteadAt = at + 3
      break
    }
  }
  const nao = tokens.indexOf('nao')
  const skip =
    tokens.some((t) => SKIP_EXACT.has(t)) ||
    hasPhrase(tokens, ['sem', 'treino']) >= 0 ||
    (nao >= 0 && ['vou', 'vai', 'rola', 'da', 'consigo', 'quero', 'treino'].includes(tokens[nao + 1] ?? '') && insteadAt === undefined)
  let becomesAt: number | undefined
  for (const phrase of [['vai', 'ser'], ['fica', 'pro'], ['fica', 'pra'], ['fica', 'para'], ['vai', 'pro'], ['vai', 'pra']]) {
    const at = hasPhrase(tokens, phrase)
    if (at >= 0) {
      becomesAt = at + phrase.length
      break
    }
  }
  const trimmed = raw.trim()
  const isQuestion = trimmed.endsWith('?') && QUESTION_START.has(tokens[0] ?? '')
  return {
    raw,
    tokens,
    days,
    time,
    duration,
    period: period(tokens),
    mods: modalityMentions(db, tokens),
    longAt: tokens.flatMap((t, i) => (LONG_WORDS.has(t) ? [i] : [])),
    genericAt: tokens.flatMap((t, i) => (GENERIC_TRAINING.has(t) ? [i] : [])),
    swapVerbAt: swapVerbAt >= 0 ? swapVerbAt : undefined,
    moveVerbAt: moveVerbAt >= 0 ? moveVerbAt : undefined,
    insteadAt,
    skip,
    becomesAt,
    isQuestion,
  }
}

/** Split "vou nadar cedo e fazer perna à noite" into clauses (only when both sides name a training). */
export function splitClauses(raw: string): string[] {
  const parts = raw.split(/\s+e\s+|;\s*|,\s+e\s+/i).map((s) => s.trim()).filter(Boolean)
  return parts.length > 1 ? parts : [raw]
}
