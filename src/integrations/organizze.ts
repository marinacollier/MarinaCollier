/**
 * Organizze (API v2, https://api.organizze.com.br/rest/v2) — via Edge Function `organizze-proxy`.
 * The API uses HTTP Basic auth (e-mail + API token) and requires a User-Agent header; both live only
 * in the function's secrets. The browser never sees the token. Read-only use.
 */
import { callBackend } from './backend'
import { PROVIDERS } from './registry'
import type { FinanceProvider, RemoteAccount, RemoteCategory, RemoteTransaction } from './types'
import { asArray, backendProviderStatus } from './common'

export const organizze: FinanceProvider = {
  info: PROVIDERS.organizze,
  status: () => backendProviderStatus('organizze'),
  // No OAuth: credentials are server secrets (see docs/INTEGRATIONS.md), so no connect().
  async listAccounts() {
    const r = await callBackend<{ accounts: RemoteAccount[] }>('organizze-proxy', { query: { op: 'accounts' } })
    return asArray<RemoteAccount>(r.accounts, 'accounts')
  },
  async listCategories() {
    const r = await callBackend<{ categories: RemoteCategory[] }>('organizze-proxy', { query: { op: 'categories' } })
    return asArray<RemoteCategory>(r.categories, 'categories')
  },
  async listTransactions(range) {
    const r = await callBackend<{ transactions: RemoteTransaction[] }>('organizze-proxy', {
      query: { op: 'transactions', from: range.from, to: range.to },
    })
    return asArray<RemoteTransaction>(r.transactions, 'transactions')
  },
}
