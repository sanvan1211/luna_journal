-- Saves the "Luna's reflection" conversation for each journal entry.
-- NOT applied yet. Run this once in Supabase → SQL Editor. Until then the conversation works
-- but lives only in the open page (Luna says so under the chat).
--
-- One row per entry. Deleting the entry (or the account) deletes its conversation.

create table if not exists public.entry_chats (
  entry_id    uuid primary key references public.entries(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  messages    jsonb not null default '[]',   -- [{ role: "luna" | "user", content, at }]
  offer       text check (offer in ('dismissed', 'added')),  -- "Add this to your journal?" answered
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.entry_chats enable row level security;

drop policy if exists "own rows select" on public.entry_chats;
drop policy if exists "own rows insert" on public.entry_chats;
drop policy if exists "own rows update" on public.entry_chats;
drop policy if exists "own rows delete" on public.entry_chats;
create policy "own rows select" on public.entry_chats for select to authenticated using (user_id = auth.uid());
create policy "own rows insert" on public.entry_chats for insert to authenticated with check (user_id = auth.uid());
create policy "own rows update" on public.entry_chats for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows delete" on public.entry_chats for delete to authenticated using (user_id = auth.uid());

drop trigger if exists entry_chats_touch on public.entry_chats;
create trigger entry_chats_touch before update on public.entry_chats
  for each row execute function public.touch_updated_at();
