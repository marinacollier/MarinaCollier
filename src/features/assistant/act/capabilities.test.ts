import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { CAPABILITIES } from './capabilities'
import { HANDLERS } from './respond'
import { understand } from '../router'

describe('Lumos Capability Registry', () => {
  it('every capability points at a real handler or engine', () => {
    const ids = new Set(HANDLERS.map((h) => h.id))
    for (const c of CAPABILITIES) expect(c.handler ? ids.has(c.handler) : !!c.via, c.id).toBe(true)
  })
  it('every example sentence is understood (not the generic fallback)', () => {
    const db = buildSeed('2026-10-12')
    for (const c of CAPABILITIES) expect(understand(db, c.example, '2026-10-12', 600).kind, `${c.id}: ${c.example}`).not.toBe('answer')
  })
})
