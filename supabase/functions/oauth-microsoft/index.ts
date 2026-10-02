/**
 * Microsoft identity platform v2: authorization code + PKCE, confidential client (secret on server).
 * Incremental consent: each feature (calendar / mail / teams) asks only for its own delegated scope.
 *   POST /oauth-microsoft/start     (user JWT) body { returnTo, features: ['calendar'|'mail'|'teams'] }
 *   GET  /oauth-microsoft/callback  (verify_jwt = false)
 * When the tenant blocks user consent, Entra ID redirects back with error + AADSTS90094/90095/65001
 * → the feature is stored as `policy_blocked` and the app shows "Indisponível pela política da organização".
 * Docs: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
 */
import { requireUser, saveAccount, microsoftTokenUrl, type AccountProvider } from '../_shared/db.ts'
import { HttpError, json, requiredEnv, serve } from '../_shared/http.ts'
import { appFallback, backToApp, checkReturnTo, consumeState, createState, functionsBaseUrl } from '../_shared/oauth.ts'

const BASE = ['openid', 'profile', 'offline_access', 'User.Read']
const FEATURES: Record<string, { provider: AccountProvider; scopes: string[] }> = {
  calendar: { provider: 'microsoft', scopes: ['Calendars.Read'] },
  mail: { provider: 'outlook', scopes: ['Mail.ReadBasic'] },
  teams: { provider: 'teams', scopes: ['Chat.Read'] },
}
const redirectUri = () => `${functionsBaseUrl()}/oauth-microsoft/callback`
const authorizeUrl = () =>
  `https://login.microsoftonline.com/${encodeURIComponent(Deno.env.get('MS_TENANT') ?? 'organizations')}/oauth2/v2.0/authorize`

function isAdminConsentError(error?: string | null, description?: string | null): boolean {
  const text = `${error ?? ''} ${description ?? ''}`
  return /AADSTS(90094|90095|65001)\b/.test(text) || error === 'consent_required'
}

serve(async (req, url) => {
  if (req.method === 'POST' && url.pathname.endsWith('/start')) {
    const user = await requireUser(req)
    const body = await req.json()
    const feature = Array.isArray(body.features) ? String(body.features[0]) : ''
    const f = FEATURES[feature]
    if (!f) throw new HttpError('bad_request', 'Recurso desconhecido')
    const { state, challenge } = await createState(user.id, 'microsoft', checkReturnTo(body.returnTo), [feature])
    const auth = new URL(authorizeUrl())
    auth.search = new URLSearchParams({
      client_id: requiredEnv('MS_CLIENT_ID'),
      response_type: 'code',
      redirect_uri: redirectUri(),
      response_mode: 'query',
      scope: [...BASE, ...f.scopes].join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString()
    return json(req, { url: auth.toString() })
  }

  if (req.method === 'GET' && url.pathname.endsWith('/callback')) {
    const row = await consumeState(url.searchParams.get('state'), 'microsoft')
    if (!row) return backToApp(appFallback(), 'microsoft', 'error')
    const f = FEATURES[row.features[0]] ?? FEATURES.calendar

    const error = url.searchParams.get('error')
    if (error) {
      if (isAdminConsentError(error, url.searchParams.get('error_description'))) {
        await saveAccount(row.user_id, f.provider, { status: 'policy_blocked', error: 'Bloqueado pela política da organização' })
        return backToApp(row.return_to, f.provider, 'policy_blocked')
      }
      return backToApp(row.return_to, f.provider, 'error')
    }

    const scopes = [...BASE, ...f.scopes]
    const res = await fetch(microsoftTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: url.searchParams.get('code') ?? '',
        client_id: requiredEnv('MS_CLIENT_ID'),
        client_secret: requiredEnv('MS_CLIENT_SECRET'),
        redirect_uri: redirectUri(),
        code_verifier: row.code_verifier,
        scope: scopes.join(' '),
      }),
    })
    const tok = await res.json()
    if (!res.ok || !tok.refresh_token) {
      const blocked = isAdminConsentError(tok.error, tok.error_description)
      await saveAccount(row.user_id, f.provider, {
        status: blocked ? 'policy_blocked' : 'error',
        error: blocked ? 'Bloqueado pela política da organização' : 'Falha ao concluir a autorização',
      })
      return backToApp(row.return_to, f.provider, blocked ? 'policy_blocked' : 'error')
    }

    let label: string | undefined
    const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=userPrincipalName', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    if (me.ok) label = (await me.json()).userPrincipalName

    await saveAccount(row.user_id, f.provider, {
      status: 'connected',
      accountLabel: label,
      // Graph returns granted scopes as full URIs or short names; keep the short form we requested.
      scopes,
      refreshToken: tok.refresh_token,
    })
    return backToApp(row.return_to, f.provider, 'connected')
  }

  throw new HttpError('bad_request', 'Rota desconhecida', 404)
})
