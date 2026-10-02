import { describe, expect, it } from 'vitest'
import { defaultProfile } from '@/data/defaults'
import type { FeatureFlags } from '@/data/types'
import { isAdminConsentError, PROVIDER_ORDER, PROVIDERS, providerStatus, statusLabel } from './registry'

const flags = (over: Partial<FeatureFlags> = {}): FeatureFlags => ({ ...defaultProfile().featureFlags, ...over })
const API = { apiUrl: 'https://x.supabase.co/functions/v1' }

describe('providerStatus', () => {
  it('ICS is local and works offline', () => {
    expect(providerStatus('ics', flags(), {})).toEqual({ status: 'connected', message: 'Funciona offline' })
    expect(statusLabel('ics', providerStatus('ics', flags({ icsEnabled: false }), {}))).toBe('Funciona offline')
  })

  it('Toki and Apple are honest "coming soon"', () => {
    expect(providerStatus('toki', flags(), API).status).toBe('coming_soon')
    expect(providerStatus('apple', flags(), API).status).toBe('coming_soon')
    expect(statusLabel('apple', providerStatus('apple', flags(), API))).toBe('Disponível em breve')
  })

  it('flag off → needs_config, whatever the backend says', () => {
    expect(providerStatus('google', flags(), API, { status: 'connected' }).status).toBe('needs_config')
  })

  it('flag on without backend URL → needs_config ("Configuração necessária")', () => {
    const s = providerStatus('google', flags({ googleCalendarEnabled: true }), {})
    expect(s.status).toBe('needs_config')
    expect(statusLabel('google', s)).toBe('Configuração necessária')
  })

  it('flag on + backend URL but no Supabase Auth session → needs_config (no fake Conectar)', () => {
    const s = providerStatus('google', flags({ googleCalendarEnabled: true }), { ...API, signedIn: false })
    expect(s.status).toBe('needs_config')
    expect(s.message).toMatch(/login/)
  })

  it('flag on + backend → needs_auth until the backend reports a connection', () => {
    const f = flags({ microsoftCalendarEnabled: true, outlookMailEnabled: true, organizzeEnabled: true })
    expect(providerStatus('microsoft', f, API).status).toBe('needs_auth')
    expect(providerStatus('microsoft', f, API, { status: 'connected' }).status).toBe('connected')
    expect(providerStatus('outlook', f, API, { status: 'policy_blocked' })).toEqual({
      status: 'policy_blocked',
      message: 'Indisponível pela política da organização',
    })
    expect(providerStatus('organizze', f, API, { status: 'error', error: 'Token inválido' })).toEqual({ status: 'error', message: 'Token inválido' })
  })

  it('every provider has docs, permissions and storage disclosure', () => {
    for (const id of PROVIDER_ORDER) {
      const p = PROVIDERS[id]
      expect(p.docsUrl).toMatch(/^https:\/\//)
      expect(p.stores.length).toBeGreaterThan(0)
      expect(p.permissions.length).toBeGreaterThan(0)
    }
  })

  it('work mail requests metadata-only, read-only permission', () => {
    expect(PROVIDERS.outlook.permissions).toContain('Mail.ReadBasic')
    expect(PROVIDERS.outlook.permissions.join(' ')).not.toMatch(/Mail\.Send|ReadWrite/)
    expect(PROVIDERS.teams.permissions.join(' ')).not.toMatch(/ChannelMessage|Send|ReadWrite/)
  })
})

describe('isAdminConsentError', () => {
  it('detects tenant consent blocks', () => {
    expect(isAdminConsentError('access_denied', 'AADSTS90094: The grant requires admin permission.')).toBe(true)
    expect(isAdminConsentError('access_denied', 'AADSTS90095: Admin consent is required')).toBe(true)
    expect(isAdminConsentError('invalid_grant', 'AADSTS65001: The user or administrator has not consented')).toBe(true)
    expect(isAdminConsentError('consent_required', null)).toBe(true)
    expect(isAdminConsentError('access_denied', 'AADSTS65004: User declined to consent')).toBe(false)
  })
})
