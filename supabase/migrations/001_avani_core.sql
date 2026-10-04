-- Avani Pro: schema initial sécurisé pour Supabase
create extension if not exists pgcrypto;

create type public.verified_type as enum ('admin', 'official', 'creator', 'business');
create type public.admin_role as enum ('super_admin', 'admin', 'moderator', 'support');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text,
  avatar_url text,
  cover_url text,
  bio text check (char_length(coalesce(bio, '')) <= 500),
  verified_type public.verified_type,
  followers_count integer not null default 0 check (followers_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  post_type text not null default 'text' check (post_type in ('text', 'image', 'video', 'document', 'link')),
  media_path text,
  link_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  attachment_path text,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.admin_role not null,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, phone)
  values (new.id, coalesce(nullif(lower(new.raw_user_meta_data->>'username'), ''), 'user_' || substr(replace(new.id::text, '-', ''), 1, 12)), coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'Nouveau membre'), new.raw_user_meta_data->>'phone');
  insert into public.notifications (user_id, type, payload) values (new.id, 'account_created', jsonb_build_object('message', '🎉 Bienvenue sur Avani Pro ! Votre compte a été créé avec succès.'));
  return new;
exception when unique_violation then
  raise exception 'USERNAME_ALREADY_EXISTS';
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_conversation_member(target_conversation uuid, target_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.conversation_members where conversation_id = target_conversation and user_id = target_user); $$;
create or replace function public.is_admin(target_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.admin_roles where user_id = target_user); $$;

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_roles enable row level security;

create policy "profiles are publicly readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "users manage own follows" on public.follows for all using (follower_id = auth.uid()) with check (follower_id = auth.uid());
create policy "posts are publicly readable" on public.posts for select using (true);
create policy "users create own posts" on public.posts for insert with check (author_id = auth.uid());
create policy "users update own posts" on public.posts for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "members read conversations" on public.conversations for select using (public.is_conversation_member(id));
create policy "authenticated create conversations" on public.conversations for insert with check (created_by = auth.uid());
create policy "members read membership" on public.conversation_members for select using (user_id = auth.uid() or public.is_conversation_member(conversation_id));
create policy "creator adds members" on public.conversation_members for insert with check (public.is_conversation_member(conversation_id) or exists (select 1 from public.conversations where id = conversation_id and created_by = auth.uid()));
create policy "members read messages" on public.messages for select using (public.is_conversation_member(conversation_id));
create policy "members send messages" on public.messages for insert with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));
create policy "users read own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "users update own notifications" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins read roles" on public.admin_roles for select using (user_id = auth.uid() or public.is_admin());

create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
