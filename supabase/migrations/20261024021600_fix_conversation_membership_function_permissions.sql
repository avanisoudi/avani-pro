-- Fix the missing EXECUTE grant used by message stars/pins RLS policies.
-- The helper only answers membership for the current authenticated user, preventing
-- callers from probing whether another user belongs to a conversation.
create or replace function public.is_conversation_member(
  target_conversation uuid,
  target_user uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select auth.uid() is not null
    and target_user = auth.uid()
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = target_conversation
        and cm.user_id = auth.uid()
    );
$function$;

revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
