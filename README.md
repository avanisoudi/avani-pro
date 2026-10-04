# AVANI PRO

Réseau social professionnel nouvelle génération — interface React + TypeScript + Vite, prête pour une connexion Supabase.

## Démarrer

```bash
npm install
npm run dev
```

Build de production : `npm run build`, puis `npm run preview`.

## Variables d’environnement

Créer `.env.local` à partir de `.env.example` avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Ne jamais exposer de clé service Supabase côté client : les opérations admin doivent passer par des Edge Functions protégées.

## Déployer sur Render

Créer un **Static Site** avec la commande `npm install && npm run build` et le dossier publié `dist`. Ajouter les variables Supabase dans l’onglet Environment et une réécriture `/*` vers `/index.html` pour le fallback SPA. Le fichier `render.yaml` fournit déjà cette configuration.

## Architecture

Voir `plan.md` pour les choix structurants et `TODO.md` pour les tranches restantes : Auth, migrations SQL/RLS, Storage, Realtime, pages, groupes et `/admin`.
