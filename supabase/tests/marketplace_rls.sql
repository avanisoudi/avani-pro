-- Run with SQL Editor privileges; requires two existing profiles. Rolls back all fixtures.
begin;
select set_config('app.market_actor',(select id::text from public.profiles order by id limit 1),true),
       set_config('app.market_other',(select id::text from public.profiles order by id offset 1 limit 1),true);
set local role authenticated;
do $$ declare actor uuid:=current_setting('app.market_actor')::uuid;
  other_user uuid:=current_setting('app.market_other')::uuid;
  item uuid:=gen_random_uuid(); affected integer;
begin
  if actor is null or other_user is null then raise exception 'Two profiles required'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  insert into public.marketplace_listings(id,seller_id,title,price,category,location)
  values(item,actor,'Recette temporaire Marketplace',15,'Autres','Ville de recette');
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  if (select count(*) from public.marketplace_listings where id=item)<>1 then raise exception 'Active listing not readable'; end if;
  update public.marketplace_listings set title='Unauthorized change' where id=item;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Non-owner updated listing'; end if;
  begin
    insert into public.marketplace_listings(seller_id,title,price) values(actor,'Forged seller',1);
    raise exception 'Forged seller accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin
    insert into public.marketplace_listings(seller_id,title,photo_path) values(actor,'Foreign photo',other_user::text||'/foreign/photo.jpg');
    raise exception 'Foreign photo accepted';
  exception when check_violation then null; end;
  update public.marketplace_listings set status='sold' where id=item;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Owner cannot mark sold'; end if;
  if (select count(*) from public.marketplace_listings where id=item)<>1 then raise exception 'Owner lost sold listing'; end if;
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  if (select count(*) from public.marketplace_listings where id=item)<>0 then raise exception 'Other user can read sold listing'; end if;
end $$;
rollback;
