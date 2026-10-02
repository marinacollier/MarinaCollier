import { describe, expect, it, vi } from 'vitest'
import { createSeedContext } from '@/data/seed/context'
import { BackendError, buildUrl, callBackend, startOAuth } from './backend'
import { seedIntegrations } from './seed'

const env = { apiUrl: 'https://abc.supabase.co/functions/v1', anonKey: 'public-anon' }

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

describe('backend client', () => {
  it('refuses to build URLs when not configured', () => {
    expect(() => buildUrl({}, 'x')).toThrow(BackendError)
  })

  it('builds function URLs with query', () => {
    expect(buildUrl(env, 'organizze-proxy', { op: 'transactions', from: '2026-10-01', skip: undefined })).toBe(
      'https://abc.supabase.co/functions/v1/organizze-proxy?op=transactions&from=2026-10-01',
    )
  })

  it('sends apikey + bearer, never cookies', async () => {
    const f = fakeFetch(200, { ok: true })
    await callBackend('integrations-status', { env, fetchImpl: f as unknown as typeof fetch })
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).apikey).toBe('public-anon')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer public-anon')
  })

  it('maps policy_blocked errors', async () => {
    const f = fakeFetch(403, { error: 'policy_blocked', message: 'Bloqueado pelo admin' })
    await expect(callBackend('ms-mail-actions', { env, fetchImpl: f as unknown as typeof fetch })).rejects.toMatchObject({ code: 'policy_blocked' })
  })

  it('startOAuth only follows the real provider authorize host', async () => {
    const nav = vi.fn()
    const ok = fakeFetch(200, { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1' })
    vi.stubGlobal('fetch', ok)
    await startOAuth('google', { returnTo: 'https://app/ajustes/integracoes', env, navigate: nav })
    expect(nav).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?client_id=1')

    vi.stubGlobal('fetch', fakeFetch(200, { url: 'https://evil.example.com/login' }))
    await expect(startOAuth('google', { returnTo: 'x', env, navigate: nav })).rejects.toBeInstanceOf(BackendError)
    vi.unstubAllGlobals()
  })
})

describe('seedIntegrations', () => {
  it('one honest row per provider, no scopes', () => {
    const rows = seedIntegrations(createSeedContext('2026-10-02')).integrations!
    expect(rows.map((r) => r.provider).sort()).toEqual(['apple', 'google', 'ics', 'microsoft', 'organizze', 'outlook', 'teams', 'toki'])
    expect(rows.every((r) => r.scopes.length === 0)).toBe(true)
    expect(rows.find((r) => r.provider === 'ics')?.status).toBe('connected')
    expect(rows.find((r) => r.provider === 'google')?.status).toBe('needs_config')
    expect(rows.find((r) => r.provider === 'toki')?.status).toBe('coming_soon')
    expect(rows.some((r) => r.status === 'connected' && r.provider !== 'ics')).toBe(false)
  })
})
