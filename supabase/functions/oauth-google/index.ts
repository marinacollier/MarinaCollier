/**
 * Google OAuth 2.0 for web server apps (authorization code + PKCE, confidential client).
 *   POST /oauth-google/start      (user JWT)  → { url } to accounts.google.com
 *   GET  /oauth-google/callback   (from Google, verify_jwt = false) → stores refresh token, 302 back to the app
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server
 */
import { saveAccount, requireUser } from '../_shared/db.ts'
import { HttpError, json, requiredEnv, serve } from '../_shared/http.ts'
import { appFallback, backToApp, checkReturnTo, consumeState, createState, functionsBaseUrl } from '../_shared/oauth.ts'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]
const redirectUri = () => `${functionsBaseUrl()}/oauth-google/callback`

serve(async (req, url) => {
  if (req.method === 'POST' && url.pathname.endsWith('/start')) {
    const user = await requireUser(req)
    const { returnTo } = await req.json()
    const { state, challenge } = await createState(user.id, 'google', checkReturnTo(returnTo))
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    auth.search = new URLSearchParams({
      client_id: requiredEnv('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline', // we need a refresh token
      prompt: 'consent', // Google only returns refresh_token on consent
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString()
    return json(req, { url: auth.toString() })
  }

  if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
    const row = await consumeState(url.searchParams.get('state'), 'google')
    if (!row) return backToApp(appFallback(), 'google', 'error')
    if (url.searchParams.get('error')) return backToApp(row.return_to, 'google', 'error')

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: url.searchParams.get('code') ?? '',
        client_id: requiredEnv('GOOGLE_CLIENT_ID'),
        client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri(),
        code_verifier: row.code_verifier,
      }),
    })
    const tok = await res.json()
    if (!res.ok || !tok.refresh_token) {
      await saveAccount(row.user_id, 'google', { status: 'error', error: 'Não recebemos autorização offline do Google' })
      return backToApp(row.return_to, 'google', 'error')
    }

    // The primary calendar id is the account e-mail — readable with calendarlist.readonly, no extra scope.
    let label: string | undefined
    const me = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary?fields=id', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    if (me.ok) label = (await me.json()).id

    await saveAccount(row.user_id, 'google', {
      status: 'connected',
      accountLabel: label,
      scopes: String(tok.scope ?? '').split(' ').filter(Boolean),
      refreshToken: tok.refresh_token,
    })
    return backToApp(row.return_to, 'google', 'connected')
  }

  throw new HttpError('bad_request', 'Rota desconhecida', 404)
})
