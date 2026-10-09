/**
 * Supabase Auth for MARINA OS's own backend — the auth the architecture already expects (backend.ts:
 * setSessionTokenProvider), not a parallel one. E-mail + 6-digit code (no password, no extra library):
 *
 *   sendCode(email) → Supabase e-mails a code   ·   verifyCode(email, code) → signed in
 *
 * - The access token lives in memory only; when it expires it is refreshed.
 * - The refresh token is kept in IndexedDB (its own store, never localStorage, never in backups) so she
 *   doesn't sign in on every cold start. "Sair" deletes it.
 * - The Supabase URL comes from VITE_MARINA_API_URL (…/functions/v1) or VITE_SUPABASE_URL.
 */
import { createStore, del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { readBackendEnv, setSessionTokenProvider } from './backend'

interface Session {
  accessToken: string
  expiresAt: number
  email?: string
}

interface AuthState {
  email?: string
  signedIn: boolean
  ready: boolean
}

export const useAuth = create<AuthState>(() => ({ signedIn: false, ready: false }))

const store = typeof indexedDB !== 'undefined' ? createStore('marina-os-auth', 'kv') : undefined
const REFRESH_KEY = 'refresh'
let session: Session | null = null
let refreshing: Promise<Session | null> | null = null

export function authBaseUrl(): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>
  const explicit = env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  if (explicit) return explicit
  const api = readBackendEnv().apiUrl
  return api?.replace(/\/functions\/v1$/, '')
}

export function authAvailable(): boolean {
  return !!authBaseUrl() && !!readBackendEnv().anonKey
}

async function gotrue<T>(path: string, body: unknown): Promise<T> {
  const base = authBaseUrl()
  const anon = readBackendEnv().anonKey
  if (!base || !anon) throw new Error('Servidor não configurado')
  let res: Response
  try {
    res = await fetch(`${base}/auth/v1/${path}`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' })
  } catch {
    throw new Error('Sem conexão com o servidor')
  }
  const data = (await res.json().catch(() => ({}))) as T & { msg?: string; error_description?: string; message?: string }
  if (!res.ok) throw new Error(data.error_description ?? data.msg ?? data.message ?? `Erro ${res.status}`)
  return data
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user?: { email?: string }
}

async function adopt(t: TokenResponse): Promise<Session> {
  session = { accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000, email: t.user?.email }
  if (store) await set(REFRESH_KEY, { token: t.refresh_token, email: t.user?.email }, store)
  useAuth.setState({ signedIn: true, email: t.user?.email ?? useAuth.getState().email, ready: true })
  return session
}

/** Supabase e-mails a 6-digit code (the account must already exist in the project). */
export async function sendCode(email: string): Promise<void> {
  await gotrue('otp', { email: email.trim().toLowerCase(), create_user: false })
}

export async function verifyCode(email: string, code: string): Promise<void> {
  await adopt(await gotrue<TokenResponse>('verify', { type: 'email', email: email.trim().toLowerCase(), token: code.trim() }))
}

async function refresh(): Promise<Session | null> {
  if (!store) return null
  const saved = (await get(REFRESH_KEY, store)) as { token: string; email?: string } | undefined
  if (!saved?.token) return null
  try {
    return await adopt(await gotrue<TokenResponse>('token?grant_type=refresh_token', { refresh_token: saved.token }))
  } catch {
    // Revoked or expired: back to signed out (no silent retry loop).
    await del(REFRESH_KEY, store)
    session = null
    useAuth.setState({ signedIn: false, email: undefined, ready: true })
    return null
  }
}

/** A valid access token, refreshing when needed (one refresh at a time). */
export async function accessToken(): Promise<string | undefined> {
  if (session && session.expiresAt > Date.now()) return session.accessToken
  refreshing ??= refresh().finally(() => {
    refreshing = null
  })
  return (await refreshing)?.accessToken
}

export async function signOut(): Promise<void> {
  session = null
  if (store) await del(REFRESH_KEY, store)
  useAuth.setState({ signedIn: false, email: undefined })
}

/** Call once at boot: wires the token into callBackend and restores a saved session. */
export async function initAuth(): Promise<void> {
  if (!authAvailable()) return useAuth.setState({ ready: true })
  setSessionTokenProvider(accessToken, () => useAuth.getState().signedIn)
  const saved = store ? ((await get(REFRESH_KEY, store)) as { email?: string } | undefined) : undefined
  useAuth.setState({ signedIn: !!saved, email: saved?.email, ready: true })
}
