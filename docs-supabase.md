# Backend Supabase et API Avani Pro

## Variables Render

Le frontend utilise uniquement la clé publique :

```text
VITE_SUPABASE_URL=https://hpsftpganwkcftnbgnwq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Ne jamais utiliser `SUPABASE_SECRET_KEY` ou une clé `service_role` dans React, GitHub ou une variable `VITE_*`. La clé secrète reste réservée aux Edge Functions et aux opérations serveur. `SUPABASE_JWKS_URL` est également une variable backend pour vérifier les JWT.

## Initialiser la base

Dans Supabase Dashboard → SQL Editor, exécuter `supabase/migrations/001_avani_core.sql`. Cette migration crée les profils, follows, posts, conversations, membres, messages, notifications et rôles admin; elle ajoute aussi les politiques RLS et les tables Realtime.

Puis exécuter `supabase/migrations/002_social_features.sql` pour les pages, groupes, commentaires, likes, fichiers, signalements, audit logs et buckets Storage. Le trigger `auth.users` crée automatiquement un profil et une notification de bienvenue. L’email admin ne doit pas être stocké en clair dans le client : attribuer un rôle dans `admin_roles` via une migration privée ou une Edge Function protégée.

Puis exécuter `supabase/migrations/003_realtime_notifications.sql`. Cette migration ajoute les triggers qui créent une notification pour un nouveau message, un nouvel abonné, un commentaire et un j’aime. Le hook `src/lib/useNotifications.ts` charge les 25 dernières notifications et écoute les INSERT Supabase Realtime filtrés par `user_id`.

La fonction `supabase/functions/admin-bootstrap/index.ts` protège l’attribution de rôles avec `ADMIN_EMAILS`, une liste d’emails séparés par des virgules configurée uniquement dans les secrets Edge Functions. Le JWT de l’utilisateur est vérifié avant l’upsert dans `admin_roles`; le client React ne reçoit jamais la clé service.

Le smoke test public se lance avec `npm run test:smoke` ou `SMOKE_URL=https://... npm run test:smoke`. Il vérifie le HTML, le manifeste des routes, le logo, la carte de partage et l’asset cloche.

La migration `004_persistent_interactions.sql` ajoute `saved_posts` et `post_shares`. Le feed est maintenant hydraté depuis `posts`, `profiles`, `likes`, `comments`, `post_shares` et `saved_posts` à chaque connexion. La migration `005_admin_accounts.sql` attribue automatiquement le rôle `super_admin` et le badge `admin` aux cinq emails officiels fournis par le propriétaire du projet, y compris pour les comptes déjà créés.

La migration `006_group_chat.sql` ajoute `groups.conversation_id` et les policies de membres. La création d’un groupe crée aussi une ligne `conversations` avec `is_group=true` et ajoute le propriétaire à `conversation_members`. Le groupe est ensuite visible dans `MessagesPanel`, avec historique Postgres, envoi durable, abonnement Realtime et invitation de profils dans le groupe et son chat. Cette migration est une **étape d’activation de déploiement**, pas une faille : tant qu’elle n’est pas exécutée dans le SQL Editor, le code déployé ne peut pas créer les relations groupe/chat attendues.

La migration `009_messages_live.sql` met la messagerie et les groupes publics à l’état réel attendu par le client. Elle ajoute les colonnes lues par l’écran (`messages.message_type`, `reply_to_id` + sa clé étrangère nommée `messages_reply_to_id_fkey`, `attachment_name`, `attachment_mime_type`, `attachment_size_bytes`, `updated_at`, `deleted_at`), élargit `messages_body_check` à `0..10000` pour permettre les pièces jointes sans légende et la suppression logique, crée la table `message_reactions` avec ses policies, puis ouvre les droits qui manquaient : `UPDATE` de `conversation_members` (marquer lu), `UPDATE`/`DELETE` de ses propres messages, `INSERT` dans `conversation_members` pour rejoindre soi-même le chat d’un groupe public, `SELECT` du roster d’un groupe public (comptage de membres juste), un trigger qui fait avancer `conversations.updated_at` à chaque message (ordre de la liste) et l’ajout gardé des tables `messages`, `message_reactions`, `conversation_members` et `conversations` à la publication `supabase_realtime`. Le script est idempotent : relançable sans effet de bord.

Tant que cette migration n’est pas exécutée, l’application reste utilisable mais partielle, et elle le dit : les colonnes absentes sont abandonnées une à une (`retryWithoutMissing` dans `src/lib/api.ts`), les réactions sont masquées avec une note, une jointure de groupe qui réussit à moitié affiche explicitement ce qui manque, et toute erreur refusée par RLS est traduite en français avec le nom du fichier à exécuter (`describeAccessError` dans `src/lib/postgres.ts`). Aucun écran n’invente de données : il n’y a plus de conversation, de membre ou de comptage simulé côté client.

La migration `007_message_attachments.sql` crée le bucket privé `message-attachments`. Les objets utilisent le chemin `<conversation_id>/<uploader_id>/<uuid>-<nom>`. Les membres de la conversation peuvent créer une URL signée de lecture; seul l’auteur de l’upload peut modifier ou supprimer son objet. Le frontend limite les pièces jointes à 25 Mo et accepte les images, vidéos, PDF et fichiers texte. Il faut exécuter cette migration une fois dans Supabase avant d’utiliser le bouton `＋` dans le composeur de messages.

Le parcours d’inscription est en deux étapes dans `AuthModal.tsx`, avec Google OAuth Supabase. Les toasts d’interface restent visibles 8 secondes puis disparaissent automatiquement. La persistance de session est activée par `persistSession`, `autoRefreshToken` et `detectSessionInUrl` dans `src/lib/supabase.ts`.

## Colonnes attendues par le fil

Le fil lit trois colonnes qui ne sont pas toutes déclarées dans les migrations du dépôt. Le code tolère
leur absence (la requête est rejouée sans la colonne) mais les fonctionnalités restent réduites tant que la
base ne les porte pas :

| Table | Colonne | Usagé par | Sans la colonne |
|---|---|---|---|
| `likes` | `reaction_type` | réactions J’aime / J’adore / Haha / Wouah / Triste / Grrr | toutes les lignes comptées comme « J’aime » |
| `comments` | `parent_id` | réponses imbriquées sous un commentaire | réponses enregistrées comme commentaires au premier niveau |
| `posts` | `media_path` | première photo ou vidéo d'une publication | publications texte uniquement |
| `posts` | `media_paths` (`text[]`) | publications à plusieurs médias (grille type Facebook) | une seule image par publication |

Pour aligner la base sur le code, exécuter dans Supabase → SQL Editor (à valider par le propriétaire du projet) :

```sql
alter table public.likes    add column if not exists reaction_type text not null default 'like'
  check (reaction_type in ('like','love','haha','wow','sad','angry'));
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists comments_post_parent_idx on public.comments(post_id, parent_id, created_at);
alter table public.posts add column if not exists media_paths text[] not null default '{}';
```

## Médias des publications (photos et vidéos)

`supabase/migrations/008_post_media.sql` prépare le bucket et les règles d'accès. Le fichier est fourni,
idempotent, **jamais exécuté par l'application** : à coller dans Supabase → SQL Editor.

| Besoin | Ce que fait l'application | Sans la migration |
|---|---|---|
| Dépôt du fichier | `POST /storage/v1/object/post-media/<userId>/posts/<uuid>-<nom>` | message d'erreur explicite citant le fichier 008, aucun objet orphelin |
| Lecture des visuels | `POST /storage/v1/object/sign/post-media` (une requête pour tout le fil), repli URL publique | les visuels du bucket privé restent inaccessibles |
| Ordre et nombre | `posts.media_paths` (`text[]`) | repli sur `posts.media_path` : première image uniquement |

Les politiques `users upload/update/delete own media` de la migration 002 couvrent déjà l'écriture,
puisque chaque objet est rangé sous le dossier de l'auteur. Il manque seulement la **lecture** pour un
bucket privé, ajoutée par la 008. Pour des visuels accessibles sans compte, décommenter la ligne
`update storage.buckets set public = true ...` du fichier : l'application signe alors aussi les URL, aucun
changement de code n'est nécessaire. La variable `VITE_POST_MEDIA_BUCKET` permet de pointer un autre bucket.

Aucune de ces instructions n’est lancée par l’application : elles sont documentées ici pour le déploiement.

## Routes client / API

Avec Supabase, le frontend appelle la Data API via `supabase-js` :

| Fonction | Appel | Permission |
|---|---|---|
| Inscription | `supabase.auth.signUp` | Public, confirmation email recommandée |
| Connexion | `supabase.auth.signInWithPassword` | Public |
| Profil | `GET /rest/v1/profiles?id=eq.<userId>` | Lecture publique, écriture propriétaire |
| Conversations | `GET /rest/v1/conversation_members?user_id=eq.<userId>` | Membre connecté |
| Conversations (liste en direct) | canal Realtime `inbox:<user_id>` sur `conversation_members` (filtré) + `messages` | RLS de `messages` filtre les événements |
| Messages | `GET /rest/v1/messages?conversation_id=eq.<id>` | Membre de la conversation |
| Envoyer message | `POST /rest/v1/messages` | `sender_id = auth.uid()` + membre |
| Notifications | `GET /rest/v1/notifications?user_id=eq.<userId>` | Propriétaire |
| Pages | `GET/POST /rest/v1/pages` | Lecture publique, création propriétaire |
| Groupes | `GET/POST /rest/v1/groups` | Public ou membre |
| Commentaires | `GET/POST /rest/v1/comments` | Lecture publique, écriture authentifiée |
| Fichiers | `POST /storage/v1/object/files/<userId>/<name>` | Propriétaire via Storage RLS |
| Photo/vidéo de publication | `POST /storage/v1/object/post-media/<userId>/posts/…` puis `POST /storage/v1/object/sign/post-media` | Dépôt par le propriétaire, lecture par les membres authentifiés |
| Signalements | `POST /rest/v1/reports` | Utilisateur connecté |

Les helpers sont dans `src/lib/api.ts`. Les accès directs sont protégés par RLS : masquer un bouton ne remplace jamais une policy SQL.

## Temps réel

`MessagesPanel` charge l’historique puis ouvre un canal :

```ts
supabase.channel(`conversation:${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, handler)
  .subscribe()
```

Pour une production à grande échelle, ajouter présence (`presence`) pour le statut en ligne et broadcast pour l’indicateur de saisie; conserver Postgres Changes pour l’historique durable. Toujours retirer le channel au démontage React.

## Présence en ligne

La liste des conversations est tenue en direct par le canal `inbox:<user_id>` de `MessagesPanel` : un `INSERT` sur `conversation_members` filtré `user_id=eq.<user_id>` (invitation, jointure de groupe) et un `INSERT` sur `messages` non filtré déclenchent une relecture debouncée de 900 ms. Les événements `messages` ne sont reçus que pour les conversations où RLS autorise la lecture, ce qui remplace une liste de filtres impossibles à énumérer ; le composant ne duplique jamais une ligne déjà présente (déduplication sur l’`id` serveur) et nomme l’expéditeur via `listProfilesByIds` parce que la charge utile Realtime ne contient pas l’embed profil.

`GroupsPanel` écoute de la même façon `groups` (INSERT/UPDATE) et `group_members` (INSERT filtré sur son propre `user_id`) pour rafraîchir mes groupes et les groupes publics, sans polling.

Le hook `src/lib/usePresence.ts` ouvre le canal partagé `avani:presence` avec une clé utilisateur stable, publie `{ user_id, online_at }` avec `track()` et recalcule le nombre de clés présentes sur les événements `sync`, `join` et `leave`. Le channel est retiré et l’état est dépublié au démontage ou à la déconnexion. La présence ne nécessite pas de table SQL : elle est gérée par Supabase Realtime.

Pour vérifier les données persistées, utiliser la Data API avec une clé publishable active. Un retour `401 Unregistered API key` signifie que la clé n’est pas enregistrée pour ce projet; ce n’est pas un problème RLS et aucune ligne ne peut être confirmée tant que la clé n’est pas remplacée depuis Supabase Settings → API.

## Edge Functions

`supabase/functions/messages/index.ts` est le point de départ pour une API serveur optionnelle. Les routes recommandées sont `POST /messages` (validation et insertion), `POST /conversations` (création atomique), `POST /attachments/sign` (URL Storage courte) et `POST /moderation/report`. Elles doivent valider le JWT via `Authorization: Bearer`, utiliser la clé serveur uniquement côté Edge Function et déléguer les droits métier à RLS.

## Render

Après ajout des variables Render, déclencher un nouveau deploy. Supabase Auth → URL Configuration doit autoriser `https://avani-pro.onrender.com` et l’URL de redirection `https://avani-pro.onrender.com/reset-password`.
