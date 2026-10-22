-- Atomic creation and creator-controlled management of private chat groups.
-- Does not modify public groups or existing RLS policies.
create or replace function public.avani_create_chat(p_title text, p_group boolean, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); ids uuid[]; chat uuid;
begin
  if actor is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  select array_agg(distinct id) into ids from unnest(p_members) id where id is not null and id <> actor;
  if coalesce(cardinality(ids),0) < 1 or cardinality(ids) > 100 then raise exception 'Choisissez entre 1 et 100 personnes'; end if;
  if p_group is null then raise exception 'Type de discussion requis'; end if;
  if not p_group and cardinality(ids) <> 1 then raise exception 'Une discussion privée accepte un seul destinataire'; end if;
  if p_group and (length(trim(coalesce(p_title,''))) < 1 or length(trim(p_title)) > 100) then raise exception 'Nom du groupe requis (100 caractères maximum)'; end if;
  if (select count(*) from public.profiles where id = any(array_append(ids, actor))) <> cardinality(ids)+1 then raise exception 'Profil introuvable'; end if;
  if not p_group then
    -- Both users obtain the same lock, preventing concurrent duplicate DMs.
    perform pg_advisory_xact_lock(hashtextextended(least(actor::text,ids[1]::text)||greatest(actor::text,ids[1]::text),0));
    select c.id into chat from public.conversations c
      where not c.is_group
      and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=actor)
      and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=ids[1])
      and (select count(*) from public.conversation_members m where m.conversation_id=c.id)=2
      order by c.created_at limit 1;
    if chat is not null then return chat; end if;
  end if;
  insert into public.conversations(title,is_group,created_by) values(left(trim(coalesce(p_title,'')),100),p_group,actor) returning id into chat;
  insert into public.conversation_members(conversation_id,user_id) select chat,id from unnest(array_append(ids,actor)) id;
  return chat;
end $$;

create or replace function public.avani_manage_chat(p_chat uuid, p_action text, p_target uuid default null, p_title text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); owner_id uuid; grouped boolean;
begin
  if actor is null then raise exception 'Connexion requise' using errcode='42501'; end if;
  select created_by,is_group into owner_id,grouped from public.conversations where id=p_chat for update;
  if owner_id is null or not exists(select 1 from public.conversation_members where conversation_id=p_chat and user_id=actor) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if not grouped then raise exception 'Cette action est réservée aux groupes'; end if;
  -- Public/community group rosters are managed by the Groups feature, not this API.
  if exists(select 1 from public.groups where conversation_id=p_chat) then raise exception 'Ce groupe est géré depuis la rubrique Groupes'; end if;
  if p_action='leave' then
    if actor=owner_id then raise exception 'Transférez la gestion à un membre avant de quitter le groupe'; end if;
    delete from public.conversation_members where conversation_id=p_chat and user_id=actor;
    return;
  end if;
  if actor<>owner_id then raise exception 'Seul le responsable du groupe peut effectuer cette action' using errcode='42501'; end if;
  if p_action='rename' then
    if length(trim(coalesce(p_title,'')))<1 or length(trim(p_title))>100 then raise exception 'Nom requis (100 caractères maximum)'; end if;
    update public.conversations set title=trim(p_title),updated_at=now() where id=p_chat;
  elsif p_action='add' then
    if p_target is null or not exists(select 1 from public.profiles where id=p_target) then raise exception 'Profil introuvable'; end if;
    if (select count(*) from public.conversation_members where conversation_id=p_chat)>=101 then raise exception 'Limite de 101 membres atteinte'; end if;
    insert into public.conversation_members(conversation_id,user_id) values(p_chat,p_target) on conflict do nothing;
  elsif p_action='remove' then
    if p_target is null or p_target=actor then raise exception 'Utilisez le transfert de gestion pour votre propre compte'; end if;
    delete from public.conversation_members where conversation_id=p_chat and user_id=p_target;
  elsif p_action='transfer' then
    if p_target is null or p_target=actor or not exists(select 1 from public.conversation_members where conversation_id=p_chat and user_id=p_target) then raise exception 'Choisissez un autre membre du groupe'; end if;
    update public.conversations set created_by=p_target,updated_at=now() where id=p_chat;
  else raise exception 'Action inconnue';
  end if;
end $$;
revoke all on function public.avani_create_chat(text,boolean,uuid[]) from public,anon;
revoke all on function public.avani_manage_chat(uuid,text,uuid,text) from public,anon;
grant execute on function public.avani_create_chat(text,boolean,uuid[]) to authenticated;
grant execute on function public.avani_manage_chat(uuid,text,uuid,text) to authenticated;

-- Existing direct INSERT policy allowed any member to invite arbitrary users.
-- Keep community group creation compatible, but only a group creator can invite.
create or replace function public.avani_can_invite_to_chat(p_chat uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.conversations where id=p_chat and is_group and created_by=auth.uid());
$$;
revoke all on function public.avani_can_invite_to_chat(uuid) from public,anon;
grant execute on function public.avani_can_invite_to_chat(uuid) to authenticated;
drop policy if exists "creator adds members" on public.conversation_members;
create policy "creator adds members" on public.conversation_members for insert to authenticated
with check (public.avani_can_invite_to_chat(conversation_id));
