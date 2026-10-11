# Guide du propriétaire

Vous détenez un ou plusieurs établissements. C'est le rôle le plus large :
vous cumulez les droits du directeur et du comptable, et vous seul pouvez
**créer un nouvel établissement**.

Lisez d'abord les [règles communes](README.md).

---

## 1. Ce que vous seul pouvez faire

| Action | Pourquoi vous |
|---|---|
| **Créer un établissement** | C'est un acte de gestion d'entreprise |
| **Configurer les finances** | Plan comptable, comptes, règles de pénalité |
| **Payer une dépense** | Le directeur approuve, vous ou le comptable décaissez |
| **Clôturer un exercice** | Décision engageante |
| **Exporter les données de paie** | Information sensible |
| **Réinitialiser un mot de passe** | Le directeur crée des comptes, mais ne réinitialise pas |

Vous disposez en outre de **tout** ce que font le directeur, le responsable
pédagogique, le comptable et le caissier.

> **Un conseil d'usage.** Pouvoir tout faire ne signifie pas devoir tout
> faire. Si vous encaissez, validez et clôturez vous-même, aucun contrôle
> croisé ne subsiste. Déléguez l'exploitation et gardez la supervision.

---

## 2. Travailler sur plusieurs établissements

Le **sélecteur en haut** bascule de l'un à l'autre. Tout l'écran suit : élèves,
finances, personnel.

> **Les données ne se mélangent jamais.** Depuis l'établissement de Cocody, un
> élève de Yopougon n'existe pas — pas même en connaissant son identifiant.
> Avant toute opération, vérifiez l'établissement affiché en haut.

Chaque établissement a ses propres années scolaires, frais, plan comptable,
personnel et comptes d'accès. Un directeur peut diriger l'un sans voir l'autre.

---

## 3. Ouvrir un nouvel établissement

**Paramètres → Nouvel établissement** (bouton en haut à droite)

Vous renseignez le nom, le type, la ville, les contacts et, si vous le
souhaitez, une règle de matricule. L'établissement est créé **avec son plan
comptable**, donc prêt à encaisser.

> **Ce que l'application ne devine pas, et ne doit pas deviner :** l'année
> scolaire, les périodes, les classes, les matières et les frais. Ces choix
> engagent votre pédagogie et votre tarification ; une configuration
> automatique serait plausible mais fausse, et plus pénible à corriger qu'à
> saisir.

> **La limite de votre formule est opposable.** Si votre abonnement autorise
> deux établissements et que vous en avez deux, le bouton refuse la création
> et vous indique de changer de formule.

Une fois créé, **basculez dessus par le sélecteur du haut**, puis configurez
dans l'ordre :

1. **Logo et identité complète** : le logo apparaît sur les reçus, bulletins
   et certificats.
2. **Année scolaire et périodes** : trimestres ou semestres, avec leurs dates.
3. **Structure** : cycles, niveaux, classes, filières, matières, coefficients.
4. **Réglages pédagogiques** : barème, absences, moyenne de passage,
   rattrapage.
5. **Finances** : comptes (caisse, banque, Mobile Money), plan comptable
   SYSCOHADA, frais de l'année.
6. **Équipe** : comptes du directeur, du comptable, des enseignants.
7. **Élèves** : import CSV.

> **L'ordre compte.** Les frais ont besoin de l'année scolaire ; les classes
> ont besoin des niveaux ; les affectations d'enseignants ont besoin des
> matières. Remonter en arrière est possible mais fait perdre du temps.

---

## 4. Votre tableau de bord

Recettes, impayés, trésorerie, effectifs, masse salariale indicative.

Vous disposez des deux tableaux : **propriétaire** et **direction**.

**Pilotage → Rapports et exports** vous donne l'évolution mensuelle, la
répartition par mode de règlement, le budget comparé au réalisé, et des
exports CSV.

---

## 5. Vos responsabilités financières

### Configurer

**Paramètres → Comptabilité** : plan comptable SYSCOHADA, comptes financiers,
exercices, budgets par catégorie.

**Finances → Pénalités et remises** : règles de pénalité de retard et paliers
de remise fratrie. Enregistrer une règle **n'applique rien** — l'application
est ensuite un geste explicite, avec aperçu préalable.

### Clôturer un exercice

Décision engageante : après clôture, plus aucune écriture ne s'ajoute à la
période.

> **Avant de clôturer** : tous les rapprochements bancaires clos, toutes les
> dépenses approuvées soit payées soit annulées, bilan équilibré.
>
> **Si le bilan signale un déséquilibre, ne clôturez pas.** Un déséquilibre
> révèle une anomalie en amont ; la figer par une clôture la rendrait bien
> plus difficile à retrouver.

👉 Détail dans le [guide du comptable](comptable.md).

---

## 6. L'export complet

**Pilotage → Rapports et exports → Export complet de l'établissement**

Produit un fichier unique contenant **toutes** les données de l'établissement :
élèves, familles, personnel, notes, bulletins, finances, comptabilité.

C'est la garantie de **réversibilité** : vous pouvez quitter la plateforme
avec vos données dans un format lisible, sans dépendre de l'éditeur.

> ⚠️ **C'est le fichier le plus sensible que l'application sache produire.**
> Il contient l'identité complète des élèves, des familles et du personnel,
> leurs résultats et leur situation financière.
>
> Transmettez-le par un canal chiffré, conservez-le sur un support protégé,
> supprimez-le dès qu'il a servi. Chaque export est inscrit au journal
> d'audit, avec son auteur.

Deux choses **n'y figurent pas**, volontairement :

- Les **mots de passe et jetons de session** — ce sont des secrets
  d'authentification, pas des données de l'école. Les exporter créerait un
  fichier dont la fuite compromettrait des comptes.
- Le **contenu des fichiers téléversés** — seules leurs descriptions y sont.
  Les fichiers se récupèrent par la sauvegarde du stockage, auprès de votre
  prestataire technique.

---

## 7. Votre abonnement

Votre formule détermine le nombre d'établissements et d'élèves autorisés.

> **Une suspension d'abonnement coupe l'accès mais ne supprime jamais les
> données de l'établissement.** Elles restent intactes et redeviennent
> accessibles dès la régularisation. Même une résiliation n'efface rien
> automatiquement : la suppression est une procédure distincte, à déclencher
> explicitement, et il est recommandé de faire l'export complet avant.

Pour une difficulté, ouvrez un **ticket d'assistance** : l'équipe de la
plateforme y répond, et vous recevez une notification.

---

## 8. Exemple : ouvrir un second établissement

> **Vous dirigez le Groupe Scolaire Excellence à Cocody, 312 élèves. Vous
> ouvrez une annexe à Yopougon pour la rentrée.**

**Mars — Créer.** Paramètres → Nouvel établissement. Nom « Groupe Scolaire
Excellence — Yopougon », code `GSE-YOP`, type Collège. Matricule
`{SCHOOL}-{YY}-{SEQ:4}`.

**Avril — Structurer.** Année `2026-2027`, trois trimestres. Un seul cycle,
niveaux 6ᵉ à 3ᵉ, 8 classes de 35. Vous reprenez les matières et coefficients
de Cocody.

**Mai — Les finances.** Caisse espèces, compte bancaire, compte Mobile Money.
Plan SYSCOHADA par défaut. Frais : inscription 50 000, scolarité 240 000 en
trois tranches.

**Juin — L'équipe.** Compte du directeur (rôle Directeur), de la comptable
(rôle Comptable), de 12 enseignants. Vous remettez les mots de passe
provisoires en main propre.

> Votre comptable de Cocody doit aussi suivre Yopougon : créez-lui un **second
> rattachement** sur le nouvel établissement. Elle basculera par le sélecteur
> du haut. Son compte est unique, ses deux rôles indépendants.

**Juillet — Les élèves.** Import CSV de 180 préinscrits. L'aperçu signale
4 doublons : deux familles ont déposé deux fois. Vous nettoyez, vous importez.

**Septembre — Piloter.** Le sélecteur vous donne Cocody ou Yopougon. Pour la
vue consolidée, exportez les deux et rapprochez-les dans votre tableur : il
n'y a pas d'écran multi-établissements.

---

## 9. Erreurs fréquentes

**« Je ne trouve pas un élève. »**
Vérifiez l'établissement sélectionné en haut. C'est la cause la plus
fréquente.

**« Les chiffres du tableau de bord ne collent pas avec ma banque. »**
Deux causes possibles : des justificatifs en attente, qui ne sont pas des
recettes ; ou des opérations bancaires non rapprochées. Passez par le
rapprochement bancaire.

**« J'ai créé un établissement de trop. »**
Il n'y a pas de suppression en un clic, volontairement : un établissement
contient des dossiers d'élèves. Contactez l'assistance.

**« Le bouton Nouvel établissement refuse la création. »**
Votre formule a atteint sa limite d'établissements. Le message vous l'indique.
Changez de formule avant de réessayer.

**« Mon directeur ne peut pas enregistrer un paiement. »**
C'est le fonctionnement prévu : le rôle Directeur ne crée pas
d'encaissement. Si vous le souhaitez malgré tout, ajoutez-lui la permission
individuellement — en mesurant que vous réduisez le contrôle croisé.

---

## 10. Limites à connaître

- **Pas de vue consolidée multi-établissements.** On travaille établissement
  par établissement ; la consolidation se fait par export.
- **Pas de paiement en ligne, ni d'e-mail, ni de SMS.**
- **Pas de sauvegarde automatique** : à organiser avec votre prestataire.
- **Pas de chiffrement des données au repos** par l'application : à assurer au
  niveau du disque ou de la base.
- **Modules optionnels** : seule la **bibliothèque** est utilisable.
