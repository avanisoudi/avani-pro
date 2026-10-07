# AVANI PRO — v1.2.0

Réseau social professionnel nouvelle génération — interface React + TypeScript + Vite, prête pour une connexion Supabase.

La version 1.2.0 introduit un système d’assets sociaux originaux (`public/social-icons.svg`) pour le feed, les réactions, le partage, les commentaires, la recherche, les groupes, les pages, le profil, l’administration et les réglages. Le langage visuel reprend les conventions d’usage des réseaux sociaux modernes sans reproduire les marques ou icônes propriétaires d’une plateforme tierce.

## Démarrer

```bash
npm install
npm run dev
```

Build de production : `npm run build`, puis `npm run preview`.

## Variables d’environnement

Créer `.env.local` à partir de `.env.example` avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. La clé publishable est la seule clé utilisée par React. Ne jamais exposer `SUPABASE_SECRET_KEY`, `service_role` ou `SUPABASE_JWKS_URL` côté client : les opérations admin doivent passer par des Edge Functions protégées.

## Activer Supabase

1. Dans Supabase → **SQL Editor**, exécuter `supabase/migrations/001_avani_core.sql`, puis `002_social_features.sql`, `003_realtime_notifications.sql`, `004_persistent_interactions.sql`, `005_admin_accounts.sql` et `006_group_chat.sql`.
2. Dans Supabase → **Authentication → URL Configuration**, ajouter `https://avani-pro.onrender.com` et `https://avani-pro.onrender.com/reset-password`.
3. Dans Render → **Environment**, ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`, puis relancer le déploiement.
4. Pour les messages, l’application charge l’historique depuis `messages` et s’abonne aux INSERT Realtime avec RLS. Les groupes créent maintenant une conversation persistante `is_group=true`, affichée dans Messages avec invitation de membres, historique et chat temps réel. Les nouveaux messages, follows, commentaires et likes produisent des notifications grâce à la migration 003. Les publications créées par un utilisateur connecté sont enregistrées dans `posts`. Les détails API/Edge Functions sont dans `docs-supabase.md`.

5. Dans Supabase → **Authentication → Providers → Google**, activez Google et renseignez le Client ID/Secret Google. Ajoutez les URLs `https://avani-pro.onrender.com` et `http://localhost:5173` dans les Redirect URLs. Avani Pro utilise ensuite le bouton **Continuer avec Google** via Supabase OAuth. L’inscription email se déroule en deux étapes : prénom/nom/mot de passe, puis email.

## Déployer sur Render

Créer un **Static Site** avec la commande `npm install && npm run build` et le dossier publié `dist`. Ajouter les variables Supabase dans l’onglet Environment et une réécriture `/*` vers `/index.html` pour le fallback SPA. Le fichier `render.yaml` fournit déjà cette configuration.

## Architecture

Voir `plan.md` pour les choix structurants et `TODO.md` pour les tranches restantes : Auth, migrations SQL/RLS, Storage, Realtime, pages, groupes et `/admin`.
