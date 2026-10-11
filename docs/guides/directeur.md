# Guide du directeur

Vous dirigez l'établissement : élèves, personnel, pédagogie, communication,
comptes d'accès. Vous **consultez** les finances sans y intervenir
quotidiennement.

Lisez d'abord les [règles communes](README.md).

---

## 1. Votre périmètre

| Vous pouvez | Vous ne pouvez pas | Qui le fait |
|---|---|---|
| Inscrire, modifier, archiver un élève | **Enregistrer un encaissement** | Caissier, comptable |
| Recruter et gérer le personnel | **Accepter un justificatif** | Comptable |
| Créer des comptes, attribuer des rôles, suspendre un accès | **Créer ou modifier les frais** | Comptable |
| Traiter les demandes de documents et de rendez-vous | **Réinitialiser un mot de passe** | Propriétaire |
| Configurer la pédagogie | **Passer une écriture comptable** | Comptable |
| Valider et publier les notes | **Créer un établissement** | Propriétaire |
| Tenir le conseil de classe | | |
| Affecter des frais, accorder une remise | | |
| Saisir et approuver une dépense | **Payer** une dépense | Comptable |
| Consulter toutes les finances | | |
| Lire le journal d'audit | | |

> Vous voyez tout de la finance, vous n'y agissez presque pas. Un directeur
> qui encaisserait et validerait lui-même perdrait le bénéfice du double
> regard — et sa propre protection en cas de contestation.

---

## 2. Votre tableau de bord

Effectifs, taux de recouvrement, impayés, absences du jour, justificatifs en
attente, demandes des familles.

Les chiffres financiers ne retiennent que les **encaissements validés**. Un
justificatif en attente n'est pas une recette.

---

## 3. Les élèves

**Scolarité → Élèves**

### Inscrire un élève

**Nouvel élève** : état civil, responsables légaux, classe. Le **matricule**
est généré automatiquement selon la règle de l'établissement
(`GSE-COC-25-0001`).

Lors du rattachement d'un responsable, vous choisissez ce qu'il pourra voir :
**les notes**, **les finances**, ou les deux.

> **Cas fréquent et sensible** — Parents séparés : le père règle la scolarité,
> la mère suit la scolarité. Rattachez les deux, en cochant les finances pour
> l'un et les notes pour l'autre. Chacun voit ce qui le concerne.

### Importer une promotion

**Élèves → Importer**. Fichier CSV. L'import se fait **en deux temps** :

1. **Aperçu** — l'application analyse **sans rien écrire** : lignes valides,
   erreurs ligne par ligne, doublons avec la base et doublons internes au
   fichier.
2. **Confirmation** — vous relisez, puis vous importez.

Un **modèle CSV** est téléchargeable depuis l'écran. Les séparateurs
(virgule ou point-virgule), les accents et les encodages Windows sont gérés.

> **Exportez d'abord depuis Excel en CSV.** Le format .xlsx n'est pas lu
> directement.

Si la classe est indiquée, l'élève est **inscrit** et les **frais de la classe
lui sont affectés automatiquement**.

### Archiver

Un élève archivé sort des listes actives mais **ses données restent** :
bulletins, paiements, historique. On n'efface pas le dossier d'un ancien
élève.

---

## 4. Le personnel

**Scolarité → Personnel** : fiche, fonction, contrat, affectations.

**Scolarité → Présences du personnel** : feuille quotidienne — présent,
absent, retard en minutes, congé — et traitement des demandes de congé.

L'approbation d'un congé marque les journées concernées **sans écraser une
présence ou un retard déjà constaté** : un fait observé prime sur une
régularisation administrative.

> ⚠️ **Aucune retenue sur salaire n'est calculée, aucun solde de congés n'est
> tenu.** Ces règles dépendent du droit du travail applicable et de votre
> convention. L'application enregistre les faits ; elle n'en tire aucune
> conséquence salariale.

---

## 5. Les comptes et les rôles

**Paramètres → Utilisateurs et rôles**

Créez un compte, attribuez un rôle, suspendez ou réactivez un accès.

> **Vous ne pouvez pas réinitialiser un mot de passe.** Ce droit appartient au
> propriétaire. Si un agent perd le sien, adressez-lui la demande. À la
> création d'un compte en revanche, le mot de passe provisoire s'affiche
> **une seule fois** : notez-le et transmettez-le par un canal distinct —
> jamais dans le même message que l'identifiant.

**Suspendre un accès ferme immédiatement les sessions ouvertes.** Un agent qui
quitte l'établissement perd l'accès à l'instant, pas à sa prochaine connexion.

### Les permissions fines

**Utilisateurs et rôles → Permissions** (sur une ligne).

Vous ajoutez ou retirez une permission à **une personne précise**, en écart de
son rôle. Les écarts sont signalés en couleur et rappelés en haut de page.

> **Exemple** — Votre secrétaire, de rôle Caissier, doit aussi éditer les
> certificats de scolarité. Ajoutez-lui « Traiter les demandes de documents »
> sans changer son rôle, et sans lui ouvrir la comptabilité.

Deux garde-fous : vous **ne pouvez pas modifier vos propres permissions**, et
l'administration de la plateforme n'est **jamais** attribuable depuis l'écran
d'un établissement.

> Retirer une permission **ferme réellement l'action**. Ce n'est pas un
> masquage de bouton : le serveur refuse, même en appelant l'application
> directement.

---

## 6. Piloter la pédagogie

Vous avez les mêmes droits que le responsable pédagogique : configuration,
validation, publication, bulletins, conseil de classe.

Si votre établissement a un responsable pédagogique, laissez-lui la main au
quotidien et gardez la publication et le conseil de classe.

👉 Détail complet dans le [guide du responsable
pédagogique](responsable-pedagogique.md).

---

## 7. Les demandes des familles

**Communication → Demandes des familles**

Les familles demandent documents et rendez-vous depuis leur espace. Vous les
traitez ici.

Pour un document : **Éditer le document** (PDF immédiat) puis **Marquer prêt**,
et **Marquer remis** à la remise. Pour refuser, **un motif est obligatoire** —
il est transmis à la famille.

Pour un rendez-vous : **Confirmer** avec une date, **Décliner** avec un motif,
ou **Marquer effectué**.

> Aucun changement de statut n'est silencieux : la famille est notifiée à
> chaque fois.

---

## 8. Exemple : une rentrée scolaire

**Semaine 1 — Préparer.**
Paramètres → nouvelle année `2026-2027`, trois trimestres avec leurs dates.
Vous reconduisez cycles, niveaux, classes, matières et coefficients.
Vous affectez les enseignants aux couples classe/matière.

**Semaine 2 — Les élèves.**
Vous exportez la liste des réinscrits, complétez le CSV des nouveaux,
l'importez. L'aperçu signale 3 doublons et 2 dates de naissance illisibles.
Vous corrigez le fichier, relancez : 47 élèves importés, inscrits, frais
affectés.

**Semaine 3 — Les accès.**
Vous créez les comptes des deux nouveaux enseignants (rôle Enseignant) et de
la nouvelle secrétaire (rôle Caissier). Vous ajoutez à cette dernière
« Traiter les demandes de documents ». Vous remettez les mots de passe
provisoires en main propre.

**Semaine 4 — Communiquer.**
Vous publiez une annonce « Rentrée : lundi 14 septembre, 7 h 30 ». Vous
vérifiez le tableau de bord : 312 élèves inscrits, 2 classes à capacité.

**Toute l'année — Surveiller.**
Chaque lundi : impayés, absences de la semaine, demandes en attente. Avant
chaque conseil : bulletins générés, appréciations saisies.

---

## 9. Le journal d'audit

**Administration → Journal d'audit**

Qui a fait quoi, quand : connexions, créations, modifications, annulations,
accès refusés, tentatives de franchissement entre établissements.

Consultez-le quand une opération surprend. Il répond à « que s'est-il
passé ? » sans accuser personne a priori.

---

## 10. Erreurs fréquentes

**« Je ne peux pas enregistrer un paiement. »**
C'est normal. Le rôle Caissier ou Comptable le fait.

**« Un enseignant ne voit pas sa classe. »**
Affectation manquante au couple classe/matière.

**« Les chiffres du tableau de bord ne collent pas avec la caisse. »**
Les justificatifs en attente ne sont pas des recettes. Regardez l'écran
Justificatifs.

**« J'ai supprimé un élève par erreur. »**
Il n'y a pas de suppression, seulement l'archivage. Réactivez-le depuis sa
fiche.

**« Un parent dit ne pas voir les notes. »**
Son rattachement n'autorise peut-être pas les notes, ou la période n'est pas
publiée.

---

## 11. Limites à connaître

- **Aucun e-mail ni SMS** : les notifications restent dans l'application.
- **Pas d'historique inter-établissements** : un élève venant d'une autre
  école arrive sans son passé scolaire.
- **Import CSV uniquement**, pas .xlsx natif.
- **Modules optionnels** : seule la **bibliothèque** est utilisable. Cantine,
  transport, inventaire, maintenance, événements et anciens élèves sont
  activables mais **n'ouvrent aucun écran**.
- **Pas de sauvegarde automatique** : la procédure est à mettre en place avec
  votre prestataire technique.
