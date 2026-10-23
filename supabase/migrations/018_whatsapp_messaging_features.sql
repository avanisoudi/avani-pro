-- Avani Pro messaging enhancements inspired by WhatsApp.
-- Idempotent schema for per-user inbox controls, starred/pinned messages and expiry metadata.
-- This migration does not enable a scheduler: expired-message cleanup must be invoked by a trusted
-- scheduled job or Edge Function; clients must never receive expired messages.

create table if not exists public.conversation_user_settings (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_archived boolean not null default false,
  is_muted boolean not null default false,
  is_pinned boolean not null default false,
  wallpaper text,
  disappearing_after_seconds integer not null default 0
    check (disappearing_after_seconds in (0, 86400, 604800, 7776000)),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_user_settings_inbox_idx
  on public.conversation_user_settings(user_id, is_archived, is_pinned desc, updated_at desc);

alter table public.conversation_user_settings enable row level security;
drop policy if exists "users read own conversation settings" on public.conversation_user_settings;
create policy "users read own conversation settings"
  on public.conversation_user_settings for select
  using (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "users create own conversation settings" on public.conversation_user_settings;
create policy "users create own conversation settings"
  on public.conversation_user_settings for insert
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "users update own conversation settings" on public.conversation_user_settings;
create policy "users update own conversation settings"
  on public.conversation_user_settings for update
  using (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()))
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "users delete own conversation settings" on public.conversation_user_settings;
create policy "users delete own conversation settings"
  on public.conversation_user_settings for delete
  using (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));

create table if not exists public.message_stars (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_stars_user_created_idx
  on public.message_stars(user_id, created_at desc);
alter table public.message_stars enable row level security;
drop policy if exists "users read own starred messages" on public.message_stars;
create policy "users read own starred messages"
  on public.message_stars for select
  using (user_id = auth.uid() and exists (
    select 1 from public.messages m
    where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid())
  ));
drop policy if exists "users star messages in their conversations" on public.message_stars;
create policy "users star messages in their conversations"
  on public.message_stars for insert
  with check (user_id = auth.uid() and exists (
    select 1 from public.messages m
    where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid())
  ));
drop policy if exists "users unstar own messages" on public.message_stars;
create policy "users unstar own messages"
  on public.message_stars for delete
  using (user_id = auth.uid());

create table if not exists public.message_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);
create index if not exists message_pins_conversation_created_idx
  on public.message_pins(conversation_id, created_at desc);
alter table public.message_pins enable row level security;
drop policy if exists "members read pinned messages" on public.message_pins;
create policy "members read pinned messages"
  on public.message_pins for select
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "members pin messages in their conversations" on public.message_pins;
create policy "members pin messages in their conversations"
  on public.message_pins for insert
  with check (
    pinned_by = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
    and exists (select 1 from public.messages m
      where m.id = message_id and m.conversation_id = conversation_id)
  );
drop policy if exists "members unpin messages in their conversations" on public.message_pins;
create policy "members unpin messages in their conversations"
  on public.message_pins for delete
  using (public.is_conversation_member(conversation_id, auth.uid()));

alter table public.messages add column if not exists expires_at timestamptz;
create index if not exists messages_expiry_idx
  on public.messages(expires_at) where expires_at is not null;

-- Keep message controls live across clients when enabled by the UI.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.conversation_user_settings;
  end if;
exception when duplicate_object then null;
end $$;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.message_stars;
  end if;
exception when duplicate_object then null;
end $$;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.message_pins;
  end if;
exception when duplicate_object then null;
end $$;
