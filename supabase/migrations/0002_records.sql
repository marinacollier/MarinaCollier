-- MARINA OS — cloud copy of the app's records (Entrega 1: app independente com persistência na nuvem).
-- Inert until someone runs it in a Supabase project AND the app is built with VITE_SUPABASE_URL +
-- VITE_SUPABASE_ANON_KEY AND Marina signs in AND turns "Sincronizar com a nuvem" on in Ajustes → Dados.
--
-- One row per local record: (collection, id) as in the app's DB (tasks, meals, expenses…) plus the
-- profile as ('_profile', 'me') without device-only fields (privacy lock PIN hash, sync flags).
-- `data` is the record JSON as the app stores it. Not end-to-end encrypted (see docs/INDEPENDENCIA.md).
-- Deletes are soft (deleted = true, data = null) so other devices learn about them.

create table if not exists public.records (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection  text not null check (char_length(collection) between 1 and 64),
  id          text not null check (char_length(id) between 1 and 200),
  data        jsonb,
  -- Client version: the record's updatedAt in epoch ms (0 = untouched seed / never-edited profile).
  version     bigint not null default 0,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  -- Server-assigned change counter: the pull cursor (unique and increasing, unlike updated_at).
  seq         bigint not null default 0,
  primary key (user_id, collection, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);
create index if not exists records_user_seq_idx on public.records (user_id, seq);

create sequence if not exists public.records_seq;

-- Server stamps updated_at/seq (clients can't forge the cursor) and keeps the newer version:
-- an update whose version is not greater than the stored one is skipped (newer wins, also on races).
create or replace function public.records_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'user_id is immutable';
    end if;
    if new.version <= old.version then
      return null;
    end if;
  end if;
  new.updated_at := now();
  new.seq := nextval('public.records_seq');
  return new;
end $$;

drop trigger if exists records_stamp on public.records;
create trigger records_stamp before insert or update on public.records
  for each row execute function public.records_stamp();

alter table public.records enable row level security;

drop policy if exists "owner reads own records" on public.records;
create policy "owner reads own records" on public.records
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "owner inserts own records" on public.records;
create policy "owner inserts own records" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "owner updates own records" on public.records;
create policy "owner updates own records" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- No delete policy: deletes are tombstones (deleted = true). Removing an account cascades from auth.users.
revoke all on public.records from anon, authenticated;
grant select, insert, update on public.records to authenticated;
revoke all on function public.records_stamp() from public, anon, authenticated;
