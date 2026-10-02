import { getDB } from '@/data/store'
import type { ProviderId } from '@/data/types'
import { fetchConnectionStatuses, hasSessionProvider, readBackendEnv, type BackendEnv } from './backend'
import { providerStatus } from './registry'
import type { ProviderStatus } from './types'

/** Status for a backend provider: local flags/env first, then what the backend reports. */
export async function backendProviderStatus(provider: ProviderId, env: BackendEnv = readBackendEnv()): Promise<ProviderStatus> {
  const flags = getDB().profile.featureFlags
  const statusEnv = { apiUrl: env.apiUrl, signedIn: hasSessionProvider() }
  const local = providerStatus(provider, flags, statusEnv)
  if (local.status !== 'needs_auth') return local
  try {
    const remote = (await fetchConnectionStatuses(env)).find((c) => c.provider === provider)
    return providerStatus(provider, flags, statusEnv, remote)
  } catch {
    return { status: 'error', message: 'Não consegui falar com o servidor agora' }
  }
}

/** Defensive check that the backend answered with an array (never trust shapes blindly). */
export function asArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Resposta inesperada do servidor (${what})`)
  return value as T[]
}

/** Current page without query string — where OAuth callbacks send Marina back. */
export function returnHere(): string {
  return window.location.origin + window.location.pathname
}
