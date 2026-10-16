# Avani Pro — plan d’architecture

## Positionnement
Avani Pro est un réseau social professionnel premium pour créateurs, entreprises et communautés. L’interface connectée conserve son authentification et ses données réelles dans Supabase; ce changement porte sur la présentation du fil, pas sur le modèle de compte ni les autorisations.

## Design
- **Mouvement** : réseau social éditorial, lumineux et familier, calé sur la référence fournie; une barre bleu nuit porte une interface aérée en surfaces blanches.
- **Principes** : hiérarchie immédiatement lisible; trois colonnes desktop au service du fil; actions directes et accessibles; contenu social exclusivement fondé sur les données du compte.
- **Palette** : fond bleu-gris très pâle `#F4F7FB`, surfaces blanches, texte bleu ardoise, navigation bleu nuit `#14245F`, bleu d’action `#1877F2`; les accents violets restent réservés à l’identité Avani Pro et à Premium.
- **Paradigme de layout** : barre fixe en haut; navigation et raccourcis à gauche; stories, composition et publications dans la colonne centrale; contacts, suggestions, Premium et groupes à droite. Le rail disparaît au format tablette et le mobile conserve son interface dédiée.
- **Signatures** : monogramme Avani Pro dans la barre nuit; stories verticales à coins doux; cartes blanches bordées et accents bleus/violets cohérents.
- **Interactions** : les entrées gardent leurs routes et états; les raccourcis de groupes proviennent des groupes réellement rejoints; « Reel » ouvre le sélecteur vidéo; les filtres et panneaux non centraux peuvent être masqués sur le desktop pour suivre la référence.
- **Animation** : aucune animation décorative ajoutée au feed; les transitions et retours existants restent sobres et rapides.
- **Typographie** : sans sérif système/Arial pour les données sociales et les libellés; niveaux courts et denses dans les rails, lecture confortable dans le fil.
- **Essence** : « Le réseau professionnel où les idées trouvent leur communauté. » Personnalité : ambitieuse, claire, connectée.
- **Voix** : directe, constructive, internationale. Exemples : « Construisez votre signal. » / « Les bonnes connexions accélèrent les bonnes idées. »
- **Logo** : monogramme AV dans une orbite ouverte, rendu en SVG/CSS pour rester net à toutes les tailles.
- **Couleur propriétaire** : violet signal `#8B5CF6`.

## Structure applicative
- `src/App.tsx` : composition de l’espace connecté, navigation, feed et interactions locales.
- `src/desktop.css` / `src/mobile.css` : règles de structure responsive historiques.
- `src/feed-reference.css` : couche desktop chargée en dernier pour la disposition de référence; les règles restent à partir de 761 px afin de préserver le rendu mobile.
- `src/components/PostComposer.tsx` et `src/components/PostCard.tsx` : publication, médias, réactions et commentaires réels.
- `src/feed.css` et `src/themes.css` : styles isolés du feed et préférences de thème.
- `public/manus-routes.json` : routes de l’application.
- `supabase/` : migrations, politiques RLS, fonctions Realtime et Storage.
- `docs/` : contrats API, schéma d’événements et guide d’exploitation.

## Backend cible
Supabase Auth gère les sessions et réinitialisations; Postgres porte `profiles`, `follows`, `pages`, `posts`, `comments`, `reactions`, `conversations`, `messages`, `groups`, `notifications`, `files`, `admin_roles` et `audit_logs`. Les politiques RLS limitent chaque ressource à son propriétaire, aux membres concernés ou aux rôles admin. Supabase Storage sépare les buckets avatars, covers, posts et files. Realtime publie messages, notifications et compteurs de présence.

## Déploiement
Build Vite statique via `npm run build`; Render sert `dist` avec fallback SPA. Variables attendues : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, puis les secrets d’administration uniquement côté serveur/Edge Functions.
