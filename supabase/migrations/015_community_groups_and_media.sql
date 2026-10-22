-- Repair media storage reads and atomic community-group creation.
alter table public.posts add column if not exists media_paths text[] not null default '{}';
alter table public.conversations add column if not exists avatar_path text;
create or replace function public.avani_is_group_member(p_group uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from public.group_members where group_id=p_group and user_id=auth.uid()); $$;
revoke all on function public.avani_is_group_member(uuid) from public,anon;
grant execute on function public.avani_is_group_member(uuid) to authenticated;
drop policy if exists "group members readable" on public.group_members;
create policy "group members readable" on public.group_members for select to authenticated using(user_id=auth.uid() or public.avani_is_group_member(group_id));
create or replace function public.avani_create_community_group(p_name text,p_description text,p_visibility text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); chat uuid; g public.groups;
begin
if actor is null then raise exception 'Connexion requise' using errcode='42501'; end if;
if length(trim(coalesce(p_name,'')))<2 or length(trim(p_name))>100 then raise exception 'Nom requis (2 à 100 caractères)'; end if;
if p_visibility is null or p_visibility not in ('private','public') then raise exception 'Visibilité invalide'; end if;
if length(coalesce(p_description,''))>2000 then raise exception 'Description trop longue'; end if;
if not exists(select 1 from public.profiles where id=actor) then raise exception 'Profil introuvable'; end if;
insert into public.conversations(title,is_group,created_by) values(trim(p_name),true,actor) returning id into chat;
insert into public.conversation_members(conversation_id,user_id) values(chat,actor);
insert into public.groups(owner_id,name,description,visibility,conversation_id) values(actor,trim(p_name),nullif(trim(p_description),''),p_visibility,chat) returning * into g;
insert into public.group_members(group_id,user_id,role) values(g.id,actor,'owner');
return to_jsonb(g);
end $$;
revoke all on function public.avani_create_community_group(text,text,text) from public,anon;
grant execute on function public.avani_create_community_group(text,text,text) to authenticated;
create or replace function public.avani_set_chat_avatar(p_chat uuid,p_path text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid();
begin
if actor is null or not exists(select 1 from public.conversations c join public.conversation_members m on m.conversation_id=c.id where c.id=p_chat and c.is_group and c.created_by=actor and m.user_id=actor) then raise exception 'Seul le responsable du groupe peut modifier la photo' using errcode='42501'; end if;
if p_path is not null and (p_path not like p_chat::text||'/'||actor::text||'/%' or not exists(select 1 from storage.objects where bucket_id='message-attachments' and name=p_path)) then raise exception 'Photo de groupe invalide'; end if;
update public.conversations set avatar_path=p_path,updated_at=now() where id=p_chat;
end $$;
revoke all on function public.avani_set_chat_avatar(uuid,text) from public,anon;
grant execute on function public.avani_set_chat_avatar(uuid,text) to authenticated;
insert into storage.buckets(id,name,public) values('post-media','post-media',false) on conflict(id) do nothing;
drop policy if exists "post media readable by members" on storage.objects;
create policy "post media readable by members" on storage.objects for select to authenticated using(bucket_id='post-media');
