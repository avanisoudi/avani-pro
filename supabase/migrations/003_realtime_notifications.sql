-- Avani Pro: notifications métier pour messages et interactions
create or replace function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, payload)
  select cm.user_id, new.sender_id, 'new_message', jsonb_build_object('message', 'Nouveau message reçu', 'conversation_id', new.conversation_id, 'message_id', new.id)
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id;
  return new;
end;
$$;
drop trigger if exists messages_create_notification on public.messages;
create trigger messages_create_notification after insert on public.messages for each row execute function public.notify_new_message();

create or replace function public.notify_new_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, payload)
  values (new.following_id, new.follower_id, 'new_follower', jsonb_build_object('message', 'Vous avez un nouvel abonné'));
  return new;
end;
$$;
drop trigger if exists follows_create_notification on public.follows;
create trigger follows_create_notification after insert on public.follows for each row execute function public.notify_new_follow();

create or replace function public.notify_new_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_user uuid;
begin
  select author_id into target_user from public.posts where id = new.post_id;
  if target_user is not null and target_user <> new.author_id then
    insert into public.notifications (user_id, actor_id, type, payload) values (target_user, new.author_id, 'new_comment', jsonb_build_object('message', 'Votre publication a reçu un commentaire', 'post_id', new.post_id, 'comment_id', new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists comments_create_notification on public.comments;
create trigger comments_create_notification after insert on public.comments for each row execute function public.notify_new_comment();

create or replace function public.notify_new_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_user uuid;
begin
  select author_id into target_user from public.posts where id = new.post_id;
  if target_user is not null and target_user <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, payload) values (target_user, new.user_id, 'new_like', jsonb_build_object('message', 'Votre publication a reçu un j’aime', 'post_id', new.post_id));
  end if;
  return new;
end;
$$;
drop trigger if exists likes_create_notification on public.likes;
create trigger likes_create_notification after insert on public.likes for each row execute function public.notify_new_like();
