# Messagerie Avani Pro : périmètre et validation

## Fonctions intégrées

- Espace PC élargi, liste/conversation sur mobile et retour à la liste.
- Recherche des conversations et filtres toutes/non lues/groupes publics/privées.
- Recherche de membres Avani Pro, discussion directe et groupe nommé avec plusieurs membres.
- Sélection et retrait de participants avant création, chargement, erreurs et nouvelle tentative.
- Envoi texte multiligne : Entrée envoie, Maj+Entrée ajoute une ligne.
- Émojis, pièces jointes, images, vidéos et audio avec contrôles natifs, fichiers par lien signé.
- Réponses citées, modification/suppression, réactions, anciens messages et indicateur de saisie existants.
- Recherche dans les messages chargés avec navigation vers le résultat ; ne prétend pas chercher tout l’historique distant.
- Consultation des membres selon les politiques de lecture Supabase ; compte indiqué comme membres visibles, pas comme total garanti.
- Gestion des groupes privés par leur responsable : renommage, ajout/retrait de membres, transfert de gestion et départ. Contrôle serveur via RPC, pas de privilège accordé par le navigateur.
- Création atomique de discussions, réutilisation des discussions privées et verrou contre les créations concurrentes en double.

## Vérifications automatiques

`npm run build`, `npm run test:feed`, `npm run lint` et `git diff --check`.
Les tests du fil couvrent également les modèles de messagerie (aperçus, non-lus, normalisation, réactions et erreurs de base). Ils ne remplacent pas les tests d’interaction ou les tests avec deux comptes.

## Recette avec deux comptes avant de déclarer la production validée

1. Compte A : rechercher B, ouvrir une discussion, envoyer un message. Vérifier réception chez B et absence de doublon.
2. Compte B : rester dans la liste, recevoir un message, contrôler le non-lu, ouvrir la conversation et contrôler sa remise à zéro.
3. Compte A : créer un groupe avec B et C ; vérifier l’accès des membres et le refus d’accès d’un non-membre.
4. Contrôler réponse, modification, suppression, réactions, chargement d’historique et recherche locale.
5. Envoyer image, vidéo, audio, PDF, fichier trop volumineux ; vérifier également qu’un non-membre ne peut pas accéder aux fichiers privés.
6. Changer de discussion pendant un envoi, tester coupure réseau et reconnexion.
7. Sur PC et téléphone : contrôler la largeur, le clavier virtuel, le retour liste, la navigation clavier et les fenêtres de création.

## Hors périmètre

Appels audio/vidéo, messages vocaux enregistrés dans le navigateur, notifications push hors application, rôles multiples d’administrateur, blocage, archivage et chiffrement de bout en bout ne sont pas implémentés ici. Ces fonctions nécessitent un périmètre et/ou des garanties serveur dédiées. Aucun bouton ne les simule.

Les fichiers du dépôt n’appliquent pas automatiquement les migrations ou les règles Supabase. Les tests locaux ne prouvent ni les permissions de production ni la livraison en temps réel.

## Vérifications Supabase réalisées pendant cette livraison

- Projet `hpsftpganwkcftnbgnwq` actif ; tables de messages et publication Realtime contrôlées.
- Migration 013 appliquée (deux migrations distantes : fonctions puis restriction des invitations).
- Bucket privé absent détecté, créé par la migration 014 avec limite de 25 MiB et règles membres/utilisateur pour les lectures et dépôts.
- Recette SQL transactionnelle annulée : création groupe, renommage, ajout/retrait, transfert, départ, réutilisation d’un DM ; refus d’anonyme, non-membre et membre non responsable. Aucun groupe de test conservé.
- Recette RLS sous rôle `authenticated`, également annulée : message envoyé par A lisible par B, non lisible par C ; refus d’envoi de C et d’édition du message de A par B ; invitation directe refusée à B et C.
- Ces tests SQL ne simulent pas la livraison réseau Realtime ni un upload réel via Storage. Tests de navigateur entre deux comptes et appareils réels encore nécessaires.

## Correctifs mentions, logos et médias — 22 octobre 2026

- Migration 015 appliquée au projet : groupe communautaire créé atomiquement avec son chat et son propriétaire ; politique de lecture des membres non récursive ; `conversations.avatar_path` ; `posts.media_paths` ; lecture authentifiée du bucket privé `post-media`.
- Mentions : saisie `@`, choix parmi les autres membres actuels du groupe, clavier et tactile, liens de profils et surbrillance pour le destinataire. Mentions conservées dans le texte par identifiant public ; pas de notification push spécifique ni d’identifiants structurés de mention.
- Logo : informations du chat de groupe → photo, réservé à son créateur encore membre. JPEG/PNG/WebP, 5 MiB au maximum côté client ; chemin et autorisation contrôlés côté serveur. Stockage privé, affichage par URL signée. Les anciennes photos remplacées ne sont pas automatiquement supprimées.
- Présence : une inscription Realtime pour l’application connectée ; compteur des personnes distinctes présentes et membres du groupe, jamais compteur des messages. Un état inconnu ne simule pas un nombre de personnes connectées.
- Réactions : seules les réactions effectivement déposées apparaissent sous le message ; palette sur demande (bouton, menu contextuel ou appui prolongé).
- Médias : MIME manquant reconnu par extension, refus des fichiers vides, enregistrement des chemins multiples, lecture native responsive avec `playsInline`, message visible si le fichier ne peut pas être lu. Pas de transcodage ; MP4 H.264/WebM recommandés.
- Le rond rouge supprimé était le pseudo-élément décoratif `.top-actions:before`, sans action ; notifications et Stories restent disponibles.
- Vérification locale : build TypeScript/Vite réussi, 138/138 tests de régression, lint sans erreur (32 avertissements), `git diff --check` propre ; smoke HTTP de la version compilée réussi.
- Recette Supabase authentifiée, transaction annulée : création atomique du groupe privé, adhésions du propriétaire, lecture sans récursion RLS, refus de chemin photo invalide et de modification par non-propriétaire, groupe privé invisible au tiers ; insertion/relecture d’une publication vidéo avec deux chemins de médias conservés. Aucun groupe/publication de recette conservé.
- Constat avant livraison : neuf publications en base, dont deux images avec chemin de média et aucune vidéo. Un upload antérieurement échoué ne peut pas être reconstitué.
- Limites de vérification : pas de navigateur graphique disponible ici, pas d’upload/download réel par Storage API, pas de contrôle visuel téléphone/ordinateur ou de réception Realtime entre deux appareils. La recette SQL valide les métadonnées et autorisations, pas le transfert des octets ni les codecs. Ces validations restent nécessaires avant d’affirmer une vérification de bout en bout.
