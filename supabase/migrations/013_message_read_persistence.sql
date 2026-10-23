-- Ensure a conversation member can persist their own read marker.
-- This migration is safe to run more than once.
alter table public.conversation_members
  add column if not exists last_read_at timestamptz;

drop policy if exists "members update own membership" on public.conversation_members;

create policy "members update own membership"
  on public.conversation_members
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
