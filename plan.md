# Avani Pro — plan d’architecture

## Positionnement
Avani Pro est un réseau social professionnel premium pour créateurs, entreprises et communautés. La première tranche livrée est un shell fonctionnel front-end, conçu pour être branché à Supabase (Auth, Postgres, Storage, Realtime) sans réécrire l’interface.

## Design
- **Mouvement** : néo-futurisme éditorial, avec profondeur sombre, halos violets et surfaces translucides.
- **Principes** : lisibilité professionnelle, densité maîtrisée, actions contextuelles, états de données crédibles.
- **Palette** : fond ink `#080b16`, violet électrique `#8b5cf6`, cyan signal `#22d3ee`, bleu `#4f7cff`; les dégradés matérialisent la connexion et l’élan de communauté.
- **Paradigme de layout** : navigation persistante à gauche, fil central focalisé, colonne de signaux à droite; sur mobile, la navigation devient une barre compacte.
- **Signatures** : marque orbitale AV, halos de statut, cartes à bordure lumineuse et tags de communauté.
- **Interactions** : feedback immédiat (like, follow, publier), boutons à faible friction et notifications visibles.
- **Animation** : transitions 180–260 ms, halo de hover discret, apparition des cartes par glissement de 8 px.
- **Typographie** : Space Grotesk pour titres et Inter/system-ui pour le texte courant.
- **Essence** : « Le réseau professionnel où les idées trouvent leur communauté. » Personnalité : ambitieuse, claire, connectée.
- **Voix** : directe, constructive, internationale. Exemples : « Construisez votre signal. » / « Les bonnes connexions accélèrent les bonnes idées. »
- **Logo** : monogramme AV dans une orbite ouverte, rendu en SVG/CSS pour rester net à toutes les tailles.
- **Couleur propriétaire** : violet signal `#8B5CF6`.

## Structure applicative
- `src/App.tsx` : composition de l’espace connecté, navigation, feed, interactions locales.
- `src/App.css` / `src/index.css` : système visuel responsive.
- `public/manus-routes.json` : routes de l’application.
- `supabase/` (prochaine étape) : migrations, politiques RLS, fonctions Realtime et Storage.
- `docs/` (prochaine étape) : contrats API, schéma d’événements et guide d’exploitation.

## Backend cible
Supabase Auth gère les sessions et réinitialisations; Postgres porte `profiles`, `follows`, `pages`, `posts`, `comments`, `reactions`, `conversations`, `messages`, `groups`, `notifications`, `files`, `admin_roles` et `audit_logs`. Les politiques RLS limitent chaque ressource à son propriétaire, aux membres concernés ou aux rôles admin. Supabase Storage sépare les buckets avatars, covers, posts et files. Realtime publie messages, notifications et compteurs de présence.

## Déploiement
Build Vite statique via `npm run build`; Render sert `dist` avec fallback SPA. Variables attendues : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, puis les secrets d’administration uniquement côté serveur/Edge Functions.
