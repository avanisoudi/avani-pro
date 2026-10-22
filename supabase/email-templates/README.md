# E-mails Avani Pro — installation Supabase

Copier le contenu HTML complet de chaque fichier dans Authentication → Courriels / Email Templates. Sauvegarder chaque modèle. Les fichiers du dépôt ne sont pas automatiquement appliqués au projet Supabase.

| Fichier | Modèle Supabase | Objet suggéré |
| --- | --- | --- |
| confirm-signup.html | Confirm signup | Confirmez votre adresse e-mail — Avani Pro |
| invite.html | Invite user | Vous êtes invité sur Avani Pro |
| magic-link.html | Magic link | Votre lien de connexion — Avani Pro |
| change-email.html | Change email address | Confirmez votre changement d’adresse — Avani Pro |
| reset-password.html | Reset password | Réinitialisez votre mot de passe — Avani Pro |
| verification-code.html | Reauthentication (si disponible) | Votre code de vérification — Avani Pro |
| email-changed.html | Email address changed | Votre adresse e-mail a été modifiée — Avani Pro |
| password-changed.html | Password changed | Votre mot de passe a été modifié — Avani Pro |
| phone-changed.html | Phone number changed | Votre numéro de téléphone a été modifié — Avani Pro |

Le modèle verification-code est destiné à un flux demandant effectivement un code, et non à remplacer un lien de confirmation dans un flux qui attend un clic. Vérifier les variables disponibles dans l’éditeur du modèle choisi, notamment OldEmail, OldPhone et Phone pour les notifications.

## Identité et fonctionnalités

- Logo public et nom AVANI blanc / PRO violet, fond de secours pour les clients sans dégradés.
- Boutons et liens de secours dans les e-mails d’action ; code lisible dans l’e-mail de vérification.
- Notifications de sécurité, assistance avanisoudi@gmail.com et liens vers le site et la confidentialité.
- Tables de présentation, styles intégrés, largeur fluide et texte d’aperçu.
- Variables Supabase préservées ; aucune durée de validité fixe inventée : elle dépend du paramétrage du projet.

## Vérifications avant utilisation

Configurer le SMTP séparément, les URL de redirection et les durées de validité dans Supabase. Activer les notifications de sécurité souhaitées. Envoyer des tests sur Gmail et Outlook, sur mobile et ordinateur. Les variantes de rendu des clients e-mail sont normales ; les polices système approchent le lettrage du logo sans en garantir une reproduction exacte. Ne jamais envoyer de vrais liens ou codes d’authentification dans des captures publiques.
