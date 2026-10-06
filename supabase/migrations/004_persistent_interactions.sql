-- Avani Pro: persistance des interactions utilisateur
create table if not exists public.saved_posts (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.saved_posts enable row level security;
alter table public.post_shares enable row level security;
create policy "users manage own saved posts" on public.saved_posts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "shares are publicly countable" on public.post_shares for select using (true);
create policy "users create shares" on public.post_shares for insert with check (user_id = auth.uid());

create index if not exists saved_posts_user_created_idx on public.saved_posts(user_id, created_at desc);
create index if not exists post_shares_post_created_idx on public.post_shares(post_id, created_at desc);
alter publication supabase_realtime add table public.saved_posts;
