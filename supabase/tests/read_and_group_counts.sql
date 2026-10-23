-- SQL Editor/postgres privileges required. All test rows and triggers roll back.
begin;
do $$ declare a uuid; b uuid; c uuid:=gen_random_uuid(); m1 uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); begin
  select id into a from public.profiles order by id limit 1;
  select id into b from public.profiles order by id offset 1 limit 1;
  if a is null or b is null then raise exception 'Two profiles required'; end if;
  perform set_config('app.read_actor',a::text,true); perform set_config('app.read_other',b::text,true);
  perform set_config('app.read_chat',c::text,true); perform set_config('app.read_m1',m1::text,true); perform set_config('app.read_m2',m2::text,true); perform set_config('app.read_group',g::text,true);
  insert into public.conversations(id,title,is_group,created_by) values(c,'Recette temporaire lecture',true,a);
  insert into public.conversation_members(conversation_id,user_id,last_read_at) values(c,a,null),(c,b,null) on conflict do nothing;
  insert into public.messages(id,conversation_id,sender_id,body,created_at) values(m1,c,b,'Ancien message','2020-01-01T00:00:01Z'),(m2,c,b,'Dernier message','2020-01-01T00:00:02Z');
  insert into public.groups(id,owner_id,name,visibility,conversation_id) values(g,a,'Recette temporaire compteurs','private',c);
  insert into public.group_members(group_id,user_id,role) values(g,a,'owner'),(g,b,'member') on conflict do nothing;
end $$;
set local role authenticated;
do $$ declare a uuid:=current_setting('app.read_actor')::uuid; b uuid:=current_setting('app.read_other')::uuid; c uuid:=current_setting('app.read_chat')::uuid; m1 uuid:=current_setting('app.read_m1')::uuid; m2 uuid:=current_setting('app.read_m2')::uuid; g uuid:=current_setting('app.read_group')::uuid; marker timestamptz; begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  if (select unread_count from public.avani_unread_counts() where conversation_id=c)<>2 then raise exception 'Wrong initial unread count'; end if;
  if (select member_count from public.avani_group_member_counts(array[g]))<>2 then raise exception 'Wrong member count'; end if;
  marker:=public.avani_mark_chat_read(c,m2);
  if marker<>'2020-01-01T00:00:02Z'::timestamptz then raise exception 'Client clock used'; end if;
  if (select unread_count from public.avani_unread_counts() where conversation_id=c)<>0 then raise exception 'Read not persisted'; end if;
  if public.avani_mark_chat_read(c,m1)<>marker then raise exception 'Older cursor moved backwards'; end if;
  update public.conversation_members set last_read_at=null where conversation_id=c and user_id=a;
  if (select last_read_at from public.conversation_members where conversation_id=c and user_id=a)<>marker then raise exception 'Old client reset marker'; end if;
  if (select last_read_at from public.conversation_members where conversation_id=c and user_id=b) is not null then raise exception 'Other member changed'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  insert into public.messages(conversation_id,sender_id,body,created_at) values(c,b,'Nouveau message','2020-01-01T00:00:03Z');
  perform set_config('request.jwt.claim.sub',a::text,true);
  if (select unread_count from public.avani_unread_counts() where conversation_id=c)<>1 then raise exception 'New message not unread'; end if;
  perform public.avani_mark_chat_read(c,m1);
  if (select unread_count from public.avani_unread_counts() where conversation_id=c)<>1 then raise exception 'Older read consumed unseen message'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform public.avani_mark_chat_read(c,m2); raise exception 'Non-member allowed'; exception when insufficient_privilege then null; end;
  if exists(select 1 from public.avani_unread_counts() where conversation_id=c) then raise exception 'Private unread count leaked'; end if;
  if exists(select 1 from public.avani_group_member_counts(array[g])) then raise exception 'Private group count leaked'; end if;
end $$;
rollback;
