-- 008_post_media.sql — photos et vidéos dans le fil d’actualité
--
-- ⚠️ CE FICHIER N’EST JAMAIS EXÉCUTÉ PAR L’APPLICATION.
-- À copier-coller toi-même dans Supabase → SQL Editor → New query → Run.
-- Il est idempotent : tu peux le rejouer, rien n’est dupliqué ni écrasé.
--
-- Ce que l’application sait déjà faire sans cette migration : publier une photo
-- (elle retombe alors sur la colonne historique media_path, donc un seul média
-- par publication, et l’aperçu reste limité à la première image).

-- 1. Plusiseurs médias par publication : une liste de chemins d’objets Storage,
--    dans l’ordre d’affichage. Les URL ne sont jamais stockées (elles expirent).
alter table public.posts
  add column if not exists media_paths text[] not null default '{}';

-- 2. Le bucket des médias est créé par la migration 002 en privé. On le redéclare
--    ici de façon sûre (aucun effet si la 002 est déjà passée, aucun changement
--    de visibilité si tu l’as réglé toi-même).
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', false)
on conflict (id) do nothing;

-- 3. Lecture des visuels du fil.
--    Sans cette policy, les membres authentifiés ne peuvent pas ouvrir les objets
--    de post-media : les URL signées échouent et les photos n’apparaissent pas.
--    L’envoi, la modification et la suppression du dossier de l’auteur sont déjà
--    couverts par les policies « users upload/update/delete own media » de la 002,
--    parce que chaque objet est rangé sous <id-utilisateur>/posts/.
drop policy if exists "post media readable by members" on storage.objects;
create policy "post media readable by members"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'post-media');

-- 4. Option : rendre les visuels accessibles sans compte (aperçu public du fil,
--    liens partagés). Laisse cette ligne en commentaire si tu préfères rester privé.
-- update storage.buckets set public = true where id = 'post-media';

-- 5. Vérification rapide après exécution :
--    select column_name, data_type from information_schema.columns
--      where table_name = 'posts' and column_name like 'media%';
--    select id, public from storage.buckets where id = 'post-media';
--    select policyname from pg_policies where tablename = 'objects' and policyname like 'post media%';
