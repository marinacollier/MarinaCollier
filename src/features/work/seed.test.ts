import { describe, expect, it } from 'vitest'
import { createSeedContext } from '@/data/seed/context'
import { SEED_IDS } from '@/data/seed/ids'
import { seedWork } from './seed'

describe('seedWork', () => {
  const part = seedWork(createSeedContext('2026-10-02'))

  it('seeds the five professional fronts with stable ids', () => {
    expect(part.projects?.map((p) => p.id)).toEqual([
      SEED_IDS.projSantander,
      SEED_IDS.projFashionFinder,
      SEED_IDS.projDayOne,
      SEED_IDS.projYoga,
      SEED_IDS.projUGC,
    ])
    const ff = part.projects?.find((p) => p.id === SEED_IDS.projFashionFinder)
    expect(ff?.role).toBe('Produto + Tecnologia · CTPO')
    expect(part.projects?.find((p) => p.id === SEED_IDS.projUGC)?.kind).toBe('creator')
  })

  it('invents no deadlines, deliveries, wins or inbox items', () => {
    for (const p of part.projects ?? []) {
      expect(p.deadline).toBeUndefined()
      expect(p.nextDelivery).toBeUndefined()
    }
    expect(part.wins ?? []).toHaveLength(0)
    expect(part.workInbox ?? []).toHaveLength(0)
  })

  it('example project tasks are review items; routines are recurring work tasks', () => {
    const tasks = part.tasks ?? []
    const projectTasks = tasks.filter((t) => t.projectId)
    expect(projectTasks.length).toBeGreaterThanOrEqual(5)
    expect(projectTasks.every((t) => t.status === 'review' && t.context === 'trabalho' && !t.dueDate)).toBe(true)
    const ceo = tasks.find((t) => t.title === 'Weekly CEO Review')
    expect(ceo?.recurrence).toEqual({ kind: 'weekly', weekdays: [6] })
    expect(ceo?.time).toBe('09:00')
    const board = tasks.find((t) => t.title === 'Monthly Board')
    expect(board?.recurrence).toEqual({ kind: 'monthly', dayOfMonth: 'last' })
    expect(board?.time).toBe('20:00')
    expect(board?.context).toBe('trabalho')
  })
})
