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

## Routes client / API

Avec Supabase, le frontend appelle la Data API via `supabase-js` :

| Fonction | Appel | Permission |
|---|---|---|
| Inscription | `supabase.auth.signUp` | Public, confirmation email recommandée |
| Connexion | `supabase.auth.signInWithPassword` | Public |
| Profil | `GET /rest/v1/profiles?id=eq.<userId>` | Lecture publique, écriture propriétaire |
| Conversations | `GET /rest/v1/conversation_members?user_id=eq.<userId>` | Membre connecté |
| Messages | `GET /rest/v1/messages?conversation_id=eq.<id>` | Membre de la conversation |
| Envoyer message | `POST /rest/v1/messages` | `sender_id = auth.uid()` + membre |
| Notifications | `GET /rest/v1/notifications?user_id=eq.<userId>` | Propriétaire |
| Pages | `GET/POST /rest/v1/pages` | Lecture publique, création propriétaire |
| Groupes | `GET/POST /rest/v1/groups` | Public ou membre |
| Commentaires | `GET/POST /rest/v1/comments` | Lecture publique, écriture authentifiée |
| Fichiers | `POST /storage/v1/object/files/<userId>/<name>` | Propriétaire via Storage RLS |
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

## Edge Functions

`supabase/functions/messages/index.ts` est le point de départ pour une API serveur optionnelle. Les routes recommandées sont `POST /messages` (validation et insertion), `POST /conversations` (création atomique), `POST /attachments/sign` (URL Storage courte) et `POST /moderation/report`. Elles doivent valider le JWT via `Authorization: Bearer`, utiliser la clé serveur uniquement côté Edge Function et déléguer les droits métier à RLS.

## Render

Après ajout des variables Render, déclencher un nouveau deploy. Supabase Auth → URL Configuration doit autoriser `https://avani-pro.onrender.com` et l’URL de redirection `https://avani-pro.onrender.com/reset-password`.
