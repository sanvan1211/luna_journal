-- Luna database schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create extension if not exists "pgcrypto";

-- ───────────────────────── entries ─────────────────────────
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null default '',
  content     text not null default '',          -- markdown
  mood        text,                               -- self-reported only, never AI-assigned
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists entries_user_created_idx on public.entries (user_id, created_at desc);

-- ───────────────────────── insights ─────────────────────────
create table if not exists public.insights (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  insight               text not null,
  explanation           text not null default '',
  confidence            text not null check (confidence in ('low','medium','high')),
  supporting_entry_ids  uuid[] not null default '{}',
  created_at            timestamptz not null default now()
);
create index if not exists insights_user_created_idx on public.insights (user_id, created_at desc);

-- ───────────────────────── luna_memory ─────────────────────────
create table if not exists public.luna_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('theme','goal','strategy')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists luna_memory_user_idx on public.luna_memory (user_id, created_at desc);

-- ───────────────────────── updated_at trigger ─────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- ───────────────────────── Row-Level Security ─────────────────────────
-- Every table: a user can only see and change their own rows.
alter table public.entries     enable row level security;
alter table public.insights    enable row level security;
alter table public.luna_memory enable row level security;

do $$
declare t text;
begin
  foreach t in array array['entries','insights','luna_memory'] loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);

    execute format('create policy "own rows select" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- ───────────────────────── Delete account ─────────────────────────
-- Lets a signed-in user delete their own account. All rows above are removed
-- automatically by "on delete cascade".
create or replace function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
