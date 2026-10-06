-- Avani Pro: comptes officiels et badge verified automatique
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_official_admin boolean := lower(coalesce(new.email, '')) = any(array[
    'avanisoudi@gmail.com',
    'avanisoudi1@gmail.com',
    'avanisoudibenhadad@gmail.com',
    'avanisoudibenhadad1@gmail.com',
    'hackerbenz404@gmail.com'
  ]);
begin
  insert into public.profiles (id, username, full_name, phone, verified_type)
  values (new.id, coalesce(nullif(lower(new.raw_user_meta_data->>'username'), ''), 'user_' || substr(replace(new.id::text, '-', ''), 1, 12)), coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, 'Nouveau membre'), '@', 1)), new.raw_user_meta_data->>'phone', case when is_official_admin then 'admin'::public.verified_type else null end);
  insert into public.notifications (user_id, type, payload) values (new.id, 'account_created', jsonb_build_object('message', '🎉 Bienvenue sur Avani Pro ! Votre compte a été créé avec succès.'));
  if is_official_admin then
    insert into public.admin_roles (user_id, role) values (new.id, 'super_admin') on conflict (user_id) do update set role = 'super_admin';
  end if;
  return new;
exception when unique_violation then
  raise exception 'USERNAME_ALREADY_EXISTS';
end;
$$;

-- Rattrapage des comptes déjà créés avant cette migration.
insert into public.profiles (id, username, full_name, verified_type)
select u.id, 'user_' || substr(replace(u.id::text, '-', ''), 1, 12), split_part(coalesce(u.email, 'Nouveau membre'), '@', 1), 'admin'::public.verified_type
from auth.users u
where lower(u.email) = any(array['avanisoudi@gmail.com','avanisoudi1@gmail.com','avanisoudibenhadad@gmail.com','avanisoudibenhadad1@gmail.com','hackerbenz404@gmail.com'])
  and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do update set verified_type = 'admin'::public.verified_type;

update public.profiles p set verified_type = 'admin'::public.verified_type
from auth.users u
where p.id = u.id and lower(u.email) = any(array['avanisoudi@gmail.com','avanisoudi1@gmail.com','avanisoudibenhadad@gmail.com','avanisoudibenhadad1@gmail.com','hackerbenz404@gmail.com']);

insert into public.admin_roles (user_id, role)
select u.id, 'super_admin'::public.admin_role from auth.users u
where lower(u.email) = any(array['avanisoudi@gmail.com','avanisoudi1@gmail.com','avanisoudibenhadad@gmail.com','avanisoudibenhadad1@gmail.com','hackerbenz404@gmail.com'])
on conflict (user_id) do update set role = 'super_admin';
