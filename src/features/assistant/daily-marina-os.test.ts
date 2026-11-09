/**
 * DAILY MARINA OS — Lumos' morning answer: 8 sections in order, every line tagged
 * (confirmado / planejado / sugerido / concluído / adiado), ended projects out, rest said kindly,
 * Luna without invented times, finance respecting the lock, conflicts and overload, trip-day clock.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Now } from '@/data/intel'
import { buildSeed } from '@/data/seed'
import { SEED_IDS } from '@/data/seed/ids'
import { applyModuleSeeds, getDB, useStore } from '@/data/store'
import type { CalendarEvent, DB, PetTask, Task, Workout } from '@/data/types'
import { pickPriorities } from './act/handlers/day'
import { ask, clearConversation, useConversation } from './conversation'
import { briefingTimeOf, DAILY_TAGS, DAILY_TITLES, dailyBriefing, isBriefingWindow, type DailySection, type DailySectionKey } from './day/daily'

const DAY = '2026-11-27' // Friday, after the trip; Fashion Finder is expected on 30/11
const NOW: Now = { date: DAY, minutes: 6 * 60 + 20, iso: `${DAY}T06:20:00.000-03:00` }
const ORDER: DailySectionKey[] = ['agenda', 'prioridades', 'projetos', 'treino', 'estudo', 'luna', 'financas', 'alertas']
const stamp = { createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }

function ev(id: string, title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, ...stamp, sourceId: SEED_IDS.sourceLocal, title, date: DAY, startTime: start, endTime: end, allDay: false, ...extra }
}
function task(db: DB, id: string, title: string, extra: Partial<Task>): Task {
  const base = db.tasks[0]
  return { ...base, ...stamp, id, title, status: 'todo', date: DAY, time: undefined, dueDate: undefined, recurrence: undefined, projectId: undefined, planType: undefined, postponedFrom: undefined, bucket: undefined, needsMe: undefined, waiting: undefined, context: undefined, ...extra } as Task
}

function fixture(): DB {
  const db = applyModuleSeeds(buildSeed(DAY), DAY)
  const pet: PetTask = { id: 'pt-creche', ...stamp, petId: SEED_IDS.petLuna, title: 'Luna na creche', category: (db.petTasks[0]?.category ?? 'outro') as PetTask['category'], dueDate: DAY, active: true, order: 0 }
  const run: Workout = { id: 'w-run', ...stamp, date: DAY, time: '06:30', modality: 'corrida', status: 'planejado', title: 'Rodagem leve', order: 0 }
  return {
    ...db,
    events: [
      ...db.events,
      ev('e-board', 'Reunião com o board', '10:00', '11:00'),
      ev('e-cafe', 'Café com a Ju', '10:30', '11:30', { planType: 'flexivel' }),
      ev('e-ingles', 'Aula de Inglês', '19:00', '20:00'),
    ],
    tasks: [
      ...db.tasks,
      task(db, 't-ff', 'Revisar roadmap FF', { projectId: SEED_IDS.projFashionFinder, context: 'trabalho' }),
      task(db, 't-ff-done', 'Mandar status FF', { projectId: SEED_IDS.projFashionFinder, context: 'trabalho', status: 'done', completedAt: `${DAY}T05:00:00.000Z` }),
      task(db, 't-ff-late', 'Ajustar deck FF', { projectId: SEED_IDS.projFashionFinder, context: 'trabalho', postponedFrom: '2026-11-25' }),
      task(db, 't-san', 'Épicos do Santander', { projectId: SEED_IDS.projSantander, context: 'trabalho' }),
    ],
    priorities: [
      { id: 'p1', ...stamp, date: DAY, title: 'Fechar proposta', order: 0, done: false },
      { id: 'p2', ...stamp, date: DAY, title: 'Treino-chave', order: 1, done: true },
      { id: 'p3', ...stamp, date: DAY, title: 'Ligar pro contador', order: 2, done: false },
    ],
    workouts: [...db.workouts.filter((w) => w.date !== DAY), run],
    petTasks: [...db.petTasks, pet],
  }
}

const brief = (db: DB, now: Now = NOW, financeLocked = false) => dailyBriefing(db, now, { financeLocked, suggest: pickPriorities })
const section = (s: DailySection[], k: DailySectionKey) => s.find((x) => x.key === k)
const texts = (s?: DailySection) => (s?.lines ?? []).map((l) => l.text)
const lineOf = (s: DailySection[], text: string) => s.flatMap((x) => x.lines).find((l) => l.text === text)

describe('Daily MARINA OS', () => {
  it('has the 8 sections, in order', () => {
    const b = brief(fixture())
    expect(b.date).toBe(DAY)
    expect(b.sections.map((s) => s.key)).toEqual(ORDER)
    expect(b.sections.map((s) => s.title)).toEqual(ORDER.map((k) => DAILY_TITLES[k]))
  })

  it('every line carries one honest tag, also written in its sub line', () => {
    const b = brief(fixture())
    for (const l of b.sections.flatMap((s) => s.lines).filter((l) => l.tag)) {
      expect(DAILY_TAGS).toContain(l.tag)
      expect(l.sub?.split(' · ')).toContain(l.tag)
    }
  })

  it('1 · agenda: real calendar entries, confirmed only when the record says so', () => {
    const s = brief(fixture()).sections
    const agenda = section(s, 'agenda')!
    expect(texts(agenda)).toEqual(expect.arrayContaining(['Reunião com o board', 'Café com a Ju']))
    expect(lineOf(s, 'Reunião com o board')).toMatchObject({ tag: 'confirmado', sub: 'confirmado · 10:00–11:00' })
    expect(lineOf(s, 'Café com a Ju')?.tag).toBe('planejado') // flexível → never "confirmado"
  })

  it('2 · priorities: max 3, done ones as concluído; without a choice, up to 3 suggestions tagged sugerido', () => {
    const db = fixture()
    const chosen = section(brief(db).sections, 'prioridades')!
    expect(chosen.lines).toHaveLength(3)
    expect(chosen.lines.map((l) => l.tag)).toEqual(['planejado', 'concluído', 'planejado'])
    const open = section(brief({ ...db, priorities: [] }).sections, 'prioridades')
    expect(open?.lines.length ?? 0).toBeLessThanOrEqual(3)
    for (const l of open?.lines ?? []) expect(l.tag).toBe('sugerido')
  })

  it('3 · work by project: grouped under the project, Santander (ended) left out, adiado/concluído from the task', () => {
    const s = brief(fixture()).sections
    const proj = section(s, 'projetos')!
    expect(texts(proj)).toEqual(expect.arrayContaining(['Revisar roadmap FF', 'Mandar status FF', 'Ajustar deck FF']))
    expect(proj.lines.find((l) => l.text === 'Revisar roadmap FF')?.sub).toMatch(/^Fashion ?Finder · planejado/i)
    expect(lineOf(s, 'Mandar status FF')?.tag).toBe('concluído')
    expect(lineOf(s, 'Ajustar deck FF')?.tag).toBe('adiado')
    expect(JSON.stringify(s)).not.toMatch(/Santander/)
  })

  it('4 · training: today\'s workout; a rest day is said kindly (never a failure)', () => {
    const db = fixture()
    const s = brief(db).sections
    expect(lineOf(s, 'Rodagem leve')).toMatchObject({ tag: 'planejado' })
    const rest: Workout = { id: 'w-rest', ...stamp, date: DAY, modality: 'recuperacao', status: 'descanso', title: 'Descanso', order: 0 }
    const off = section(brief({ ...db, weekTemplate: [], workouts: [rest] }).sections, 'treino')!
    expect(off.lines).toHaveLength(1)
    expect(off.lines[0].sub).toMatch(/descansar também é treino/)
    expect(JSON.stringify(off)).not.toMatch(/falh|perdeu|atras/i)
    const none = section(brief({ ...db, weekTemplate: [], workouts: [] }).sections, 'treino')!
    expect(none.lines[0]).toMatchObject({ tag: 'sugerido' })
    expect(none.lines[0].sub).toMatch(/descanso também conta/)
  })

  it('5 · language or college: Inglês lands here (not in the agenda)', () => {
    const s = brief(fixture()).sections
    expect(texts(section(s, 'estudo'))).toContain('Aula de Inglês')
    expect(texts(section(s, 'agenda'))).not.toContain('Aula de Inglês')
  })

  it('6 · Luna: her care of the day, never an invented time', () => {
    const luna = section(brief(fixture()).sections, 'luna')!
    const l = luna.lines.find((x) => x.text === 'Luna na creche')!
    expect(l.sub).toBe('planejado · sem horário')
  })

  it('7 · finance: due in 3 days with amount; locked → no titles, no amounts', () => {
    const open = section(brief(fixture()).sections, 'financas')!
    expect(open.lines.some((l) => /Fashion Finder/.test(l.text) && /R\$/.test(l.sub ?? '') && /em 3 dias/.test(l.sub ?? ''))).toBe(true)
    const locked = section(brief(fixture(), NOW, true).sections, 'financas')!
    expect(locked.lines).toHaveLength(1)
    expect(JSON.stringify(locked)).not.toMatch(/R\$|Fashion/)
    expect(locked.lines[0].sub).toMatch(/bloqueadas/)
  })

  it('8 · alerts: today\'s overlap, and a day over 100% of her awake time', () => {
    const db = fixture()
    const s = brief(db).sections
    expect(section(s, 'alertas')!.lines.some((l) => /Reunião com o board e Café com a Ju/.test(l.text))).toBe(true)
    const heavy = { ...db, events: [...db.events, ev('e-maratona', 'Imersão o dia todo', '03:00', '23:59')] }
    const b = brief(heavy)
    expect(b.loadPct).toBeGreaterThan(100)
    expect(section(b.sections, 'alertas')!.lines.some((l) => /acima da capacidade/.test(l.text))).toBe(true)
  })

  it('a light day keeps only agenda and training (empty sections are left out)', () => {
    const db = fixture()
    const empty: DB = { ...db, events: [], tasks: [], priorities: [], petTasks: [], workouts: [], weekTemplate: [], contracts: [], expenses: [], projects: [] }
    const keys = brief(empty).sections.map((s) => s.key)
    expect(keys[0]).toBe('agenda')
    expect(keys).toContain('treino')
    expect(keys).not.toContain('luna')
  })

  it('trip day: uses the trip\'s local day (Cape Town) — 23:30 in São Paulo is already the next day there', () => {
    const d = '2026-10-29'
    const db = applyModuleSeeds(buildSeed(d), d)
    const b = dailyBriefing(db, { date: d, minutes: 23 * 60 + 30, iso: `${d}T23:30:00.000-03:00` })
    expect(b.timeZone).toBe('Africa/Johannesburg')
    expect(b.date).toBe('2026-10-30')
  })

  it('briefing time: default 06:15, configurable, used for the morning window', () => {
    const db = fixture()
    expect(briefingTimeOf(db)).toBe('06:15')
    expect(isBriefingWindow(db, 6 * 60)).toBe(false)
    expect(isBriefingWindow(db, 6 * 60 + 15)).toBe(true)
    const late = { ...db, profile: { ...db.profile, briefingTime: '07:30' } }
    expect(briefingTimeOf(late)).toBe('07:30')
    expect(isBriefingWindow(late, 7 * 60)).toBe(false)
  })
})

describe('through Lumos', () => {
  beforeEach(() => {
    useStore.setState({ db: fixture(), hydrated: true })
    clearConversation()
  })
  const reply = () => useConversation.getState().exchanges.at(-1)!.lumos!.reply

  it('"bom dia" and "o que eu tenho hoje?" answer with the Daily MARINA OS sections', () => {
    ask('bom dia', NOW)
    expect(reply().text).toMatch(/^Bom dia\./)
    expect(reply().sections?.map((s) => s.title)).toEqual(ORDER.map((k) => DAILY_TITLES[k]))
    ask('o que eu tenho hoje?', NOW)
    expect(reply().sections?.[0].title).toBe(DAILY_TITLES.agenda)
  })

  it('"meu briefing às 6h30" stores the time (with Desfazer); asking tells it', () => {
    ask('meu briefing às 6h30', NOW)
    expect(reply().text).toMatch(/06:30/)
    expect(getDB().profile.briefingTime).toBe('06:30')
    ask('que horas é meu briefing?', NOW)
    expect(reply().text).toMatch(/06:30/)
  })
})
