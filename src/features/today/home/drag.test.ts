import { describe, expect, it } from 'vitest'
import { dropTime, indexAt, reorder } from './drag'

const rows = [
  { start: '09:00', end: '10:00' }, // 0
  { start: '11:00', end: '11:45' }, // 1
  { start: '14:00', end: '14:30' }, // 2 — the one we drag (30 min)
  { start: '16:07', end: '16:22' }, // 3
]

describe('dropTime', () => {
  it('puts the line right after the previous line ends, keeping its length', () => {
    // 14:00 → between 09:00–10:00 and 11:00: starts at 10:00, still 30 min.
    expect(dropTime(rows, 2, 1)).toEqual({ start: '10:00', end: '10:30' })
  })

  it('moves down: after the new previous line', () => {
    expect(dropTime(rows, 0, 2)).toEqual({ start: '14:30', end: '15:30' })
  })

  it('rounds up to 5 minutes', () => {
    // After 16:07–16:22 → 16:25.
    expect(dropTime(rows, 2, 3)).toEqual({ start: '16:25', end: '16:55' })
  })

  it('at the top: before the next line, minus its own length (rounded down)', () => {
    expect(dropTime(rows, 2, 0)).toEqual({ start: '08:30', end: '09:00' })
    const odd = [{ start: '09:07', end: '09:30' }, { start: '12:00', end: '12:20' }]
    expect(dropTime(odd, 1, 0)).toEqual({ start: '08:45', end: '09:05' })
  })

  it('unknown length: keeps only the start (and a neighbour without an end counts as 30 min)', () => {
    const r = [{ start: '08:00' }, { start: '10:00', end: '10:40' }, { start: '15:00' }]
    expect(dropTime(r, 0, 1)).toEqual({ start: '10:40' })
    expect(dropTime(r, 2, 1)).toEqual({ start: '08:30' })
    expect(dropTime(r, 1, 1)).toBeUndefined()
    expect(dropTime(r, 2, 0)).toEqual({ start: '07:30' })
    expect(dropTime([{ start: '12:00' }, { start: '13:00' }, { start: '08:00' }], 2, 1)).toEqual({ start: '12:30' })
  })

  it('skips neighbours without a time and clamps to the day', () => {
    const r = [{ start: '22:00', end: '23:50' }, { start: '99:99' }, { start: '10:00', end: '11:00' }]
    expect(dropTime(r, 2, 2)).toBeUndefined()
    expect(dropTime(r, 2, 1)).toEqual({ start: '23:50', end: '23:59' })
  })

  it('nothing changes: same place, a line without a time, or no anchor', () => {
    expect(dropTime(rows, 1, 1)).toBeUndefined()
    expect(dropTime([{ start: '—' }, { start: '10:00' }], 0, 1)).toBeUndefined()
    expect(dropTime([{ start: '10:00' }], 0, 0)).toBeUndefined()
  })
})

describe('helpers', () => {
  it('reorder is an array move', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorder(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })
  it('indexAt counts the midpoints above the pointer', () => {
    expect(indexAt([20, 60, 100], 10)).toBe(0)
    expect(indexAt([20, 60, 100], 70)).toBe(2)
    expect(indexAt([20, 60, 100], 500)).toBe(3)
  })
})
