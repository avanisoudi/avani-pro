-- Explicit role checks; no reliance on client-supplied author/admin flags.
create or replace function public.avani_can_moderate() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from public.admin_roles where user_id=auth.uid() and role::text in ('admin','super_admin')); $$;
revoke all on function public.avani_can_moderate() from public,anon;
grant execute on function public.avani_can_moderate() to authenticated;
create or replace function public.avani_delete_post(p_post uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid;
begin
if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
select author_id into owner_id from public.posts where id=p_post for update;
if not found then raise exception 'Publication introuvable' using errcode='P0002'; end if;
if owner_id<>auth.uid() and not public.avani_can_moderate() then raise exception 'Suppression non autorisée' using errcode='42501'; end if;
insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'post.delete','post',p_post,jsonb_build_object('author_id',owner_id,'moderation',owner_id<>auth.uid()));
delete from public.posts where id=p_post;
end $$;
revoke all on function public.avani_delete_post(uuid) from public,anon;
grant execute on function public.avani_delete_post(uuid) to authenticated;
create or replace function public.avani_admin_overview() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
if not public.avani_can_moderate() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
return jsonb_build_object(
'users',(select count(*) from public.profiles),'pages',(select count(*) from public.pages),'posts',(select count(*) from public.posts),
'reports',(select count(*) from public.reports where status in ('open','reviewing')),
'publications',coalesce((select jsonb_agg(x) from (select p.id,p.body,p.created_at,pr.full_name as author from public.posts p left join public.profiles pr on pr.id=p.author_id order by p.created_at desc limit 50) x),'[]'::jsonb),
'signals',coalesce((select jsonb_agg(x) from (select id,reason,status,post_id,created_at from public.reports where status in ('open','reviewing') order by created_at desc limit 20) x),'[]'::jsonb),
'logs',coalesce((select jsonb_agg(x) from (select id,action,entity_type,created_at from public.audit_logs order by created_at desc limit 20) x),'[]'::jsonb));
end $$;
revoke all on function public.avani_admin_overview() from public,anon;
grant execute on function public.avani_admin_overview() to authenticated;
create or replace function public.avani_resolve_report(p_report uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
if not public.avani_can_moderate() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
update public.reports set status='resolved' where id=p_report and status in ('open','reviewing');
if not found then raise exception 'Signalement absent ou déjà traité'; end if;
insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'report.resolve','report',p_report);
end $$;
revoke all on function public.avani_resolve_report(uuid) from public,anon;
grant execute on function public.avani_resolve_report(uuid) to authenticated;
