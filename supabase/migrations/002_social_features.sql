-- Avani Pro: fonctionnalités sociales étendues
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  category text not null check (category in ('company', 'creator', 'community', 'brand')),
  description text,
  logo_path text,
  banner_path text,
  verified boolean not null default false,
  followers_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.page_members (
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'editor', 'analyst')),
  created_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

create table if not exists public.page_followers (
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  visibility text not null default 'private' check (visibility in ('private', 'followers', 'public')),
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pages enable row level security;
alter table public.page_members enable row level security;
alter table public.page_followers enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.files enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;

create policy "pages are publicly readable" on public.pages for select using (true);
create policy "users create own pages" on public.pages for insert with check (owner_id = auth.uid());
create policy "page admins manage pages" on public.pages for update using (owner_id = auth.uid() or exists (select 1 from public.page_members where page_id = id and user_id = auth.uid() and role in ('admin', 'editor')));
create policy "page members are readable" on public.page_members for select using (user_id = auth.uid() or exists (select 1 from public.page_members pm where pm.page_id = page_id and pm.user_id = auth.uid()));
create policy "page owners add members" on public.page_members for insert with check (exists (select 1 from public.pages where id = page_id and owner_id = auth.uid()) or exists (select 1 from public.page_members pm where pm.page_id = page_id and pm.user_id = auth.uid() and pm.role = 'admin'));
create policy "public groups readable" on public.groups for select using (visibility = 'public' or owner_id = auth.uid() or exists (select 1 from public.group_members where group_id = id and user_id = auth.uid()));
create policy "users create groups" on public.groups for insert with check (owner_id = auth.uid());
create policy "group members readable" on public.group_members for select using (user_id = auth.uid() or exists (select 1 from public.group_members gm where gm.group_id = group_id and gm.user_id = auth.uid()));
create policy "members read comments" on public.comments for select using (true);
create policy "users create comments" on public.comments for insert with check (author_id = auth.uid());
create policy "users manage own comments" on public.comments for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "likes are readable" on public.likes for select using (true);
create policy "users manage own likes" on public.likes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own files" on public.files for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "users create reports" on public.reports for insert with check (reporter_id = auth.uid());
create policy "admins manage reports" on public.reports for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read audit logs" on public.audit_logs for select using (public.is_admin());
create policy "admins create audit logs" on public.audit_logs for insert with check (public.is_admin());

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true), ('covers', 'covers', true), ('post-media', 'post-media', false), ('files', 'files', false) on conflict (id) do nothing;
create policy "public avatar reads" on storage.objects for select using (bucket_id in ('avatars', 'covers'));
create policy "users upload own media" on storage.objects for insert with check (auth.uid()::text = (storage.foldername(name))[1]);
create policy "users update own media" on storage.objects for update using (auth.uid()::text = (storage.foldername(name))[1]);
create policy "users delete own media" on storage.objects for delete using (auth.uid()::text = (storage.foldername(name))[1]);

create index if not exists comments_post_created_idx on public.comments(post_id, created_at);
create index if not exists files_owner_created_idx on public.files(owner_id, created_at desc);
create index if not exists reports_status_created_idx on public.reports(status, created_at desc);
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.likes;
