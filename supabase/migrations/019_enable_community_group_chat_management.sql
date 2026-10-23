-- Extend chat management to community groups while preserving owner-only administration.
create or replace function public.avani_manage_chat(p_chat uuid, p_action text, p_target uuid default null, p_title text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); owner_id uuid; grouped boolean; community_group uuid;
begin
  if actor is null then raise exception 'Connexion requise' using errcode='42501'; end if;
  select created_by, is_group into owner_id, grouped from public.conversations where id=p_chat for update;
  if owner_id is null or not exists (select 1 from public.conversation_members where conversation_id=p_chat and user_id=actor) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if not grouped then raise exception 'Cette action est réservée aux groupes'; end if;
  select id into community_group from public.groups where conversation_id=p_chat limit 1;
  if p_action='leave' then
    if actor=owner_id then raise exception 'Transférez la gestion à un membre avant de quitter le groupe'; end if;
    delete from public.conversation_members where conversation_id=p_chat and user_id=actor;
    if community_group is not null then delete from public.group_members where group_id=community_group and user_id=actor; end if;
    return;
  end if;
  if actor<>owner_id then raise exception 'Seul le responsable du groupe peut effectuer cette action' using errcode='42501'; end if;
  if p_action='rename' then
    if length(trim(coalesce(p_title,'')))<1 or length(trim(p_title))>100 then raise exception 'Nom requis (100 caractères maximum)'; end if;
    update public.conversations set title=trim(p_title),updated_at=now() where id=p_chat;
    if community_group is not null then update public.groups set name=trim(p_title) where id=community_group; end if;
  elsif p_action='add' then
    if p_target is null or not exists(select 1 from public.profiles where id=p_target) then raise exception 'Profil introuvable'; end if;
    if (select count(*) from public.conversation_members where conversation_id=p_chat)>=101 then raise exception 'Limite de 101 membres atteinte'; end if;
    if community_group is not null then
      insert into public.group_members(group_id,user_id,role) values(community_group,p_target,'member') on conflict do nothing;
    end if;
    insert into public.conversation_members(conversation_id,user_id) values(p_chat,p_target) on conflict do nothing;
  elsif p_action='remove' then
    if p_target is null or p_target=actor then raise exception 'Utilisez le transfert de gestion pour votre propre compte'; end if;
    delete from public.conversation_members where conversation_id=p_chat and user_id=p_target;
    if community_group is not null then delete from public.group_members where group_id=community_group and user_id=p_target and p_target<>owner_id; end if;
  elsif p_action='transfer' then
    if p_target is null or p_target=actor or not exists(select 1 from public.conversation_members where conversation_id=p_chat and user_id=p_target) then raise exception 'Choisissez un autre membre du groupe'; end if;
    update public.conversations set created_by=p_target,updated_at=now() where id=p_chat;
    if community_group is not null then
      update public.groups set owner_id=p_target where id=community_group;
      update public.group_members set role='member' where group_id=community_group and user_id=actor;
      update public.group_members set role='owner' where group_id=community_group and user_id=p_target;
    end if;
  else raise exception 'Action inconnue'; end if;
end $$;
revoke all on function public.avani_manage_chat(uuid,text,uuid,text) from public,anon;
grant execute on function public.avani_manage_chat(uuid,text,uuid,text) to authenticated;
