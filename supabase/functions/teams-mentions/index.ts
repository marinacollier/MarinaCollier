/**
 * Teams chat mentions → Work Inbox candidates. Delegated Chat.Read (no admin consent required).
 * Channel messages (ChannelMessage.Read.All) need admin consent and are intentionally not requested.
 * Message bodies are read by Graph but dropped by the mapper; only chat name, sender, time and link return.
 *   GET ?since=<ISO>
 * Docs: https://learn.microsoft.com/en-us/graph/api/chat-list
 *       https://learn.microsoft.com/en-us/graph/api/chat-list-messages
 */
import { accessToken, providerGet, requireUser, saveAccount } from '../_shared/db.ts'
import { HttpError, json, serve } from '../_shared/http.ts'
import { mapTeamsMention, type GraphChat, type GraphChatMessage } from '../_shared/mappers.ts'
import type { WireActionCandidate } from '../_shared/types.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'

interface ChatWithPreview extends GraphChat {
  lastMessagePreview?: { createdDateTime?: string } | null
}

serve(async (req, url) => {
  const user = await requireUser(req)
  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 3 * 86_400_000)
  if (Number.isNaN(since.getTime())) throw new HttpError('bad_request', 'since inválido')
  const token = await accessToken(user.id, 'teams')

  const me = await providerGet<{ id: string }>(`${GRAPH}/me?$select=id`, token)
  const chats = await providerGet<{ value: ChatWithPreview[] }>(
    `${GRAPH}/me/chats?$expand=lastMessagePreview&$orderby=lastMessagePreview/createdDateTime desc&$top=20`,
    token,
  )
  const recent = chats.value.filter((c) => c.lastMessagePreview?.createdDateTime && new Date(c.lastMessagePreview.createdDateTime) >= since)

  const candidates: WireActionCandidate[] = []
  for (const chat of recent.slice(0, 10)) {
    const msgs = await providerGet<{ value: GraphChatMessage[] }>(
      `${GRAPH}/chats/${encodeURIComponent(chat.id)}/messages?$top=30&$orderby=createdDateTime desc`,
      token,
    )
    for (const m of msgs.value) {
      if (new Date(m.createdDateTime) < since) continue
      const c = mapTeamsMention(chat, m, me.id)
      if (c) candidates.push(c)
    }
  }
  await saveAccount(user.id, 'teams', { status: 'connected', lastSyncAt: new Date().toISOString() })
  return json(req, { candidates })
})
