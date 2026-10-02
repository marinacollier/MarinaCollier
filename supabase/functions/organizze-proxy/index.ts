/**
 * Organizze API v2 proxy (read-only). The API uses HTTP Basic auth with the account e-mail as user
 * and the API token as password, and rejects requests without a User-Agent (400).
 * Credentials are function secrets (ORGANIZZE_EMAIL, ORGANIZZE_API_TOKEN) — never sent to the browser.
 *   GET ?op=accounts | categories | transactions&from&to | invoices&cardId
 * Docs: https://github.com/organizze/api-doc
 */
import { requireUser } from '../_shared/db.ts'
import { HttpError, json, requiredEnv, serve } from '../_shared/http.ts'
import {
  mapOrganizzeAccount,
  mapOrganizzeCard,
  mapOrganizzeCategory,
  mapOrganizzeTransaction,
  type OrganizzeAccount,
  type OrganizzeCategory,
  type OrganizzeCreditCard,
  type OrganizzeTransaction,
} from '../_shared/mappers.ts'

const API = 'https://api.organizze.com.br/rest/v2'

async function organizze<T>(path: string): Promise<T> {
  const email = requiredEnv('ORGANIZZE_EMAIL')
  const auth = btoa(`${email}:${requiredEnv('ORGANIZZE_API_TOKEN')}`)
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': Deno.env.get('ORGANIZZE_USER_AGENT') ?? `MARINA OS (${email})`,
      Accept: 'application/json',
    },
  })
  if (res.status === 401) throw new HttpError('needs_auth', 'Token do Organizze inválido', 401)
  if (!res.ok) throw new HttpError('upstream', `Organizze respondeu ${res.status}`, 502)
  return (await res.json()) as T
}

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

serve(async (req, url) => {
  // Single-user app, but the proxy still requires a signed-in user so it is not an open relay.
  await requireUser(req)
  const op = url.searchParams.get('op')

  if (op === 'accounts') {
    const [accounts, cards] = await Promise.all([
      organizze<OrganizzeAccount[]>('/accounts'),
      organizze<OrganizzeCreditCard[]>('/credit_cards'),
    ])
    return json(req, {
      accounts: [...accounts.filter((a) => !a.archived).map(mapOrganizzeAccount), ...cards.filter((c) => !c.archived).map(mapOrganizzeCard)],
    })
  }
  if (op === 'categories') {
    return json(req, { categories: (await organizze<OrganizzeCategory[]>('/categories')).map(mapOrganizzeCategory) })
  }
  if (op === 'transactions') {
    const from = isoDate(url.searchParams.get('from'))
    const to = isoDate(url.searchParams.get('to'))
    if (!from || !to) throw new HttpError('bad_request', 'from/to inválidos')
    // Organizze expands start_date/end_date to whole months.
    const txs = await organizze<OrganizzeTransaction[]>(`/transactions?start_date=${from}&end_date=${to}`)
    return json(req, { transactions: txs.filter((t) => t.date >= from && t.date <= to).map(mapOrganizzeTransaction) })
  }
  if (op === 'invoices') {
    const cardId = url.searchParams.get('cardId')?.replace(/^cc-/, '')
    if (!cardId || !/^\d+$/.test(cardId)) throw new HttpError('bad_request', 'cardId inválido')
    const invoices = await organizze<{ id: number; date: string; starting_date: string; closing_date: string; amount_cents: number; payment_amount_cents: number; balance_cents: number }[]>(
      `/credit_cards/${cardId}/invoices`,
    )
    return json(req, {
      invoices: invoices.map((i) => ({ externalId: String(i.id), date: i.date, closingDate: i.closing_date, amountCents: i.amount_cents, balanceCents: i.balance_cents })),
    })
  }
  throw new HttpError('bad_request', 'op desconhecida')
})
