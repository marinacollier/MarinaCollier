-- MARINA OS — integrations backend schema.
-- Tokens live only here (encrypted by the Edge Functions with AES-GCM; key in function secrets).
-- The browser never reads token columns: RLS restricts rows to their owner and column privileges
-- hide the encrypted token from the `authenticated` role. Edge Functions use the service role.

create extension if not exists pgcrypto;

-- ─── integration_accounts ────────────────────────────────────────────────────
-- One row per (user, provider). Microsoft features (calendar / mail / teams) get one row each,
-- because each is consented separately (incremental consent) and can be blocked separately by the tenant.
create table if not exists public.integration_accounts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider                 text not null check (provider in ('google', 'microsoft', 'outlook', 'teams')),
  account_label            text,
  status                   text not null default 'needs_auth'
                           check (status in ('connected', 'needs_auth', 'error', 'policy_blocked')),
  scopes                   text[] not null default '{}',
  -- base64(iv || AES-GCM ciphertext). Alternative: store in Supabase Vault and keep only the secret id here.
  refresh_token_encrypted  text,
  last_sync_at             timestamptz,
  error                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.integration_accounts enable row level security;

drop policy if exists "owner can read own integration rows" on public.integration_accounts;
create policy "owner can read own integration rows"
  on public.integration_accounts for select
  to authenticated
  using (user_id = (select auth.uid()));

-- No insert/update/delete policies: only the Edge Functions (service role) write.
revoke all on public.integration_accounts from anon, authenticated;
grant select (id, user_id, provider, account_label, status, scopes, last_sync_at, error, created_at, updated_at)
  on public.integration_accounts to authenticated;

-- ─── sync_state ──────────────────────────────────────────────────────────────
-- Incremental sync cursors: Google `nextSyncToken`, Graph `@odata.deltaLink`.
create table if not exists public.sync_state (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider    text not null,
  resource    text not null,           -- calendarId (or 'me' / 'messages')
  cursor      text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider, resource)
);

alter table public.sync_state enable row level security;

drop policy if exists "owner can read own sync state" on public.sync_state;
create policy "owner can read own sync state"
  on public.sync_state for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.sync_state from anon, authenticated;
grant select (user_id, provider, resource, updated_at) on public.sync_state to authenticated;

-- ─── oauth_states ────────────────────────────────────────────────────────────
-- One-time OAuth `state` (CSRF protection) bound to the user who started the flow, plus the
-- PKCE verifier. Service role only; rows expire after 10 minutes.
create table if not exists public.oauth_states (
  state          text primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  provider       text not null check (provider in ('google', 'microsoft')),
  features       text[] not null default '{}',
  code_verifier  text,
  return_to      text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '10 minutes'
);

alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;

-- ─── housekeeping ────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists integration_accounts_touch on public.integration_accounts;
create trigger integration_accounts_touch before update on public.integration_accounts
  for each row execute function public.touch_updated_at();

drop trigger if exists sync_state_touch on public.sync_state;
create trigger sync_state_touch before update on public.sync_state
  for each row execute function public.touch_updated_at();
