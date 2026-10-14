-- Avani Pro : préférences de compte (`user_settings`) et alignement des types de page
-- et de confidentialité de groupe sur le cahier des charges.
--
-- Pourquoi ce fichier :
--   1. `user_settings` est lue et écrite par le client (getMySettings / saveMySettings :
--      thème, préférences de notifications, mode compact) sans qu'aucune migration du
--      dépôt ne l'ait créée. Le panneau Réglages dépend de sa clé de conflit `user_id`.
--   2. Le cahier des charges demande six types de page (entreprise, marque, créateur,
--      communauté, média, produit) et trois visibilités de groupe (public, privé, caché).
--      Les contraintes de 002 étaient plus étroites ; elles sont élargies ici, jamais
--      restreintes — aucune ligne existante ne peut devenir invalide.

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  profile_visibility text not null default 'public' check (profile_visibility in ('public', 'friends', 'private')),
  message_permission text not null default 'everyone' check (message_permission in ('everyone', 'friends', 'nobody')),
  mention_permission text not null default 'everyone' check (mention_permission in ('everyone', 'friends', 'nobody')),
  story_visibility text not null default 'public' check (story_visibility in ('public', 'friends', 'private')),
  -- Thème : le choix explicite de l'utilisateur. Un appareil sans choix garde la valeur ici,
  -- un appareil avec un choix local ignore cette colonne (src/lib/theme.ts, adoptCloudTheme).
  appearance text check (appearance is null or appearance in ('light', 'dark')),
  language text not null default 'fr',
  notification_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings add column if not exists appearance text;
alter table public.user_settings add column if not exists language text not null default 'fr';
alter table public.user_settings add column if not exists notification_preferences jsonb not null default '{}'::jsonb;
alter table public.user_settings add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.user_settings drop constraint if exists user_settings_appearance_check;
  alter table public.user_settings add constraint user_settings_appearance_check check (appearance is null or appearance in ('light', 'dark'));
exception when duplicate_object then null; end $$;

alter table public.user_settings enable row level security;

drop policy if exists "user settings readable by owner" on public.user_settings;
create policy "user settings readable by owner" on public.user_settings
  for select using (user_id = auth.uid());

drop policy if exists "user settings writable by owner" on public.user_settings;
create policy "user settings writable by owner" on public.user_settings
  for insert with check (user_id = auth.uid());

drop policy if exists "user settings updatable by owner" on public.user_settings;
create policy "user settings updatable by owner" on public.user_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user settings deletable by owner" on public.user_settings;
create policy "user settings deletable by owner" on public.user_settings
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------- Types de page du cahier des charges
do $$ begin
  alter table public.pages drop constraint if exists pages_category_check;
  alter table public.pages add constraint pages_category_check
    check (category in ('company', 'brand', 'creator', 'community', 'media', 'product'));
exception when duplicate_object then null; end $$;

-- Un créateur qui avait choisi 'creator' garde sa valeur ; 'company' reste le nom de la
-- page d'entreprise, 'brand' celui de la marque — le client présente les libellés français.

-- --------------------------------------------------------- Visibilités de groupe demandées
do $$ begin
  alter table public.groups drop constraint if exists groups_visibility_check;
  alter table public.groups add constraint groups_visibility_check
    check (visibility in ('public', 'private', 'hidden'));
exception when duplicate_object then null; end $$;

-- Le type « caché » n'est pas encore proposé par le formulaire de création : la base
-- l'accepte pour qu'une administration puisse le poser sans migration supplémentaire.

-- ------------------------------------------------------------- Rôles de page plus riches
-- 002 autorisait admin / editor / analyste. Le cahier des charges ajoute propriétaire et
-- modérateur ; le propriétaire reste l'auteur de la page (colonne owner_id de 002).
do $$ begin
  alter table public.page_members drop constraint if exists page_members_role_check;
  alter table public.page_members add constraint page_members_role_check
    check (role in ('owner', 'admin', 'editor', 'moderator', 'analyst'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- Rôles de groupe demandés
do $$ begin
  alter table public.group_members drop constraint if exists group_members_role_check;
  alter table public.group_members add constraint group_members_role_check
    check (role in ('creator', 'admin', 'moderator', 'member'));
exception when duplicate_object then null; end $$;
