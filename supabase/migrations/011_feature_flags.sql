-- Avani Pro : drapeaux de fonctionnalité (`feature_flags`).
--
-- Pourquoi ce fichier : le client lisait déjà cette table (getFeatureFlags) pour décider
-- d'afficher ou non Stories, Reels, Vidéos, Marketplace, Live, Messages, Groupes et Pages,
-- sans qu'aucune migration du dépôt ne l'ait jamais créée. Elle est donc créée ici, avec
-- la graine des huit clés connues de l'interface.
--
-- Lecture publique, écriture réservée à l'administration : une page d'accueil doit pouvoir
-- dire « cette fonction est coupée » sans session, mais personne ne doit pouvoir la rouvrir
-- depuis un compte membre.

create table if not exists public.feature_flags (
  key text primary key check (char_length(key) between 2 and 40 and key ~ '^[a-z][a-z0-9_]*$'),
  enabled boolean not null default true,
  description text,
  updated_at timestamptz not null default now()
);

-- Rattrapage si la table avait été créée à la main avec une forme plus pauvre.
alter table public.feature_flags add column if not exists description text;
alter table public.feature_flags add column if not exists updated_at timestamptz not null default now();

-- Les huit interrupteurs que l'interface sait afficher. `do nothing`, jamais `do update` :
-- relancer la migration ne doit jamais réactiver ce que l'administration a coupé.
insert into public.feature_flags (key, description) values
  ('stories', 'Fil du haut de page, publication 24 h et archive personnelle.'),
  ('videos', 'Page /videos, alimentée par les publications vidéo du réseau.'),
  ('reels', 'Flux vertical /reels, lecture automatique de la vidéo visible.'),
  ('marketplace', 'Aucune table de petites annonces en base : écran d état seulement.'),
  ('live', 'Aucune diffusion temps réel branchée : écran d état seulement.'),
  ('messages', 'Fils privés et de groupe, Realtime, pièces jointes.'),
  ('groups', 'Groupes publics et privés, chat de groupe, rôles de membre.'),
  ('pages', 'Pages, abonnés, rôles de page.')
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;

drop policy if exists "feature flags readable by anyone" on public.feature_flags;
create policy "feature flags readable by anyone" on public.feature_flags
  for select to anon, authenticated using (true);

-- Seul un rôle d'administration peut écrire. Le rôle est un enum public.admin_role : on le
-- compare en texte pour ne pas dépendre de l'ordre des valeurs de l'enum.
drop policy if exists "feature flags writable by admin only" on public.feature_flags;
create policy "feature flags writable by admin only" on public.feature_flags
  for all to authenticated
  using (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid() and ar.role::text = any (array['super_admin', 'admin'])
    )
  )
  with check (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid() and ar.role::text = any (array['super_admin', 'admin'])
    )
  );

grant select on public.feature_flags to anon, authenticated;
grant insert, update, delete on public.feature_flags to authenticated;
