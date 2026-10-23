# Migrations SQL d'Avani Pro

Les fichiers de ce dossier ne sont **jamais** exécutés par l'application ni par l'agent :
ils sont à coller dans l'éditeur SQL de Supabase, dans l'ordre.

`001` → `002` → `003` → `004` → `005` → `006` → `007` → `008` → `009` → `010` → `011` → `012` → `013` → `014` → `015` → `016` → `017`

Tous sont idempotents : `create table if not exists`, `add column if not exists`,
`create index if not exists`, `drop policy if exists` puis `create policy`, inserts en
`on conflict do nothing/ update set public = false`. Relancer un fichier déjà appliqué ne
détruit aucune donnée et ne réactive aucun réglage coupé par l'administration.

## Ce que chaque tranche apporte

| Fichier | Apporte | côté client qui en dépend |
| --- | --- | --- |
| `001_avani_core.sql` | `profiles`, `posts`, `comments`, `likes`, `follows`, `saved_posts`, `files`, `notifications`, `reports`, `audit_logs` | `src/lib/api.ts` |
| `002_social_features.sql` | `pages`, `page_members`, `page_followers`, `groups`, `group_members` | `src/lib/socialApi.ts` |
| `003_realtime_notifications.sql` | publication Realtime sur les tables utiles | `src/components/MessagesPanel.tsx` |
| `004_persistent_interactions.sql` | réactions multiples, partages, compteurs publiés | `src/lib/feed.ts` |
| `005_admin_accounts.sql` | `admin_roles`, comptes officiels, badge `verified_type` | `src/components/FeaturePanels.tsx` |
| `006_group_chat.sql` | `conversations`, `conversation_members`, colonne `groups.conversation_id` | `src/lib/api.ts`, `src/lib/messagesModel.ts` |
| `007_message_attachments.sql` | seau `message-attachments` et ses policies | `src/lib/api.ts` |
| `008_post_media.sql` | colonnes `posts.media_path` / `posts.media_paths` | `src/lib/postMedia.ts` |
| `009_messages_live.sql` | `message_reactions`, `messages.message_type`, jointure de conversation, contraintes alignées sur le client | `src/lib/messagesModel.ts`, `MessagesPanel.tsx` |
| `010_stories.sql` | `stories`, `story_views`, seau `story-media` | `src/lib/mediaFeed.ts`, `src/components/MediaPanels.tsx` |
| `011_feature_flags.sql` | `feature_flags` graine de huit clés, lecture publique, écriture admin | `readFeatureFlags` / `setFeatureFlag` dans `src/lib/socialApi.ts` |
| `012_user_settings_et_types.sql` | `user_settings`, six types de page, trois visibilités de groupe, cinq rôles de page, quatre rôles de groupe | panneau Réglages (`appearance`) et `groups`/`pages` |
| `013_conversation_management.sql` | règles de gestion des membres et des conversations | messagerie et groupes persistants |
| `014_private_chat_storage.sql` | bucket privé et policies pour les pièces jointes de conversations | `src/lib/api.ts` |
| `015_community_groups_and_media.sql` | création atomique de groupes, avatar de conversation et lecture des médias de publication | groupes, conversations et fil |
| `016_private_profile_phone.sql` | retire la lecture publique du champ `profiles.phone`; conserve les colonnes publiques et l’accès serveur `service_role` | profils et inscription |\n| `017_message_read_persistence.sql` | garantit `conversation_members.last_read_at` et la policy permettant à chaque membre de mettre à jour son marqueur de lecture | compteur de messages non lus |

`016` ne supprime ni ne modifie les valeurs existantes. Exécutez-le dans l’éditeur SQL Supabase après vérification des rôles et permissions du projet réel. Après son application, testez la lecture des colonnes publiques depuis le client et confirmez qu’un accès `anon`/`authenticated` ne peut pas sélectionner `phone`.

## Tables lues par le client sans migration, avant le lot `010`–`012`

À vérifier si ton projet a été ouvert à la main : ces trois tables étaient interrogées par le
code sans jamais avoir été créées par une migration du dépôt.

| Table | Colonnes attendues par le client |
| --- | --- |
| `stories` | `id`, `author_id`, `media_path`, `media_type`, `caption`, `privacy`, `created_at`, `expires_at` |
| `story_views` | `story_id`, `viewer_id`, `created_at` + clé unique `(story_id, viewer_id)` |
| `user_settings` | `user_id` (clé de conflit de l'upsert), `appearance`, `notification_preferences`, `language`, `updated_at`, et les quatre réglages de confidentialité |
| `feature_flags` | `key`, `enabled`, `description` |

Une table absente n'est **jamais** maquillée en succès : `MessagesPanel`, `StoriesPanel` et
le panneau Réglages nomment le fichier à exécuter (via `describeAccessError` dans
`src/lib/postgres.ts`) et proposent Réessayer.

## Ce que ces fichiers ne font pas

- Aucune table `videos` ni `reels` : ces deux surfaces lisent les publications vidéo déjà
  présentes dans `posts` (`post_type = 'video'` ou média d'extension vidéo). Créer une table
  parallèle aurait dupliqué la source de vérité.
- Aucune table `listings` (Marketplace) ni `lives` : faute de service de diffusion branché,
  l'écran reste un état honnête piloté par `feature_flags`.
- Aucun `drop table`, aucun `truncate`, aucune politique qui élargirait la lecture au-delà
  du propriétaire ou de l'audience déclarée.
