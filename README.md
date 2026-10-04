# AVANI PRO

Réseau social professionnel nouvelle génération — interface React + TypeScript + Vite, prête pour une connexion Supabase.

## Démarrer

```bash
npm install
npm run dev
```

Build de production : `npm run build`, puis `npm run preview`.

## Variables d’environnement

Créer `.env.local` à partir de `.env.example` avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`. La clé publishable est la seule clé utilisée par React. Ne jamais exposer `SUPABASE_SECRET_KEY`, `service_role` ou `SUPABASE_JWKS_URL` côté client : les opérations admin doivent passer par des Edge Functions protégées.

## Activer Supabase

1. Dans Supabase → **SQL Editor**, exécuter `supabase/migrations/001_avani_core.sql`, puis `supabase/migrations/002_social_features.sql`.
2. Dans Supabase → **Authentication → URL Configuration**, ajouter `https://avani-pro.onrender.com` et `https://avani-pro.onrender.com/reset-password`.
3. Dans Render → **Environment**, ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`, puis relancer le déploiement.
4. Pour les messages, l’application charge l’historique depuis `messages` et s’abonne aux INSERT Realtime avec RLS. Les publications créées par un utilisateur connecté sont maintenant enregistrées dans `posts`. Les détails API/Edge Functions sont dans `docs-supabase.md`.

## Déployer sur Render

Créer un **Static Site** avec la commande `npm install && npm run build` et le dossier publié `dist`. Ajouter les variables Supabase dans l’onglet Environment et une réécriture `/*` vers `/index.html` pour le fallback SPA. Le fichier `render.yaml` fournit déjà cette configuration.

## Architecture

Voir `plan.md` pour les choix structurants et `TODO.md` pour les tranches restantes : Auth, migrations SQL/RLS, Storage, Realtime, pages, groupes et `/admin`.
