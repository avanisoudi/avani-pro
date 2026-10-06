-- Avani Pro: conversations de groupes persistantes
alter table public.groups add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
create unique index if not exists groups_conversation_unique_idx on public.groups(conversation_id) where conversation_id is not null;

do $$
declare
  existing_group record;
  new_conversation uuid;
begin
  for existing_group in select id, owner_id, name from public.groups where conversation_id is null loop
    insert into public.conversations (title, is_group, created_by)
    values (existing_group.name, true, existing_group.owner_id)
    returning id into new_conversation;
    update public.groups set conversation_id = new_conversation where id = existing_group.id;
    insert into public.conversation_members (conversation_id, user_id)
    values (new_conversation, existing_group.owner_id)
    on conflict do nothing;
  end loop;
end $$;

alter table public.group_members enable row level security;
create policy "group owners manage members" on public.group_members for insert with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));
create policy "public groups can be joined" on public.group_members for insert with check (user_id = auth.uid() and exists (select 1 from public.groups g where g.id = group_id and g.visibility = 'public'));
create policy "group owners remove members" on public.group_members for delete using (user_id = auth.uid() or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_members;
