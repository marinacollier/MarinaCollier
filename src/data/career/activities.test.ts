import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate, useStore } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { busyIntervals } from '../intel/context'
import { planWeek } from '../intel/planner'
import { isCareerQuota } from '../selectors'
import { groupTasks } from '@/features/tasks/groups'
import { CAREER_SEED_IDS } from '@/features/career/seed'
import { logCareerActivity, weekLine, weekProgress } from './activities'
import { addDays, hmToMinutes } from '@/lib/date'

const MON = '2026-10-12'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-10-09'))
})

describe('career activities (reusing tasks)', () => {
  it('seeds only what she stated: North Star + 4 weekly targets + monthly review', () => {
    const db = getDB()
    expect(db.goals.find((g) => g.id === CAREER_SEED_IDS.northStar)?.title).toMatch(/Head of Product/)
    expect(weekProgress(db, MON).map((p) => [p.kind, p.target, p.unit])).toEqual([
      ['ingles_exec', 3, 'vezes'],
      ['networking', 1, 'vezes'],
      ['post', 2, 'vezes'],
      ['lideranca', 60, 'min'],
    ])
    expect(db.tasks.find((t) => t.id === CAREER_SEED_IDS.review)?.recurrence).toEqual({ kind: 'monthly', dayOfMonth: 'last' })
  })

  it('targets are never listed as open to-dos', () => {
    const quotas = getDB().tasks.filter(isCareerQuota)
    expect(quotas).toHaveLength(4)
    const listed = JSON.stringify(groupTasks(getDB(), MON))
    for (const q of quotas) expect(listed.includes(q.id)).toBe(false)
  })

  it('logging counts toward the week (minutes add up), with one undo, no percentages', () => {
    const r = logCareerActivity('ingles_exec', MON, { minutes: 30 })!
    logCareerActivity('lideranca', MON, { minutes: 20 })
    logCareerActivity('lideranca', MON, { minutes: 10 })
    const p = weekProgress(getDB(), MON)
    expect(p.find((x) => x.kind === 'ingles_exec')).toMatchObject({ done: 1, remaining: 2 })
    expect(p.find((x) => x.kind === 'lideranca')).toMatchObject({ done: 30, remaining: 30 })
    expect(weekLine(p)).toBe('Inglês executivo 1/3 · Networking 0/1 · Conteúdo profissional 0/2 · Desenvolvimento de liderança 30/60 min')
    r.undo()
    expect(weekProgress(getDB(), MON).find((x) => x.kind === 'ingles_exec')?.done).toBe(0)
  })

  it('her real week (Cerâmica Mon/Thu evenings, presencial Tue/Wed, key sessions) is NOT filled up', () => {
    const w = planWeek(getDB(), { date: MON, minutes: 8 * 60 }, MON)
    w.apply()
    const focus = getDB().tasks.filter((t) => t.date && t.date >= MON && t.date <= addDays(MON, 6) && (t.context === 'estudo' || t.context === 'carreira'))
    const perDay = new Map<string, number>()
    for (const t of focus) perDay.set(t.date!, (perDay.get(t.date!) ?? 0) + 1)
    expect(Math.max(0, ...perDay.values()), 'one focus block per day at most').toBeLessThanOrEqual(1)
    expect(w.summary).toMatch(/Metas de carreira seguem flexíveis/)
  })

  it('with room in the week, sessions go only into free windows: never presencial/rest, never near key sessions, max 3, two evenings stay free', () => {
    // A week without Cerâmica (e.g. on vacation from it): evenings open up.
    useStore.setState({ db: { ...getDB(), events: getDB().events.filter((e) => !/cer[aâ]mica/i.test(e.title)) } })
    const before = structuredClone(getDB())
    const w = planWeek(before, { date: MON, minutes: 8 * 60 }, MON)
    const careerItems = w.days.flatMap((d) => d.items.filter((i) => i.isNew && /Inglês executivo|Networking|Conteúdo profissional|liderança/.test(i.title)).map((i) => ({ ...i, date: d.date })))
    expect(careerItems.length).toBeGreaterThan(0)
    expect(careerItems.length).toBeLessThanOrEqual(3)
    // Nothing written yet.
    expect(getDB().tasks.filter((t) => t.careerParentId)).toHaveLength(0)
    const undo = w.apply()
    const sessions = getDB().tasks.filter((t) => t.careerParentId)
    expect(sessions.length).toBe(careerItems.length)
    const focusDays = new Set(getDB().tasks.filter((t) => t.date && t.date >= MON && t.date <= addDays(MON, 6) && (t.context === 'estudo' || t.context === 'carreira')).map((t) => t.date))
    expect(7 - focusDays.size, 'evenings left alone').toBeGreaterThanOrEqual(2)
    for (const s of sessions) {
      const wd = new Date(`${s.date}T12:00:00Z`).getUTCDay()
      expect([2, 3]).not.toContain(wd) // Tue/Wed presencial
      const others = { ...getDB(), tasks: getDB().tasks.filter((t) => t.id !== s.id) }
      const start = hmToMinutes(s.time!)
      const overlaps = busyIntervals(others, s.date!).some((b) => start < b.end && start + (s.durationMin ?? 30) > b.start)
      expect(overlaps, `${s.title} ${s.date} ${s.time}`).toBe(false)
      for (const k of getDB().workouts.filter((x) => x.date === s.date && (x.isKeySession || x.isLongSession) && x.time)) {
        const ks = hmToMinutes(k.time!)
        expect(Math.abs(start - ks), `${s.title} near ${k.modality}`).toBeGreaterThanOrEqual(120)
      }
    }
    expect(getDB().workouts.filter((x) => before.workouts.some((b) => b.id === x.id))).toEqual(before.workouts)
    expect(getDB().events).toEqual(before.events)
    undo()
    expect(getDB().tasks.filter((t) => t.careerParentId)).toHaveLength(0)
  })

  it('running the planner twice never duplicates sessions', () => {
    planWeek(getDB(), { date: MON, minutes: 480 }, MON).apply()
    const n = getDB().tasks.filter((t) => t.careerParentId).length
    planWeek(getDB(), { date: MON, minutes: 480 }, MON).apply()
    expect(getDB().tasks.filter((t) => t.careerParentId).length).toBe(n)
  })

  it('a placed session done counts once (same record), not twice', () => {
    useStore.setState({ db: { ...getDB(), events: getDB().events.filter((e) => !/cer[aâ]mica/i.test(e.title)) } })
    planWeek(getDB(), { date: MON, minutes: 480 }, MON).apply()
    const s = getDB().tasks.find((t) => t.careerKind === 'ingles_exec' && t.careerParentId)!
    logCareerActivity('ingles_exec', s.date!, { minutes: 30 })
    expect(getDB().tasks.find((t) => t.id === s.id)?.status).toBe('done')
    expect(weekProgress(getDB(), MON).find((x) => x.kind === 'ingles_exec')?.done).toBe(1)
  })
})
