/**
 * Fetches a public .ics subscription URL server-side (most calendar hosts don't send CORS headers).
 * Returns the raw text; parsing/dedupe happens in the app (src/integrations/ics).
 * Guards: signed-in user, https only, no private/loopback hosts, 10 s timeout, 5 MB cap.
 *   GET ?url=https://...ics   (webcal:// is accepted and rewritten to https://)
 */
import { requireUser } from '../_shared/db.ts'
import { corsHeaders, HttpError, serve } from '../_shared/http.ts'

const MAX_BYTES = 5 * 1024 * 1024

function safeUrl(raw: string | null): URL {
  if (!raw) throw new HttpError('bad_request', 'url obrigatória')
  const u = new URL(raw.replace(/^webcal:/i, 'https:'))
  if (u.protocol !== 'https:') throw new HttpError('bad_request', 'Use um link https')
  const h = u.hostname
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.)/.test(h) || h.endsWith('.internal')) {
    throw new HttpError('bad_request', 'Endereço não permitido')
  }
  return u
}

serve(async (req, url) => {
  await requireUser(req)
  const target = safeUrl(url.searchParams.get('url'))
  const res = await fetch(target, { headers: { Accept: 'text/calendar, text/plain;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new HttpError('upstream', `O calendário respondeu ${res.status}`, 502)
  const len = Number(res.headers.get('Content-Length') ?? 0)
  if (len > MAX_BYTES) throw new HttpError('bad_request', 'Calendário grande demais', 413)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new HttpError('bad_request', 'Calendário grande demais', 413)
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new HttpError('bad_request', 'O link não devolveu um .ics')
  return new Response(text, { headers: { ...corsHeaders(req), 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } })
})
