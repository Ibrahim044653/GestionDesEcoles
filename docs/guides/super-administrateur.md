# Guide du super-administrateur

Vous administrez la **plateforme**, pas les écoles. Vous suivez les
organisations clientes, leurs abonnements, leur facturation, et vous répondez
aux tickets d'assistance.

---

## 1. Un rôle volontairement étroit

C'est le rôle le plus **limité** en données scolaires de toute l'application.

| Vous pouvez | Vous ne pouvez pas |
|---|---|
| **Créer un client** : organisation, école, compte propriétaire, abonnement | **Ouvrir le dossier d'un élève** |
| Voir les organisations et leurs établissements | |
| Gérer les abonnements et les formules | **Voir les notes ou les bulletins** |
| Suivre la facturation de la plateforme | **Voir les encaissements d'une école** |
| Répondre aux tickets d'assistance | **Encaisser, noter, inscrire** |
| Consulter le journal d'audit | **Modifier les données d'une école** |
| Voir les comptes utilisateurs | |

> **Pourquoi si peu ?** Parce que vous n'avez aucune raison métier de lire le
> bulletin d'un enfant ou la situation financière d'une famille. Un éditeur de
> logiciel qui peut tout voir chez tous ses clients est un risque pour eux.
> Vos quatre permissions sont exactement ce qu'il faut pour exploiter la
> plateforme, et rien de plus.
>
> Si vous vous connectez et constatez que les écrans scolaires sont absents,
> ce n'est pas une anomalie : c'est la conception.

---

## 2. Votre écran

**Administration → Administration SaaS**

| Section | Contenu |
|---|---|
| **Statistiques globales** | Organisations, établissements, élèves, personnel |
| **Organisations** | Chaque client, ses écoles, son abonnement |
| **Factures** | Facturation de la plateforme |
| **Tickets d'assistance** | Demandes des clients |
| **Formules** | Offres et leurs limites |

---

## 2 bis. Créer un client

**Administration SaaS → Nouveau client** (bouton en haut à droite)

Une seule opération crée l'ensemble : l'**organisation**, son **premier
établissement**, le **compte propriétaire** et l'**abonnement**.

| Section | Ce qu'il faut |
|---|---|
| **Le client** | Nom de l'entité qui souscrit, pays |
| **Premier établissement** | Nom, type, ville, contacts |
| **Compte propriétaire** | Nom, prénom, e-mail, téléphone |
| **Abonnement** | Formule, et nombre de jours d'essai (0 pour un abonnement actif immédiatement) |

### Trois choses à savoir

**Le mot de passe provisoire s'affiche une seule fois.** Notez-le avant de
quitter l'écran et transmettez-le par un canal distinct de l'e-mail
d'identifiant. Si vous le perdez, il faut le réinitialiser.

**Un compte existant est réutilisé, jamais écrasé.** Si l'adresse du
propriétaire correspond à un compte déjà présent — la même personne détient
plusieurs groupes scolaires — il est simplement rattaché au nouveau client.
**Son mot de passe actuel reste valable**, et aucun provisoire n'est affiché.
Il basculera entre ses clients par le sélecteur du haut.

**L'établissement est créé avec son plan comptable SYSCOHADA**, donc prêt à
encaisser. L'année scolaire, les classes, les matières et les frais restent à
la charge du propriétaire : ces choix engagent sa pédagogie et sa
tarification.

### Exemple

> **Le collège Les Palmiers, à Bouaké, souscrit la formule Essentiel.**

1. **Nouveau client**.
2. Client : `Collège Les Palmiers`, pays `CI`.
3. Établissement : `Collège Les Palmiers`, type `Collège`, ville `Bouaké`.
4. Propriétaire : `Adama`, `OUATTARA`, `a.ouattara@palmiers.ci`.
5. Abonnement : `Essentiel`, `30` jours d'essai.
6. Vous validez. Le message affiche le mot de passe provisoire —
   **vous le notez**.
7. Vous appelez M. OUATTARA, lui donnez son identifiant par e-mail et le mot
   de passe par téléphone. Il se connecte, en choisit un nouveau, et configure
   son année scolaire.

---

## 3. Gérer un abonnement

Les états : **Essai**, **Actif**, **Impayé**, **Suspendu**, **Résilié**.

> ⚠️ **La règle qui prime sur tout le reste.**
>
> **Une suspension coupe l'accès applicatif. Elle ne supprime jamais les
> données de l'établissement.**
>
> Un client en retard de paiement retrouve ses élèves, ses notes et sa
> comptabilité intacts dès la régularisation. Une résiliation n'efface rien
> non plus : elle ouvre une procédure d'export puis de suppression, décidée
> explicitement.
>
> Ces données sont des bulletins, des dossiers d'enfants, une comptabilité.
> Les perdre pour un impayé serait hors de proportion.

Avant toute suspension, prévenez le client et rappelez-lui qu'il peut faire
son **export complet** depuis son espace propriétaire.

---

## 4. Répondre à un ticket

Dans **Tickets d'assistance** : objet, organisation, établissement,
demandeur, priorité et message.

**Répondre** : rédigez, puis choisissez l'état d'arrivée.

| État | Quand |
|---|---|
| **En cours de traitement** | Vous avez répondu, le sujet n'est pas clos |
| **Résolu** | Le problème est réglé |
| **Clos** | Plus aucune suite attendue |
| **Laisser ouvert** | Vous avez répondu mais attendez un retour |

Chaque réponse est **horodatée**, ajoutée à l'historique du ticket, et le
demandeur est notifié. **Rien n'est supprimé** : l'historique est la seule
trace dont dispose le client.

> Répondre ne ferme pas automatiquement un ticket, et fermer sans répondre
> n'est pas possible. L'état se choisit, il ne se devine pas.

### Exemple

> **Ticket — « Impossible de générer les bulletins de 4ᵉ A », priorité Haute,
> Groupe Scolaire Excellence — Cocody.**

1. Vous lisez. L'utilisateur est le responsable pédagogique.
2. Vous consultez le **journal d'audit** de cette organisation : une tentative
   de génération a échoué.
3. Vous répondez : « Bonjour, la période "Trimestre 2" comporte
   3 évaluations encore en brouillon pour la 4ᵉ A. Validez-les depuis
   Pédagogie → Évaluations et notes, puis relancez la génération. »
4. État : **En cours de traitement** — vous attendez confirmation.
5. Le client confirme. Vous passez en **Résolu**.

> Vous n'avez **pas** ouvert les bulletins ni les notes. Vous avez diagnostiqué
> depuis le journal d'audit et le discours de l'utilisateur. C'est la bonne
> méthode : accompagner sans accéder aux données scolaires.

---

## 5. Le journal d'audit

Connexions, créations, modifications, annulations, accès refusés, tentatives
de franchissement entre établissements, exports complets.

Il sert à **diagnostiquer**, pas à surveiller les familles. Il contient qui a
fait quoi et quand — pas le contenu des bulletins.

> Si vous y voyez des **tentatives répétées de franchissement entre
> établissements**, remontez-le immédiatement : c'est le signe qu'un compte
> cherche à sortir de son périmètre.

---

## 6. Ce que vous ne devez pas faire

**Ne vous attribuez pas un rôle dans un établissement client pour « aller
voir ».** C'est techniquement possible — vous gérez les comptes — mais cela
contourne la raison d'être de votre rôle étroit, et c'est inscrit au journal
d'audit.

Si une intervention sur des données réelles est indispensable, demandez au
client de la faire lui-même, écran partagé si besoin. Vous l'accompagnez, il
agit.

> L'application vous en empêche d'ailleurs partiellement : l'administration de
> la plateforme **n'est jamais attribuable** depuis l'écran d'un
> établissement. Elle ne s'accorde qu'au niveau du compte, hors du contexte
> d'une école.

---

## 7. Limites à connaître

- **Pas de facturation automatique** : les factures sont enregistrées, aucun
  prélèvement n'est déclenché.
- **Pas d'e-mail** : vos réponses arrivent en notification dans
  l'application. Prévenez vos clients de consulter la cloche.
- **Pas de tableau de bord d'usage technique** (performance, volumétrie) :
  seules les statistiques métier existent.
- **Pas de suppression d'organisation en un clic** : volontaire, c'est une
  procédure manuelle et réfléchie.
