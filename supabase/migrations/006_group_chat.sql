-- Avani Pro: conversations de groupes persistantes
alter table public.groups add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
create unique index if not exists groups_conversation_unique_idx on public.groups(conversation_id) where conversation_id is not null;

alter table public.group_members enable row level security;
create policy "group owners manage members" on public.group_members for insert with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy "public groups can be joined" on public.group_members for insert with check (user_id = auth.uid() and exists (select 1 from public.groups g where g.id = group_id and g.visibility = 'public'));
create policy "group owners remove members" on public.group_members for delete using (user_id = auth.uid() or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_members;
