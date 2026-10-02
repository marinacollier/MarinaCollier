# MARINA OS — Integrations

> Integrations are never faked. Anything that is not configured says **"Configuração necessária"**;
> anything that cannot be built yet says **"Disponível em breve"**. A **Conectar** button only exists when
> the backend is configured, Marina is signed in, and it really redirects to the provider.

Research date for everything below: **2026-10-02**. Some vendor pages (developers.google.com,
learn.microsoft.com, toki.com) were not directly reachable from the build environment; facts were confirmed
through the official sources linked here (Microsoft's docs come from the official
`microsoftgraph/microsoft-graph-docs-contrib` repository that publishes learn.microsoft.com).

**Status of the backend:** the Supabase Edge Functions and migration in `supabase/` are written against the
documented APIs and type-check with `deno check`, **but they have not been deployed or exercised against
real Google / Microsoft / Organizze accounts in this environment.** Treat the first deploy as a test run.

---

## 1. Architecture

```
 iPhone (PWA, offline-first)                       Supabase (backend)                          Providers
 ┌─────────────────────────────┐   HTTPS + user JWT  ┌──────────────────────────────┐  OAuth / REST  ┌───────────────┐
 │ IntegrationsPage            │ ─────────────────▶ │ Edge Functions (Deno)         │ ─────────────▶ │ Google Cal v3 │
 │  └ src/integrations/*       │                    │  oauth-google  oauth-microsoft│                │ MS Graph      │
 │     registry  (status)      │ ◀───────────────── │  google-calendar-events       │ ◀───────────── │ Organizze v2  │
 │     backend   (fetch)       │  minimized JSON    │  ms-calendar-events           │                │ any .ics host │
 │     google/microsoft/...    │  (no tokens,       │  ms-mail-actions teams-mentions│               └───────────────┘
 │     sync      (reconcile)   │   no bodies)       │  organizze-proxy  ics-proxy   │
 │     ics       (parse/export)│                    │  integrations-status          │
 │  zustand store → IndexedDB  │                    │ Postgres: integration_accounts│
 └─────────────────────────────┘                    │   (AES-GCM refresh tokens),   │
       ▲ .ics file import/export (100% local)       │   sync_state, oauth_states    │
                                                    └──────────────────────────────┘
```

- React components never call providers. They call `src/integrations/*`, which returns plain data and writes
  to the store through `actions.*` (`sync.ts`).
- Provider adapters (`google.ts`, `microsoft.ts`, `outlook.ts`, `teams.ts`, `organizze.ts`) implement the
  interfaces in `src/integrations/types.ts` by calling Edge Functions only.
- Edge Functions return already-minimized shapes (`supabase/functions/_shared/mappers.ts`): RemoteEvent,
  RemoteActionCandidate, RemoteTransaction… Unneeded fields (event descriptions, attendees, e-mail bodies,
  chat message text) are dropped server-side and never reach the browser.

## 2. Security model

| Rule | How |
|---|---|
| OAuth tokens never in the browser | Refresh tokens are exchanged and stored only by Edge Functions, encrypted with AES-GCM (`TOKEN_ENCRYPTION_KEY` function secret) in `integration_accounts.refresh_token_encrypted`. Access tokens are minted per request and never stored or returned. Nothing in `localStorage`/IndexedDB. |
| Secrets never in the frontend | Only `VITE_MARINA_API_URL` and the public `VITE_SUPABASE_ANON_KEY` are in the app build. Client secrets / Organizze token are function secrets. |
| CSRF / code interception | One-time `state` row bound to the signed-in user (10 min TTL, deleted on use) + PKCE S256 for both Google and Microsoft. |
| No open redirects | `returnTo` must have origin `APP_ORIGIN`. `startOAuth` only follows `accounts.google.com` / `login.microsoftonline.com`. |
| Row Level Security | Owner-only `select` policies (`user_id = auth.uid()`); token column not granted to `authenticated`; writes only via service role. `oauth_states` is service-role only. |
| Least privilege | Read-only scopes only (table below). No write scopes anywhere. |
| Corporate data minimized | Mail: `Mail.ReadBasic` (Graph excludes body, previewBody, attachments) + `$select`. Teams: only chat name, sender, time, link. Nothing is persisted server-side except tokens, cursors and status. |
| Mail / Teams are read-only | No send / delete / move / reply code paths exist in adapters or functions. |
| ics-proxy is not an open relay | Requires a signed-in user; https only; private/loopback hosts rejected; 10 s timeout; 5 MB cap; must look like `BEGIN:VCALENDAR`. |

**User session.** Edge Functions identify Marina by her Supabase Auth JWT (`Authorization: Bearer`). The app does
not have Supabase Auth wired yet. When it does, register it once with
`setSessionTokenProvider(() => session.access_token)` (`src/integrations/backend.ts`). Until then providers show
"Configuração necessária: falta o login do servidor" — no fake Conectar.

## 3. Providers, scopes and status

| Provider (id) | Flag | Requests | Stores locally | Status logic |
|---|---|---|---|---|
| Arquivo .ics (`ics`) | `icsEnabled` | nothing | title, date/time, location, url, UID | always local — pill **Funciona offline** |
| Google Agenda (`google`) | `googleCalendarEnabled` | `calendar.calendarlist.readonly`, `calendar.events.readonly` | title, date/time, location, link, event id, iCalUID | see below |
| Agenda Microsoft 365 (`microsoft`) | `microsoftCalendarEnabled` | `openid profile offline_access User.Read Calendars.Read` | same as Google, iCalUId | see below |
| E-mail do trabalho (`outlook`) | `outlookMailEnabled` | `… Mail.ReadBasic` | subject, sender, received date, Outlook link | see below |
| Microsoft Teams (`teams`) | `teamsEnabled` | `… Chat.Read` | chat name, sender, time, link (never text) | see below |
| Organizze (`organizze`) | `organizzeEnabled` | e-mail + API token as server secrets (HTTP Basic) | description, amount, date, category, account, id | see below |
| Toki (`toki`) | — | — | nothing | **Disponível em breve** (no public API; dedupe via source calendars) |
| Apple (`apple`) | — | — | nothing | **Disponível em breve** (needs native app) |

`providerStatus(provider, flags, env, connection)` (pure, tested in `registry.test.ts`):

1. `ics` → `connected` ("Funciona offline").
2. Planned providers (Toki, Apple) → `coming_soon`.
3. Flag off → `needs_config`.
4. `VITE_MARINA_API_URL` missing → `needs_config` ("Configuração necessária").
5. No Supabase Auth session wired → `needs_config`.
6. Otherwise the backend's row decides: `connected` / `policy_blocked` / `error`, else `needs_auth` (→ **Conectar**).

Turning a flag on without a backend shows the configuration steps instead of a connect button.

## 4. Sync model

Every mirrored record carries `external: ExternalRef`:
`{ provider, externalId, accountId?, globalId?, lastSyncedAt, syncStatus, syncHash, webUrl? }`.

`reconcile()` (`src/integrations/sync.ts`) decides per remote record:

| Outcome | When | Effect |
|---|---|---|
| **created** | no local match by provider+externalId and no globalId duplicate | `actions.createMany` |
| **updated** | match, `syncHash` differs, local mirrored fields untouched | mirrored fields replaced; local-only fields (kind, notes, projectId, tripId, expense category) kept |
| **unchanged** | match and same hash; or a cross-provider duplicate | nothing |
| **deleted** | provider says deleted/cancelled, or full sync and missing inside the fetched range | **soft**: `syncStatus = 'deleted_remotely'` (record kept, should be hidden — `isHiddenBySync`) |
| **conflict** | Marina edited a mirrored field locally (local hash ≠ last synced hash) and remote changed; or imported expense looks like a manual one | local kept, `syncStatus = 'conflict'` (+ `possibleDuplicateOf` for expenses). Never resolved silently. |

`syncHash` = FNV-1a over a stable JSON of the mirrored fields only.

### Dedupe strategy (Toki / Google / Outlook)

1. Same scope (calendar source): `provider + externalId`.
2. Across sources/providers: `globalId (iCalUID, case-insensitive) + start date`. The date is part of the key
   because Google keeps one iCalUID for every instance of a recurring series (Graph's iCalUId differs per
   occurrence).
3. Duplicates inside one payload collapse. Records already `deleted_remotely` don't block.

Because Toki writes into the user's Google/Outlook/iCloud calendars, reading those sources plus this dedupe means a
Toki-created meeting appears **once**.

### Finance (Organizze → Expense)

- Only `amount_cents < 0` and `paid` become Expenses (`origin: 'organizze'`, `amountCents = |amount|`). Income and
  unpaid bills are ignored.
- Category: Organizze category name → local `financialCategories` by normalized name, fallback `cat-outros`.
- Account: `acc-<id>` / `cc-<id>` (cards and accounts share numeric ids in Organizze, so they are prefixed).
- Possible duplicate of a manual expense: same amount, date within ±2 days, similar normalized description
  (token overlap ≥ 50% or substring). The import is created with `possibleDuplicateOf` and `syncStatus: 'conflict'`;
  the manual expense is untouched. Each manual expense is claimed at most once.

### Work Inbox (Outlook / Teams)

Candidates become `WorkInboxItem { status: 'novo', kind: suggestedKind }` once per externalId and are never
overwritten (Marina's triage wins). Classification is a subject-only heuristic (`_shared/classify.ts`).

### ICS (`src/integrations/ics`)

Import: line unfolding; VEVENT (nested VALARM ignored); SUMMARY/LOCATION/URL/UID/DTSTART/DTEND/DURATION/STATUS/
LAST-MODIFIED; all-day (`VALUE=DATE`, exclusive DTEND → inclusive `endDate`); UTC `Z`; `TZID` with IANA ids,
Windows names from Outlook (e.g. `E. South America Standard Time`) and vendor-prefixed ids; floating = São Paulo;
`STATUS:CANCELLED` → deleted. RRULE: open-ended DAILY (INTERVAL → `every_n_days`), WEEKLY+BYDAY, MONTHLY+BYMONTHDAY
(−1 → `'last'`) become a `Recurrence`; finite rules (COUNT/UNTIL) are expanded to dated instances (cap 400 / 3 years)
honouring EXDATE and RECURRENCE-ID overrides; anything else imports the first occurrence only.
Known limits: EXDATE on open-ended rules is lost; overrides of an open-ended rule are skipped.

Export: `VCALENDAR` 2.0, CRLF, UID (`globalId` or `<id>@marina-os`), DTSTAMP, UTC times, escaping, 75-octet folding
(UTF-8 safe), RRULE from `Recurrence`.

`importICSText(text, name)` creates/reuses a `CalendarSource { provider: 'ics', name, enabled: true, color: 'ocean' }`
and runs a full sync for that source (re-import = update; removed events become `deleted_remotely`).

## 5. Feature flags

`profile.featureFlags`: `googleCalendarEnabled`, `microsoftCalendarEnabled`, `outlookMailEnabled`, `teamsEnabled`,
`organizzeEnabled`, `icsEnabled` (default on). Toggled on the Integrações screen via `actions.setProfile`.

## 6. Environment variables

App (Vite build):

| Var | Purpose |
|---|---|
| `VITE_MARINA_API_URL` | `https://<ref>.supabase.co/functions/v1` |
| `VITE_SUPABASE_ANON_KEY` | public anon key (sent as `apikey`) |

Edge Function secrets (`supabase secrets set …`):

| Secret | Purpose |
|---|---|
| `APP_ORIGIN` | e.g. `https://marina-os.example` — CORS + allowed OAuth return origin |
| `TOKEN_ENCRYPTION_KEY` | base64 of 32 random bytes (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client (type *Web application*) |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT` | Entra ID app registration; tenant id, or `organizations` |
| `ORGANIZZE_EMAIL`, `ORGANIZZE_API_TOKEN`, `ORGANIZZE_USER_AGENT` (optional) | Organizze API v2 credentials |
| `PUBLIC_FUNCTIONS_URL` (optional) | override of `${SUPABASE_URL}/functions/v1` for redirect URIs |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase.

## 7. Deploy (Supabase)

1. `supabase link --project-ref <ref>` (merge `supabase/config.toml` sections if the CLI generated its own).
2. `supabase db push` (runs `supabase/migrations/0001_integrations.sql`).
3. `supabase secrets set APP_ORIGIN=… TOKEN_ENCRYPTION_KEY=… GOOGLE_CLIENT_ID=… …`
4. `supabase functions deploy oauth-google oauth-microsoft google-calendar-events ms-calendar-events ms-mail-actions teams-mentions organizze-proxy ics-proxy integrations-status`
   (`oauth-*` have `verify_jwt = false` because the provider redirect has no JWT; their `/start` route checks the JWT in code.)
5. Google Cloud console: enable Calendar API; OAuth consent screen; authorized redirect URI
   `https://<ref>.supabase.co/functions/v1/oauth-google/callback`.
6. Entra ID: register a *Web* app, redirect URI `…/oauth-microsoft/callback`, client secret, delegated permissions
   `User.Read`, `Calendars.Read`, `Mail.ReadBasic`, `Chat.Read`, `offline_access`.
7. Wire Supabase Auth in the app and call `setSessionTokenProvider`.
8. Build the app with `VITE_MARINA_API_URL` and `VITE_SUPABASE_ANON_KEY`.

## 8. Corporate policy notes (Microsoft 365)

- `Calendars.Read`, `Mail.ReadBasic`, `Mail.Read`, `Chat.Read`, `OnlineMeetings.Read`, `User.Read`, `offline_access`
  (delegated) do **not** require admin consent by default. `ChannelMessage.Read.All` (delegated) **does** — so
  channel messages are out of scope.
- A tenant can disable user consent entirely or restrict it to verified publishers / low-risk permissions. Then the
  user sees "Need admin approval" and Entra ID redirects back with an error containing **AADSTS90094** (or
  **AADSTS90095** when the admin-consent workflow is enabled); **AADSTS65001** appears when consent is missing at
  token time. `oauth-microsoft` maps these to `policy_blocked` → pill "Indisponível pela política da organização",
  with a gentle explanation (ask IT, or simply go without). Detection: `isAdminConsentError()` (tested).
- Each Microsoft feature is consented separately (incremental consent), so a blocked Teams doesn't break the calendar.

## 9. Apple / Shortcuts / Share Sheet (future plan — nothing implemented)

- Calendar, Reminders and Health are only reachable through native **EventKit / HealthKit**; a PWA has no access.
  Today: export iCloud calendars as `.ics` and import them; a future native companion (or Capacitor shell) could
  sync EventKit into the same `external` model (`provider: 'apple'`, `globalId` = calendarItemExternalIdentifier).
- **Shortcuts**: the "Open URLs" action can open MARINA OS deep links; "Get Contents of URL" could POST to an Edge
  Function later (e.g. quick capture). Requires an authenticated endpoint first.
- **Web Share Target** (manifest `share_target`) is still **not supported by Safari/WebKit on iOS** (WebKit bug
  194593, open since 2019); only outbound Web Share works. Re-check before building a share-to-app flow.

## 10. Research findings & sources (checked 2026-10-02)

- **Google Calendar API v3** — OAuth 2.0 web-server flow with `access_type=offline` + `prompt=consent` to get a refresh
  token; `events.list` with `singleEvents=true`, `timeMin`/`timeMax`, `showDeleted`; incremental sync with
  `nextSyncToken` (only on the last page; `410 Gone` → discard token and full-sync; `timeMin` allowed on the initial
  full sync, not with `syncToken`); events carry `iCalUID`; read-only scopes `calendar.events.readonly`,
  `calendar.calendarlist.readonly` (or broader `calendar.readonly`).
  https://developers.google.com/workspace/calendar/api/v3/reference/events/list ·
  https://developers.google.com/workspace/calendar/api/guides/sync ·
  https://developers.google.com/workspace/calendar/api/auth ·
  https://developers.google.com/identity/protocols/oauth2/web-server
- **Microsoft Graph** — permission reference (delegated `Mail.ReadBasic`: "read email … except body, previewBody,
  attachments and any extended properties", admin consent **No**; `Mail.Read` No; `Calendars.Read` No; `Chat.Read`
  No; `OnlineMeetings.Read` No; `ChannelMessage.Read.All` **Yes**).
  https://learn.microsoft.com/en-us/graph/permissions-reference ·
  `/me/calendarView` (UTC unless `Prefer: outlook.timezone`): https://learn.microsoft.com/en-us/graph/api/user-list-calendarview ·
  `calendarView/delta` (`@odata.deltaLink`, `@removed`, no `$select`): https://learn.microsoft.com/en-us/graph/api/event-delta ·
  event `iCalUId` (different per occurrence), `isCancelled`, `isAllDay`: https://learn.microsoft.com/en-us/graph/api/resources/event ·
  messages with `$select/$filter/$orderby`: https://learn.microsoft.com/en-us/graph/api/user-list-messages ·
  chats (`$expand=lastMessagePreview`, `$orderby=lastMessagePreview/createdDateTime desc`, `$top` ≤ 50): https://learn.microsoft.com/en-us/graph/api/chat-list ·
  chat messages (`$top` ≤ 50, `$orderby=createdDateTime desc`): https://learn.microsoft.com/en-us/graph/api/chat-list-messages ·
  auth code + PKCE: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow ·
  user consent settings / AADSTS90094: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent ,
  https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/application-sign-in-unexpected-user-consent-error
- **Organizze** — official public API v2 documented at https://github.com/organizze/api-doc : base
  `https://api.organizze.com.br/rest/v2`, HTTP Basic (e-mail : API token from
  https://app.organizze.com.br/configuracoes/api-keys), **User-Agent required** (400 without it), JSON. Endpoints:
  `/accounts`, `/categories`, `/transactions?start_date&end_date` (expands to whole months; default current month),
  `/credit_cards`, `/credit_cards/{id}/invoices`. Transaction fields: `id, description, date, paid, amount_cents
  (negative = expense), account_id, account_type ('CreditCard'…), category_id, updated_at`. No CORS support is
  documented and Basic credentials must not ship to the browser → server proxy.
- **Toki** ("Toki – The AI Calendar", toki.com, formerly yestoki): AI calendar assistant that syncs Google, Outlook,
  Apple/iCloud (CalDAV) calendars and takes input from WhatsApp/Telegram/iMessage. **No official public developer
  API, webhook, MCP server or ICS feed was found** (a GitHub project named `harperreed/toki` with an MCP server is an
  unrelated todo CLI). → Fallback implemented: read the underlying calendars and dedupe by iCalUID.
  https://apps.apple.com/us/app/toki-the-ai-calendar/id6557056348
- **Apple** — EventKit / HealthKit are native-only: https://developer.apple.com/documentation/eventkit ·
  https://developer.apple.com/documentation/healthkit · Web Share Target status in WebKit:
  https://bugs.webkit.org/show_bug.cgi?id=194593 , https://firt.dev/notes/pwa-ios/
- **iCalendar** — RFC 5545: https://www.rfc-editor.org/rfc/rfc5545 · PKCE — RFC 7636 (S256 test vector verified).

## 11. Code map

| Path | What |
|---|---|
| `src/integrations/types.ts` | contracts (ProviderInfo, Remote*, providers, SyncReport) |
| `src/integrations/registry.ts` | provider catalogue, `providerStatus`, `statusLabel`, `isAdminConsentError` |
| `src/integrations/backend.ts` | fetch client, `startOAuth`, `setSessionTokenProvider` |
| `src/integrations/{google,microsoft,outlook,teams,organizze}.ts` | adapters (backend only) |
| `src/integrations/sync.ts` | `reconcile`, `planCalendarSync`/`applyCalendarEvents`, `planTransactions`/`applyTransactions`, `applyAccounts`, `applyActionCandidates` |
| `src/integrations/run.ts` | "Sincronizar agora", OAuth return parsing, connection rows |
| `src/integrations/ics/` | `parseICS`, `toICS`, `importICSText`, `importICSUrl` |
| `src/integrations/seed.ts` | one `IntegrationConnection` per provider, honest initial status |
| `src/features/integrations/` | `/ajustes/integracoes` screen |
| `supabase/migrations/0001_integrations.sql` | tables + RLS |
| `supabase/functions/*` | Edge Functions; `_shared/` pure mappers/classifier are unit-tested from `src/integrations/server-mappers.test.ts` |
