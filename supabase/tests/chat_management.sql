-- Integration recipe: run only as a DB administrator in a controlled environment.
-- Uses three existing profiles, creates temporary chats, rolls back all changes.
-- No account credentials or personal profile fields are read.
begin;
do $$
declare people uuid[]; a uuid; b uuid; c uuid; chat uuid; dm uuid; msg uuid; seen integer;
begin
  select array_agg(id) into people from (select id from public.profiles order by id limit 3) p;
  if coalesce(cardinality(people),0)<3 then raise exception 'Three existing profiles required'; end if;
  a:=people[1]; b:=people[2]; c:=people[3];
  perform set_config('request.jwt.claim.sub',a::text,true);
  chat:=public.avani_create_chat('Transactional chat test',true,array[b]);
  if (select count(*) from public.conversation_members where conversation_id=chat)<>2 then raise exception 'Incomplete membership'; end if;
  perform public.avani_manage_chat(chat,'rename',null,'Renamed test');
  if (select title from public.conversations where id=chat)<>'Renamed test' then raise exception 'Rename failed'; end if;
  perform public.avani_manage_chat(chat,'add',c);
  if not exists(select 1 from public.conversation_members where conversation_id=chat and user_id=c) then raise exception 'Add failed'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  begin
    perform public.avani_manage_chat(chat,'rename',null,'Forbidden');
    raise exception 'Ordinary member renamed group';
  exception when insufficient_privilege then null; end;
  if public.avani_can_invite_to_chat(chat) then raise exception 'Ordinary member can invite'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  begin
    perform public.avani_manage_chat(chat,'leave');
    raise exception 'Owner left without transfer';
  exception when raise_exception then if sqlerrm not like 'Transférez%' then raise; end if; end;
  perform public.avani_manage_chat(chat,'remove',c);
  if exists(select 1 from public.conversation_members where conversation_id=chat and user_id=c) then raise exception 'Remove failed'; end if;
  perform set_config('request.jwt.claim.sub',c::text,true);
  begin
    perform public.avani_manage_chat(chat,'add',c);
    raise exception 'Non-member managed group';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.avani_manage_chat(chat,'transfer',b);
  perform public.avani_manage_chat(chat,'leave');
  if exists(select 1 from public.conversation_members where conversation_id=chat and user_id=a) then raise exception 'Leave failed'; end if;
  dm:=public.avani_create_chat('Test DM',false,array[b]);
  if dm<>public.avani_create_chat('Test DM',false,array[b]) then raise exception 'Duplicate DM'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.avani_create_chat('Forbidden',true,array[b]);
    raise exception 'Anonymous creation allowed';
  exception when insufficient_privilege then null; end;

  -- Exercise RLS as an API-authenticated user, not with postgres bypass.
  perform set_config('request.jwt.claim.sub',a::text,true);
  execute 'set local role authenticated';
  chat:=public.avani_create_chat('RLS test',true,array[b]);
  insert into public.messages(conversation_id,sender_id,body) values(chat,a,'Transactional RLS test') returning id into msg;
  perform set_config('request.jwt.claim.sub',b::text,true);
  select count(*) into seen from public.messages where id=msg;
  if seen<>1 then raise exception 'Recipient cannot read message'; end if;
  update public.messages set body='Forbidden edit' where id=msg;
  get diagnostics seen=row_count;
  if seen<>0 then raise exception 'Recipient edited sender message'; end if;
  begin
    insert into public.conversation_members(conversation_id,user_id) values(chat,c);
    raise exception 'Ordinary member invited a user';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',c::text,true);
  select count(*) into seen from public.messages where id=msg;
  if seen<>0 then raise exception 'Message leaked to non-member'; end if;
  begin
    insert into public.messages(conversation_id,sender_id,body) values(chat,c,'Forbidden');
    raise exception 'Non-member sent a message';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.conversation_members(conversation_id,user_id) values(chat,c);
    raise exception 'Non-member joined private chat';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
