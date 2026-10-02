/**
 * Microsoft Teams mentions — via Edge Function `teams-mentions`.
 * Delegated permission Chat.Read (no admin consent required). Channel messages would need
 * ChannelMessage.Read.All, which requires admin consent, so they are not requested.
 * Message text is never returned: only chat name, sender, time and link.
 */
import { callBackend, startOAuth } from './backend'
import { PROVIDERS } from './registry'
import type { MessagingProvider, RemoteActionCandidate } from './types'
import { asArray, backendProviderStatus, returnHere } from './common'

export const teamsMentions: MessagingProvider = {
  info: PROVIDERS.teams,
  status: () => backendProviderStatus('teams'),
  connect: () => startOAuth('microsoft', { returnTo: returnHere(), features: ['teams'] }),
  async listActionCandidates(since) {
    const r = await callBackend<{ candidates: RemoteActionCandidate[] }>('teams-mentions', { query: { since } })
    return asArray<RemoteActionCandidate>(r.candidates, 'candidates').map((c) => ({ ...c, source: 'teams' as const }))
  },
}
