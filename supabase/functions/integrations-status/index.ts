/**
 * Connection rows for the signed-in user, without tokens.
 *   GET → { connections: [{ provider, status, accountLabel, scopes, lastSyncAt, error }] }
 * Organizze has no per-user OAuth: it reports 'connected' when its secrets exist.
 */
import { db, requireUser } from '../_shared/db.ts'
import { json, serve } from '../_shared/http.ts'

serve(async (req) => {
  const user = await requireUser(req)
  const { data } = await db()
    .from('integration_accounts')
    .select('provider, status, account_label, scopes, last_sync_at, error')
    .eq('user_id', user.id)
  const connections = (data ?? []).map((r) => ({
    provider: r.provider,
    status: r.status,
    accountLabel: r.account_label ?? undefined,
    scopes: r.scopes ?? [],
    lastSyncAt: r.last_sync_at ?? undefined,
    error: r.error ?? undefined,
  }))
  const organizzeReady = !!Deno.env.get('ORGANIZZE_EMAIL') && !!Deno.env.get('ORGANIZZE_API_TOKEN')
  connections.push({
    provider: 'organizze',
    status: organizzeReady ? 'connected' : 'error',
    accountLabel: organizzeReady ? Deno.env.get('ORGANIZZE_EMAIL') : undefined,
    scopes: [],
    lastSyncAt: undefined,
    error: organizzeReady ? undefined : 'Defina ORGANIZZE_EMAIL e ORGANIZZE_API_TOKEN nos segredos',
  })
  return json(req, { connections })
})
