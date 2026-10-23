-- Advance only to a message actually present in this conversation, never the browser clock.
create or replace function public.avani_mark_chat_read(p_chat uuid, p_message uuid)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); boundary timestamptz; result timestamptz;
begin
  if actor is null then raise exception 'Connexion requise' using errcode='42501'; end if;
  perform 1 from public.conversation_members where conversation_id=p_chat and user_id=actor for update;
  if not found then raise exception 'Accès refusé' using errcode='42501'; end if;
  select created_at into boundary from public.messages where id=p_message and conversation_id=p_chat;
  if boundary is null then raise exception 'Message introuvable'; end if;
  update public.conversation_members set last_read_at=greatest(coalesce(last_read_at,'-infinity'::timestamptz),boundary)
    where conversation_id=p_chat and user_id=actor returning last_read_at into result;
  return result;
end $$;
-- Older clients/devices must not move a stored read marker backwards either.
create or replace function public.avani_keep_read_marker() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.last_read_at is not null and (new.last_read_at is null or new.last_read_at<old.last_read_at) then new.last_read_at:=old.last_read_at; end if;
  return new;
end $$;
drop trigger if exists avani_keep_read_marker on public.conversation_members;
create trigger avani_keep_read_marker before update of last_read_at on public.conversation_members for each row execute function public.avani_keep_read_marker();

create or replace function public.avani_unread_counts()
returns table(conversation_id uuid,unread_count bigint) language sql stable security definer set search_path=public,pg_temp as $$
  select cm.conversation_id,count(m.id) from public.conversation_members cm
  left join public.messages m on m.conversation_id=cm.conversation_id and m.sender_id<>auth.uid()
    and m.created_at>coalesce(cm.last_read_at,'-infinity'::timestamptz) and m.deleted_at is null
  where cm.user_id=auth.uid() group by cm.conversation_id;
$$;
create or replace function public.avani_group_member_counts(p_groups uuid[])
returns table(group_id uuid,member_count bigint) language sql stable security definer set search_path=public,pg_temp as $$
  select g.id,count(distinct gm.user_id) from public.groups g
  left join public.group_members gm on gm.group_id=g.id
  where g.id=any(p_groups) and (g.visibility='public' or g.owner_id=auth.uid() or exists(
    select 1 from public.group_members mine where mine.group_id=g.id and mine.user_id=auth.uid()))
  group by g.id;
$$;
revoke all on function public.avani_mark_chat_read(uuid,uuid) from public,anon;
revoke all on function public.avani_unread_counts() from public,anon;
revoke all on function public.avani_group_member_counts(uuid[]) from public,anon;
grant execute on function public.avani_mark_chat_read(uuid,uuid) to authenticated;
grant execute on function public.avani_unread_counts() to authenticated;
grant execute on function public.avani_group_member_counts(uuid[]) to authenticated;
create index if not exists messages_unread_lookup on public.messages(conversation_id,created_at) where deleted_at is null;
