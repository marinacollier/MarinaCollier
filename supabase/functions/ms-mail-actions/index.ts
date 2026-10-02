/**
 * Outlook → Work Inbox candidates. Delegated Mail.ReadBasic (read-only; Graph excludes body,
 * previewBody and attachments for it). Requests only metadata with $select; nothing is persisted here.
 * This function has no send/delete/move/reply code paths — by design.
 *   GET ?since=<ISO>  → { candidates }
 * Docs: https://learn.microsoft.com/en-us/graph/api/user-list-messages
 */
import { accessToken, providerGet, requireUser, saveAccount } from '../_shared/db.ts'
import { HttpError, json, serve } from '../_shared/http.ts'
import { GRAPH_MESSAGE_SELECT, mapGraphMessage, type GraphMessage } from '../_shared/mappers.ts'
import type { WireActionCandidate } from '../_shared/types.ts'

serve(async (req, url) => {
  const user = await requireUser(req)
  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 7 * 86_400_000)
  if (Number.isNaN(since.getTime())) throw new HttpError('bad_request', 'since inválido')
  const token = await accessToken(user.id, 'outlook')

  // $filter and $orderby on the same property (receivedDateTime) as Graph requires.
  const q = new URLSearchParams({
    $select: GRAPH_MESSAGE_SELECT,
    $filter: `receivedDateTime ge ${since.toISOString()}`,
    $orderby: 'receivedDateTime desc',
    $top: '50',
  })
  const r = await providerGet<{ value: GraphMessage[] }>(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${q}`, token)
  const candidates = r.value.map(mapGraphMessage).filter((c): c is WireActionCandidate => !!c)
  await saveAccount(user.id, 'outlook', { status: 'connected', lastSyncAt: new Date().toISOString() })
  return json(req, { candidates })
})
