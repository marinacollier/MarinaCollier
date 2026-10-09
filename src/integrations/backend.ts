/**
 * Tiny client for MARINA OS's backend (Supabase Edge Functions).
 *
 * - Base URL: VITE_MARINA_API_URL, e.g. https://<project-ref>.supabase.co/functions/v1
 * - VITE_SUPABASE_ANON_KEY is a *public* key (safe in the frontend); it is sent as `apikey`.
 * - The user's Supabase Auth session JWT is sent as `Authorization: Bearer …` so functions can
 *   resolve auth.uid(). Supabase Auth is not wired yet: plug it in with `setSessionTokenProvider`.
 *
 * Provider OAuth tokens / API keys never reach this file: functions keep them server-side and
 * return already-minimized data.
 */
import type { ProviderId } from '@/data/types'

export interface BackendEnv {
  apiUrl?: string
  anonKey?: string
}

export function readBackendEnv(): BackendEnv {
  const env = import.meta.env as Record<string, string | undefined>
  const apiUrl = env.VITE_MARINA_API_URL?.trim().replace(/\/+$/, '') || undefined
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || undefined
  return { apiUrl, anonKey }
}

export function isBackendConfigured(env: BackendEnv = readBackendEnv()): boolean {
  return !!env.apiUrl
}

export type BackendErrorCode = 'not_configured' | 'unauthorized' | 'policy_blocked' | 'needs_auth' | 'http' | 'network'

export class BackendError extends Error {
  readonly code: BackendErrorCode
  readonly status?: number
  constructor(code: BackendErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    this.status = status
  }
}

type TokenProvider = () => Promise<string | undefined> | string | undefined
let sessionToken: TokenProvider = () => undefined
let sessionWired = false
let signedInNow: () => boolean = () => true

/** Register how to get the current Supabase Auth access token (kept in memory by the auth client). */
export function setSessionTokenProvider(fn: TokenProvider, isSignedIn?: () => boolean): void {
  sessionToken = fn
  sessionWired = true
  if (isSignedIn) signedInNow = isSignedIn
}

/** True when an auth client is wired AND signed in. Without it, functions can't know who Marina is. */
export function hasSessionProvider(): boolean {
  return sessionWired && signedInNow()
}

export interface CallOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  env?: BackendEnv
  fetchImpl?: typeof fetch
  /** 'text' for non-JSON payloads (ics-proxy). */
  responseType?: 'json' | 'text'
}

export function buildUrl(env: BackendEnv, fn: string, query?: CallOptions['query']): string {
  if (!env.apiUrl) throw new BackendError('not_configured', 'Servidor não configurado')
  const url = new URL(`${env.apiUrl}/${fn.replace(/^\/+/, '')}`)
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))
  return url.toString()
}

/** Call an Edge Function and parse JSON. Errors are mapped to BackendError codes. */
export async function callBackend<T>(fn: string, opts: CallOptions = {}): Promise<T> {
  const env = opts.env ?? readBackendEnv()
  const url = buildUrl(env, fn, opts.query)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (env.anonKey) headers.apikey = env.anonKey
  const token = (await sessionToken()) ?? env.anonKey
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'omit',
    })
  } catch {
    throw new BackendError('network', 'Sem conexão com o servidor')
  }

  if (!res.ok) {
    let payload: { error?: string; message?: string } = {}
    try {
      payload = await res.json()
    } catch {
      /* non-JSON error body */
    }
    const msg = payload.message ?? `Erro ${res.status}`
    if (payload.error === 'policy_blocked') throw new BackendError('policy_blocked', msg, res.status)
    if (payload.error === 'needs_auth') throw new BackendError('needs_auth', msg, res.status)
    if (res.status === 401 || res.status === 403) throw new BackendError('unauthorized', msg, res.status)
    throw new BackendError('http', msg, res.status)
  }
  return (opts.responseType === 'text' ? await res.text() : await res.json()) as T
}

export type OAuthProvider = 'google' | 'microsoft'
export type MicrosoftFeature = 'calendar' | 'mail' | 'teams'

/**
 * Ask the backend for the provider's authorization URL (it creates a one-time `state` bound to
 * the signed-in user, plus a PKCE verifier for Microsoft) and redirect the browser there.
 * The provider then redirects to the backend callback, which stores the refresh token
 * server-side and sends the browser back to `returnTo?integration=<provider>&status=...`.
 */
export async function startOAuth(
  provider: OAuthProvider,
  opts: { returnTo: string; features?: MicrosoftFeature[]; env?: BackendEnv; navigate?: (url: string) => void },
): Promise<void> {
  const { url } = await callBackend<{ url: string }>(`oauth-${provider}/start`, {
    method: 'POST',
    body: { returnTo: opts.returnTo, features: opts.features },
    env: opts.env,
  })
  const target = new URL(url)
  const allowed = provider === 'google' ? 'accounts.google.com' : 'login.microsoftonline.com'
  if (target.protocol !== 'https:' || target.hostname !== allowed) {
    throw new BackendError('http', 'URL de autorização inesperada')
  }
  ;(opts.navigate ?? ((u) => window.location.assign(u)))(target.toString())
}

export interface RemoteConnectionStatus {
  provider: ProviderId
  status: 'connected' | 'needs_auth' | 'error' | 'policy_blocked'
  accountLabel?: string
  scopes: string[]
  lastSyncAt?: string
  error?: string
}

/** Connection rows as the backend sees them (no tokens). */
export function fetchConnectionStatuses(env?: BackendEnv): Promise<RemoteConnectionStatus[]> {
  return callBackend<{ connections: RemoteConnectionStatus[] }>('integrations-status', { env }).then((r) => r.connections)
}
