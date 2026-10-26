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


-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Bring your own AI key (Settings → AI model)
-- The key is stored encrypted in Supabase Vault. ai_settings only holds a pointer to the Vault
-- secret and the key's last 4 characters. The browser can read its own row (no key in it) but
-- cannot write it or call the key functions: only the ai-settings / AI Edge Functions can, with
-- the service role, after verifying the user's sign-in.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

create extension if not exists supabase_vault with schema vault;

create table if not exists public.ai_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  provider       text not null default 'default' check (provider in ('default', 'groq', 'huggingface', 'custom')),
  model          text not null default '',
  base_url       text not null default '',     -- only for 'custom'; checked server-side (https, public host)
  key_secret_id  uuid,                          -- vault.secrets id; never the key itself
  key_last4      text,
  updated_at     timestamptz not null default now()
);

alter table public.ai_settings enable row level security;
drop policy if exists "own rows select" on public.ai_settings;
create policy "own rows select" on public.ai_settings for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies: changes only go through the ai-settings Edge Function.
revoke insert, update, delete on public.ai_settings from anon, authenticated;

drop trigger if exists ai_settings_touch on public.ai_settings;
create trigger ai_settings_touch before update on public.ai_settings
  for each row execute function public.touch_updated_at();

-- Store or replace a user's key.
create or replace function public.luna_set_ai_key(p_user uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select key_secret_id into sid from public.ai_settings where user_id = p_user;
  if sid is null then
    sid := vault.create_secret(p_key, null, 'Luna: AI key for one user');
  else
    perform vault.update_secret(sid, p_key);
  end if;
  insert into public.ai_settings (user_id, key_secret_id, key_last4) values (p_user, sid, right(p_key, 4))
    on conflict (user_id) do update set key_secret_id = excluded.key_secret_id, key_last4 = excluded.key_last4, updated_at = now();
end $$;

-- Read a user's key (decrypted). Server-side only.
create or replace function public.luna_get_ai_key(p_user uuid) returns text
language sql security definer set search_path = '' stable as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds
  join public.ai_settings s on s.key_secret_id = ds.id
  where s.user_id = p_user;
$$;

-- Remove a user's key.
create or replace function public.luna_delete_ai_key(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select key_secret_id into sid from public.ai_settings where user_id = p_user;
  if sid is not null then
    update public.ai_settings set key_secret_id = null, key_last4 = null where user_id = p_user;
    delete from vault.secrets where id = sid;
  end if;
end $$;

-- Deleting the settings row (or the whole account) also deletes the Vault secret.
create or replace function public.luna_ai_settings_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.key_secret_id is not null then delete from vault.secrets where id = old.key_secret_id; end if;
  return old;
end $$;
drop trigger if exists ai_settings_cleanup on public.ai_settings;
create trigger ai_settings_cleanup after delete on public.ai_settings
  for each row execute function public.luna_ai_settings_cleanup();

revoke all on function public.luna_set_ai_key(uuid, text) from public, anon, authenticated;
revoke all on function public.luna_get_ai_key(uuid) from public, anon, authenticated;
revoke all on function public.luna_delete_ai_key(uuid) from public, anon, authenticated;
revoke all on function public.luna_ai_settings_cleanup() from public, anon, authenticated;
grant execute on function public.luna_set_ai_key(uuid, text) to service_role;
grant execute on function public.luna_get_ai_key(uuid) to service_role;
grant execute on function public.luna_delete_ai_key(uuid) to service_role;
