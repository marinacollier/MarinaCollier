/**
 * Writes an outreach message from a strategy.
 * - With the server (signed in + backend configured): `lumos-pitch` (Claude, key on the server) writes it.
 *   The text is re-checked here (clichés, invented experience, length, repeated opening/closing); if it fails,
 *   ONE retry with the issues as feedback; still failing → the local draft.
 * - Without the server: the local draft (works offline). Never a dead button.
 * Nothing is sent: the text only goes back to the screen.
 */
import type { MessageStrategy } from '@/data/ugc/strategy'
import { checkText } from '@/data/ugc/strategy'
import { composeDraft, type Draft } from '@/data/ugc/compose'
import { callBackend, isBackendConfigured } from '@/integrations/backend'
import { authAvailable } from '@/integrations/auth'

export interface Written extends Draft {
  by: 'lumos' | 'local'
  /** Why the server text wasn't used (shown small, never blocking). */
  note?: string
}

export function canWriteWithServer(): boolean {
  return isBackendConfigured() && authAvailable()
}

/** Only what the server needs — no ids, no personal data beyond her public creator profile. */
export function pitchPayload(s: MessageStrategy, feedback?: string[]) {
  return {
    channel: s.channel,
    feedback,
    strategy: {
      brand: { name: s.brand.name, category: s.brand.category, products: s.brand.products?.slice(0, 10) },
      talk: s.talk,
      avoid: s.avoid,
      angle: s.angle,
      fact: s.fact ? { text: s.fact.text, source: s.fact.source } : null,
      relationship: s.relationship.say,
      contact: s.contact ?? null,
      spec: { min: s.spec.min, max: s.spec.max, subject: s.spec.subject, links: s.spec.links, tone: s.spec.tone },
      recentOpenings: s.recentOpenings.slice(0, 20),
      recentClosings: s.recentClosings.slice(0, 20),
      creator: { name: s.creator.name, instagram: s.creator.instagram ?? null, portfolio: s.creator.portfolio ?? null },
    },
  }
}

type Call = (body: ReturnType<typeof pitchPayload>) => Promise<{ subject: string | null; message: string }>
const serverCall: Call = (body) => callBackend('lumos-pitch', { method: 'POST', body })

export async function writeMessage(s: MessageStrategy, opts: { seed?: number; useServer?: boolean; call?: Call } = {}): Promise<Written> {
  const local = (): Written => ({ ...composeDraft(s, opts.seed ?? 0), by: 'local' })
  const useServer = opts.useServer ?? canWriteWithServer()
  if (!useServer) return local()
  const call = opts.call ?? serverCall
  let feedback: string[] | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    let out: { subject: string | null; message: string }
    try {
      out = await call(pitchPayload(s, feedback))
    } catch {
      return { ...local(), note: 'Sem conexão com a Lumos agora — rascunho feito aqui no app.' }
    }
    const subject = s.spec.subject ? out.subject?.trim() || undefined : undefined
    const check = checkText(s, out.message, subject)
    if (check.ok) return { subject, text: out.message.trim(), variant: opts.seed ?? 0, issues: [], by: 'lumos' }
    feedback = check.issues
  }
  return { ...local(), note: 'A versão da Lumos não passou na checagem — usei o rascunho do app.' }
}
