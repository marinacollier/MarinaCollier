/**
 * Service-role database access + user resolution + provider access tokens.
 * Access tokens are minted per request from the encrypted refresh token and never stored or returned.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { decryptSecret, encryptSecret } from './crypto.ts'
import { HttpError, requiredEnv } from './http.ts'

export type AccountProvider = 'google' | 'microsoft' | 'outlook' | 'teams'

let admin: SupabaseClient | null = null
export function db(): SupabaseClient {
  admin ??= createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return admin
}

/** The signed-in Supabase user (from the Authorization bearer JWT). */
export async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) throw new HttpError('unauthorized', 'Faça login no MARINA OS', 401)
  const { data, error } = await db().auth.getUser(jwt)
  if (error || !data.user) throw new HttpError('unauthorized', 'Sessão inválida', 401)
  return { id: data.user.id, email: data.user.email ?? undefined }
}

/** Least privilege for paid calls: only the e-mails in ALLOWED_EMAILS (comma-separated) may use them. */
export function requireAllowed(user: { email?: string }): void {
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (!allowed.length) throw new HttpError('not_configured', 'Defina ALLOWED_EMAILS nos segredos', 500)
  if (!user.email || !allowed.includes(user.email.toLowerCase())) throw new HttpError('policy_blocked', 'Conta sem permissão para este recurso', 403)
}

export interface AccountRow {
  provider: AccountProvider
  account_label: string | null
  status: 'connected' | 'needs_auth' | 'error' | 'policy_blocked'
  scopes: string[]
  refresh_token_encrypted: string | null
  last_sync_at: string | null
  error: string | null
}

export async function getAccount(userId: string, provider: AccountProvider): Promise<AccountRow | null> {
  const { data, error } = await db()
    .from('integration_accounts')
    .select('provider, account_label, status, scopes, refresh_token_encrypted, last_sync_at, error')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new HttpError('upstream', 'Falha ao ler conta', 500)
  return data as AccountRow | null
}

export async function saveAccount(
  userId: string,
  provider: AccountProvider,
  patch: { status: AccountRow['status']; accountLabel?: string; scopes?: string[]; refreshToken?: string; error?: string | null; lastSyncAt?: string },
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, provider, status: patch.status, error: patch.error ?? null }
  if (patch.accountLabel !== undefined) row.account_label = patch.accountLabel
  if (patch.scopes) row.scopes = patch.scopes
  if (patch.refreshToken) row.refresh_token_encrypted = await encryptSecret(patch.refreshToken)
  if (patch.lastSyncAt) row.last_sync_at = patch.lastSyncAt
  const { error } = await db().from('integration_accounts').upsert(row, { onConflict: 'user_id,provider' })
  if (error) throw new HttpError('upstream', 'Falha ao salvar conta', 500)
}

export async function getCursor(userId: string, provider: string, resource: string): Promise<string | null> {
  const { data } = await db().from('sync_state').select('cursor').eq('user_id', userId).eq('provider', provider).eq('resource', resource).maybeSingle()
  return (data?.cursor as string | undefined) ?? null
}

export async function setCursor(userId: string, provider: string, resource: string, cursor: string | null): Promise<void> {
  await db().from('sync_state').upsert({ user_id: userId, provider, resource, cursor }, { onConflict: 'user_id,provider,resource' })
}

// ─── Access tokens ──────────────────────────────────────────────────────────

export function microsoftTokenUrl(): string {
  const tenant = Deno.env.get('MS_TENANT') ?? 'organizations'
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`
}

/** Refresh-token grant → short-lived access token for this request only. */
export async function accessToken(userId: string, provider: AccountProvider): Promise<string> {
  const acc = await getAccount(userId, provider)
  if (acc?.status === 'policy_blocked') throw new HttpError('policy_blocked', 'Indisponível pela política da organização', 403)
  if (!acc?.refresh_token_encrypted) throw new HttpError('needs_auth', 'Conecte a conta primeiro', 401)
  const refresh = await decryptSecret(acc.refresh_token_encrypted)

  const isGoogle = provider === 'google'
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: requiredEnv(isGoogle ? 'GOOGLE_CLIENT_ID' : 'MS_CLIENT_ID'),
    client_secret: requiredEnv(isGoogle ? 'GOOGLE_CLIENT_SECRET' : 'MS_CLIENT_SECRET'),
  })
  if (!isGoogle) body.set('scope', acc.scopes.join(' '))
  const res = await fetch(isGoogle ? 'https://oauth2.googleapis.com/token' : microsoftTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const tok = await res.json()
  if (!res.ok) {
    const desc = `${tok.error ?? ''} ${tok.error_description ?? ''}`
    if (/AADSTS(90094|90095|65001)\b/.test(desc)) {
      await saveAccount(userId, provider, { status: 'policy_blocked', error: 'Bloqueado pela política da organização' })
      throw new HttpError('policy_blocked', 'Indisponível pela política da organização', 403)
    }
    await saveAccount(userId, provider, { status: 'needs_auth', error: 'Autorização expirou — conecte de novo' })
    throw new HttpError('needs_auth', 'Autorização expirou — conecte de novo', 401)
  }
  // Microsoft rotates refresh tokens: keep the newest one.
  if (tok.refresh_token && tok.refresh_token !== refresh) {
    await saveAccount(userId, provider, { status: 'connected', refreshToken: tok.refresh_token })
  }
  return tok.access_token as string
}

/** GET a provider JSON endpoint with a bearer token; maps 401/403 to needs_auth/policy_blocked. */
export async function providerGet<T>(url: string, token: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers } })
  if (res.status === 401) throw new HttpError('needs_auth', 'Autorização expirou — conecte de novo', 401)
  if (res.status === 403) {
    const text = await res.text()
    if (/AADSTS(90094|90095|65001)|Authorization_RequestDenied|consent/i.test(text)) {
      throw new HttpError('policy_blocked', 'Indisponível pela política da organização', 403)
    }
    throw new HttpError('upstream', 'O provedor recusou o acesso', 502)
  }
  if (!res.ok) {
    const err = new HttpError('upstream', `Provedor respondeu ${res.status}`, 502)
    ;(err as HttpError & { upstreamStatus?: number }).upstreamStatus = res.status
    throw err
  }
  return (await res.json()) as T
}
