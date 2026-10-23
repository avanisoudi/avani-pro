# Groupes unifiés et lecture persistante

## Livraison
- Une seule liste dédupliquée par UUID pour les adhésions et les groupes à découvrir ; recherche et filtres sur cette liste entière.
- Un seul point d’entrée de création ; statut responsable d’après `owner_id`, invitation réservée au responsable.
- Compteurs de membres autorisés côté serveur, jamais déduits du nombre de profils visibles. Un compteur inaccessible est affiché indisponible, pas zéro.
- Erreur partielle compacte, nouvelle tentative, détails techniques repliés. Protection des doubles soumissions de création/invitation.

## Persistance et sécurité
La migration `021_persistent_read_and_group_counts.sql` a été appliquée au projet existant avant la publication du frontend. Elle ne supprime aucune donnée.
- `avani_mark_chat_read` utilise `auth.uid()`, vérifie l’adhésion et le message de la conversation, verrouille l’adhésion et avance `last_read_at` au timestamp **serveur du message**, pas à l’horloge du navigateur.
- Le déclencheur empêche également un ancien client de reculer/effacer ce marqueur.
- `avani_unread_counts` compte tous les messages entrants non supprimés après le marqueur, indépendamment de la limite de 150 lignes utilisée pour les aperçus.
- Les fonctions sont réservées aux sessions authentifiées. Les comptes privés ne sont pas exposés aux non-membres.
- Les reçus sont fusionnés de façon monotone. Une réponse tardive ne remplace pas un reçu plus récent.

Le frontend n’ouvre plus automatiquement la première discussion. Il accuse réception uniquement des messages rendus au bas d’un fil au premier plan avec le focus, hors paramètres/création de conversation. Regarder l’historique plus haut ne lit pas les nouveaux messages hors écran. Une erreur laisse le marqueur inchangé et propose une nouvelle tentative ; cette action explicite ramène aux derniers messages. Le branchement du défilement attend aussi la fin du chargement de l’inbox.

Les événements de visibilité/focus, réseau et reconnexion Realtime réconcilient les messages et les reçus. Les chargements d’inbox antérieurs à un accusé de lecture ne peuvent pas rétablir un compteur périmé. Les réponses d’un ancien fil sont ignorées après changement de discussion.

## Vérifications effectuées
- Build : 110 modules, succès ; lint : 36 avertissements existants, zéro erreur.
- Modèles : 185 vérifications, dont déduplication, rôle réel, compteur serveur/inconnu, reçus monotones.
- `supabase/tests/read_and_group_counts.sql` exécuté dans une transaction annulée : persistance, ancien curseur, ancien client, nouveau non-lu, autre membre intact, refus du non-membre et confidentialité des compteurs. Aucun profil/message de recette conservé.
- Navigateur isolé avec état serveur simulé **conservé à travers les vrais rechargements** : groupes desktop/mobile, filtres, recherche, rôles, compteurs ; absence de lecture automatique, onglet masqué et fenêtre sans focus, lecture après retour, nouvelle arrivée conservée non lue, reçus après rechargement, historique non acquitté, échec et nouvelle tentative.
- Régressions : chat mobile 5 tailles × 2 thèmes + redimensionnement, paramètres de chat 6 scénarios, fil/album responsive, Marketplace, assets et durcissement.
- Une assertion obsolète du test du fil a été alignée sur la restriction Premium aux administrateurs déjà intégrée depuis main ; le compte de recette ordinaire ne doit plus voir cette promotion.

## Exécuter le navigateur
Utiliser le serveur Vite de recette (URL Supabase `https://avani-test.supabase.co`, clé fictive `browser-test-only`), les dépendances optionnelles Playwright et Chromium et, si nécessaire, les bibliothèques Chromium locales :

```sh
LD_LIBRARY_PATH=/tmp/chromium-libs/lib npm run test:groups-unread-browser
```

Les captures sont ignorées dans `.arena/groups-unread/`. Ces fixtures ne démontrent pas une session multi-appareils physique ni un déploiement frontend en production. Les tests SQL vérifient réellement les écritures et permissions du backend existant.

## Limites conservées
Le schéma historique est un curseur temporel par conversation, pas un reçu par UUID : deux messages au timestamp strictement identique partagent la même limite. Les aperçus de très anciennes conversations peuvent rester vides hors des 150 messages préchargés, mais leurs compteurs non lus sont exacts. La fusion au réveil couvre les messages récents et les suppressions logiques ; les suppressions physiques survenues hors connexion ne sont pas intégralement réconciliées dans l’historique déjà chargé.

Ne pas fusionner la PR si les vérifications de déploiement requises échouent. L’erreur Vercel `build-rate-limit` ne signifie pas que le nouveau frontend est publié.
