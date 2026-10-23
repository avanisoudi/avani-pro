-- Allow a user who has joined a public community group to join its chat.
-- Keep RLS enabled and require both public visibility and an existing group membership.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'conversation_members'
      and policyname = 'members join public group chats'
  ) then
    create policy "members join public group chats"
      on public.conversation_members
      for insert
      to authenticated
      with check (
        user_id = (select auth.uid())
        and exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.conversation_id = conversation_members.conversation_id
            and g.visibility = 'public'
            and gm.user_id = (select auth.uid())
        )
      );
  end if;
end $$;
