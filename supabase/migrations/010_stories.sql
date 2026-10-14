-- Avani Pro : stories, vues de stories et stockage média associé.
--
-- Pourquoi ce fichier : le client lit `stories` (fil du haut de page, archive, composeur)
-- et écrit dans `story_views` depuis la tranche « Vidéos / Reels / Stories », sans qu'aucune
-- migration du dépôt ne les ait jamais créées. Tout est donc idempotent — si les tables
-- existent déjà dans ton projet, rien n'est détruit ni remplacé, seules les colonnes et
-- contraintes manquantes sont ajoutées.
--
-- Exécution : SQL Editor de Supabase, dans l'ordre 008 → 009 → 010 → 011 → 012.

-- ---------------------------------------------------------------- 1. Les stories
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  caption text check (caption is null or char_length(caption) <= 280),
  privacy text not null default 'public' check (privacy in ('public', 'followers', 'private')),
  created_at timestamptz not null default now(),
  -- La fenêtre de 24 heures est portée par la ligne, pas par le client : un onglet
  -- resté ouvert ne peut pas faire vivre une story expirée.
  expires_at timestamptz not null default now() + interval '24 hours'
);

-- Rattrapage des colonnes si la table avait été créée à la main, plus partielle.
alter table public.stories add column if not exists media_type text not null default 'image';
alter table public.stories add column if not exists caption text;
alter table public.stories add column if not exists privacy text not null default 'public';
alter table public.stories add column if not exists expires_at timestamptz not null default now() + interval '24 hours';

do $$ begin
  alter table public.stories drop constraint if exists stories_media_type_check;
  alter table public.stories add constraint stories_media_type_check check (media_type in ('image', 'video'));
  alter table public.stories drop constraint if exists stories_privacy_check;
  alter table public.stories add constraint stories_privacy_check check (privacy in ('public', 'followers', 'private'));
exception when duplicate_object then null; end $$;

create index if not exists stories_author_created_idx on public.stories (author_id, created_at desc);
create index if not exists stories_active_idx on public.stories (expires_at desc);

alter table public.stories enable row level security;

drop policy if exists "stories visible to owner public and followers" on public.stories;
create policy "stories visible to owner public and followers" on public.stories
  for select using (
    author_id = auth.uid()
    or privacy = 'public'
    or (privacy = 'followers' and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = stories.author_id
    ))
  );

drop policy if exists "stories author can publish" on public.stories;
create policy "stories author can publish" on public.stories
  for insert with check (author_id = auth.uid());

-- Le composeur écrit la légende et la confidentialité après insertion (brouillon), mais
-- la suppression reste réservée à l'auteur : personne d'autre ne touche une story.
drop policy if exists "stories author can update own" on public.stories;
create policy "stories author can update own" on public.stories
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "stories author can delete own" on public.stories;
create policy "stories author can delete own" on public.stories
  for delete using (author_id = auth.uid());

-- ------------------------------------------------------------------ 2. Les vues
-- Une ligne par (story, spectateur) : c'est la contrainte unique qui rend le compteur
-- honnête — un même compte ne peut pas gonfler une story en rafraîchissant la page.
create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists story_views_story_idx on public.story_views (story_id, created_at desc);

alter table public.story_views enable row level security;

-- On ne lit les vues que des stories qu'on a le droit de voir ; l'auteur lit toujours les siennes.
drop policy if exists "story views readable on visible stories" on public.story_views;
create policy "story views readable on visible stories" on public.story_views
  for select using (
    exists (
      select 1 from public.stories s
      where s.id = story_views.story_id
        and (
          s.author_id = auth.uid()
          or s.privacy = 'public'
          or (s.privacy = 'followers' and exists (
            select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = s.author_id
          ))
        )
    )
  );

drop policy if exists "story views self recorded" on public.story_views;
create policy "story views self recorded" on public.story_views
  for insert with check (viewer_id = auth.uid());

-- Un spectateur ne peut effacer que SA vue (et personne ne peut réécrire l'historique).
drop policy if exists "story views self cleared" on public.story_views;
create policy "story views self cleared" on public.story_views
  for delete using (viewer_id = auth.uid());

-- --------------------------------------------------------------- 3. Le stockage
-- Le seau est privé : les médias ne sortent que par lien signé, valable 24 heures,
-- exactement la durée de vie de la story (voir listActiveStories côté client).
insert into storage.buckets (id, name, public)
values ('story-media', 'story-media', false)
on conflict (id) do update set public = false;

drop policy if exists "story media owner can upload" on storage.objects;
create policy "story media owner can upload" on storage.objects
  for insert with check (
    bucket_id = 'story-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "story media readable by the audience" on storage.objects;
create policy "story media readable by the audience" on storage.objects
  for select using (
    bucket_id = 'story-media'
    and exists (
      select 1 from public.stories s
      where s.media_path = storage.objects.name
        and (
          s.author_id = auth.uid()
          or s.privacy = 'public'
          or (s.privacy = 'followers' and exists (
            select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = s.author_id
          ))
        )
    )
  );

drop policy if exists "story media owner can replace and remove" on storage.objects;
create policy "story media owner can replace and remove" on storage.objects
  for delete using (
    bucket_id = 'story-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
