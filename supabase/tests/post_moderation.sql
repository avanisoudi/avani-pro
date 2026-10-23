-- Run as project database administrator. All fixtures/role changes roll back.
begin;
do $$
declare a uuid; b uuid; p uuid; q uuid; r uuid;
begin
  select id into a from public.profiles order by id limit 1;
  select id into b from public.profiles where id<>a order by id limit 1;
  if b is null then raise exception 'Deux profils requis'; end if;
  delete from public.admin_roles where user_id in(a,b);
  insert into public.posts(author_id,body,post_type) values(a,'Recette auteur annulee','text') returning id into p;
  insert into public.posts(author_id,body,post_type) values(a,'Recette moderation annulee','text') returning id into q;
  perform set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  begin perform public.avani_delete_post(p); raise exception 'Tiers autorise'; exception when insufficient_privilege then null; end;
  begin perform public.avani_admin_overview(); raise exception 'Console exposee'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.avani_delete_post(p);
  execute 'reset role';
  if exists(select 1 from public.posts where id=p) then raise exception 'Suppression auteur non effective'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=p and action='post.delete') then raise exception 'Audit absent'; end if;
  insert into public.admin_roles(user_id,role) values(b,'admin');
  insert into public.reports(reporter_id,post_id,reason,status) values(a,q,'Recette annulee','open') returning id into r;
  perform set_config('request.jwt.claim.sub',b::text,true);
  execute 'set local role authenticated';
  perform public.avani_admin_overview();
  perform public.avani_resolve_report(r);
  perform public.avani_delete_post(q);
  execute 'reset role';
  if exists(select 1 from public.posts where id=q) then raise exception 'Suppression admin non effective'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=q and action='post.delete' and metadata->>'moderation'='true') then raise exception 'Audit moderation absent'; end if;
  if has_function_privilege('anon','public.avani_delete_post(uuid)','execute') then raise exception 'Acces anonyme'; end if;
end $$;
rollback;
