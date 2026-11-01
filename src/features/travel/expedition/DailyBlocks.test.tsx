import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { buildSeed } from '@/data/seed'
import { applyExpeditionSeed } from '@/data/seed/expedition'
import { applyMaster1031 } from '@/data/seed/master-1031'
import { SEED_IDS } from '@/data/seed/ids'
import { getDB, useStore } from '@/data/store'
import { DailyBlocksList } from './DailyBlocks'
import { dailyKey, dailyPlan } from './daily'

afterEach(cleanup)

describe('daily blocks with ticks', () => {
  it('ticking a block stores one occurrence for that day; unticking removes it', () => {
    const at = '2026-11-01T10:00:00.000Z'
    useStore.setState({ db: applyMaster1031(applyExpeditionSeed(buildSeed('2026-10-27'), at), '2026-10-31', at), hydrated: true })
    const db = getDB()
    const trip = db.trips.find((t) => t.id === SEED_IDS.tripAfrica)!
    const plan = dailyPlan(trip, db.tripItems, db.workouts, db.occurrences, '2026-11-03')!
    render(<DailyBlocksList trip={trip} plan={plan} />)
    expect(screen.getByText('blocos obrigatórios')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inglês individual · 30 min' }))
    const occ = () => getDB().occurrences.filter((o) => o.parentId === dailyKey(trip.id, 'ingles'))
    expect(occ()).toMatchObject([{ parentType: 'item', date: '2026-11-03', status: 'done' }])
    cleanup()
    const after = getDB()
    render(<DailyBlocksList trip={trip} plan={dailyPlan(trip, after.tripItems, after.workouts, after.occurrences, '2026-11-03')!} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inglês individual · 30 min' }))
    expect(occ()).toEqual([])
  })
})
