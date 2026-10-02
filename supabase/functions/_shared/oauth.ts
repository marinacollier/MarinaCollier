/** Shared OAuth plumbing: state rows, return URLs, redirects. */
import { db } from './db.ts'
import { pkceChallenge, randomToken } from './crypto.ts'
import { HttpError, requiredEnv } from './http.ts'

export function functionsBaseUrl(): string {
  return (Deno.env.get('PUBLIC_FUNCTIONS_URL') ?? `${requiredEnv('SUPABASE_URL')}/functions/v1`).replace(/\/+$/, '')
}

/** Only send the browser back to the app itself (no open redirects). */
export function checkReturnTo(returnTo: unknown): string {
  const appOrigin = requiredEnv('APP_ORIGIN')
  if (typeof returnTo !== 'string') throw new HttpError('bad_request', 'returnTo inválido')
  const u = new URL(returnTo)
  if (u.origin !== appOrigin) throw new HttpError('bad_request', 'returnTo fora do app')
  return u.origin + u.pathname
}

export async function createState(userId: string, provider: 'google' | 'microsoft', returnTo: string, features: string[] = []) {
  const state = randomToken(24)
  const verifier = randomToken(48)
  const { error } = await db()
    .from('oauth_states')
    .insert({ state, user_id: userId, provider, features, code_verifier: verifier, return_to: returnTo })
  if (error) throw new HttpError('upstream', 'Falha ao iniciar autorização', 500)
  return { state, challenge: await pkceChallenge(verifier) }
}

export interface StateRow {
  user_id: string
  provider: 'google' | 'microsoft'
  features: string[]
  code_verifier: string
  return_to: string
  expires_at: string
}

/** Single use: the row is deleted as it is read. */
export async function consumeState(state: string | null, provider: 'google' | 'microsoft'): Promise<StateRow | null> {
  if (!state) return null
  const { data } = await db().from('oauth_states').delete().eq('state', state).eq('provider', provider).select().maybeSingle()
  const row = data as StateRow | null
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return null
  return row
}

export function backToApp(returnTo: string, integration: string, status: string): Response {
  const u = new URL(returnTo)
  u.searchParams.set('integration', integration)
  u.searchParams.set('status', status)
  return new Response(null, { status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } })
}

export function appFallback(): string {
  return `${requiredEnv('APP_ORIGIN')}/ajustes/integracoes`
}
