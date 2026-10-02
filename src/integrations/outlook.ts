/**
 * Work e-mail (Outlook) — via Edge Function `ms-mail-actions`.
 * Delegated permission Mail.ReadBasic: Graph never returns body, previewBody or attachments for it.
 * Read-only: this adapter has no send/delete/move/reply — on purpose.
 */
import { callBackend, startOAuth } from './backend'
import { PROVIDERS } from './registry'
import type { MailProvider, RemoteActionCandidate } from './types'
import { asArray, backendProviderStatus, returnHere } from './common'

export const outlookMail: MailProvider = {
  info: PROVIDERS.outlook,
  status: () => backendProviderStatus('outlook'),
  connect: () => startOAuth('microsoft', { returnTo: returnHere(), features: ['mail'] }),
  async listActionCandidates(since) {
    const r = await callBackend<{ candidates: RemoteActionCandidate[] }>('ms-mail-actions', { query: { since } })
    return asArray<RemoteActionCandidate>(r.candidates, 'candidates').map((c) => ({ ...c, source: 'outlook' as const }))
  },
}
