-- Reduce repeated auth.uid() evaluation in the group-members RLS predicate.
-- Preserve the existing authorization rule: users can see their own membership
-- and memberships for groups they belong to.
drop policy if exists "group members readable" on public.group_members;

create policy "group members readable"
  on public.group_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.avani_is_group_member(group_id)
  );
