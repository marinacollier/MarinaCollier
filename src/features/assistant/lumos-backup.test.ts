import { describe, expect, it } from 'vitest'
import { buildSeed } from '@/data/seed'
import { respond } from './act/respond'

const now = { date: '2026-10-09', minutes: 600 }

describe('Lumos · backup', () => {
  it('"gera meu backup" offers the real button (never claims it already saved)', () => {
    const db = buildSeed('2026-10-09')
    const r = respond(db, 'gera meu backup', now, {})!
    expect(r.text).toMatch(/^Você ainda não gerou nenhum backup\./)
    expect(r.text).not.toMatch(/salvei|pronto/i)
    expect(r.options?.[0].label).toBe('Gerar backup agora')
  })
  it('"quando foi meu último backup?" answers from the profile', () => {
    const db = buildSeed('2026-10-09')
    const withBackup = { ...db, profile: { ...db.profile, lastBackupAt: new Date(Date.now() - 3 * 86_400_000).toISOString() } }
    expect(respond(withBackup, 'quando foi meu último backup?', now, {})!.text).toBe('Seu último backup foi há 3 dias.')
  })
})
