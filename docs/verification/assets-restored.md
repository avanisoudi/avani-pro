# Rétablissement des assets demandé après la PR 61

Référence : `d568669` (état avant les modifications d’assets de la PR 61).

- Fichiers `public/assets/story-placeholder.svg` et `public/social-icons.svg` rétablis à l’identique.
- Anciennes icônes de navigation Notifications/Fichiers et SVG supérieurs Vidéos/Notifications restaurés.
- Retrait des surcharges pétrole/cuivre appliquées aux icônes de navigation.
- Aucun autre fichier de `public/` ne diffère de cette référence.
- Conservation des brouillons, réorganisation des médias, modération, nouveaux réglages et nouvelle administration.
- Conservation des modifications indépendantes du thème de messagerie (commit `2755c05`).

L’audit vérifie toujours les fichiers identiques, les identifiants SVG dupliqués et les références d’icônes. Ses assertions qui interdisaient l’ancien fond de story ont été retirées pour respecter cette restauration.

Vérification : build réussi, 167/167 tests du fil, 4/4 contrôles de durcissement, audit assets réussi, lint sans erreur (34 avertissements), diff sans problème d’espacement. Aucun test de navigateur supplémentaire pour ce rétablissement.
