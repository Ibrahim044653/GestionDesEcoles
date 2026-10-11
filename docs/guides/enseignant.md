# Guide de l'enseignant

Vous saisissez les notes, faites l'appel, donnez des devoirs et rédigez les
appréciations de **vos** matières.

Lisez d'abord les [règles communes](README.md).

---

## 1. Votre périmètre

L'application vous limite aux **classes et matières qui vous sont affectées**.
Ce n'est pas qu'un affichage : même en modifiant une adresse, vous ne pouvez
pas saisir une note dans la matière d'un collègue. Le serveur vérifie à chaque
enregistrement.

Si une classe manque dans vos listes, c'est que l'affectation n'a pas été
faite. Voyez le responsable pédagogique.

| Vous pouvez | Vous ne pouvez pas |
|---|---|
| Créer vos évaluations et saisir vos notes | **Valider** vos propres notes |
| Rédiger les appréciations de vos matières | **Publier** les résultats |
| Faire l'appel | Générer les bulletins |
| Donner et corriger des devoirs | Prendre les décisions du conseil de classe |
| Consulter les élèves et l'emploi du temps | Voir les finances |
| Répondre aux demandes de rendez-vous des familles | Traiter les demandes de documents |

> Vous saisissez, un autre valide. Cette séparation protège aussi bien l'élève
> que vous.

---

## 2. Saisir des notes

**Pédagogie → Évaluations et notes**

### Étape 1 — Créer l'évaluation

| Champ | Exemple |
|---|---|
| **Classe** | 5ᵉ B |
| **Matière** | Mathématiques |
| **Intitulé** | Devoir n°2 — Théorème de Thalès |
| **Type** | Devoir, Interrogation, Examen, TP, Oral, Projet |
| **Date** | 14/01/2026 |
| **Barème** | 20 (ou 50, ou 10 — au choix) |
| **Coefficient** | 2 |
| **Session** | Normale ou Rattrapage |

> **Le barème est libre.** Un devoir sur 50 est automatiquement ramené au
> barème de l'établissement pour la moyenne : 35/50 compte comme 14/20. Notez
> comme vous corrigez, l'application convertit.

### Étape 2 — Saisir les notes

La liste de la classe s'affiche. Pour chaque élève :

- la **note**, au format `15` ou `15,25` ;
- **Absent**, si l'élève n'a pas composé ;
- **Absence excusée**, si elle est justifiée ;
- un **commentaire**, facultatif.

Une absence **excusée** est exclue du calcul : elle ne pénalise pas l'élève.
Une absence **non excusée** compte zéro ou est exclue selon le réglage de
l'établissement. Une case laissée vide n'est pas un zéro : la note est
simplement considérée comme non saisie.

### Étape 3 — Soumettre

Votre évaluation passe de **Brouillon** à **Soumise pour validation**. Le
responsable pédagogique ou la direction la **valide**, puis la **publie**.

Les quatre états : **Brouillon → Soumise → Validée → Publiée**.

> Tant qu'une évaluation est en brouillon, elle **ne compte dans aucune
> moyenne**. C'est votre espace de travail : vous pouvez corriger librement.

### Après publication

La période est **verrouillée**. Pour corriger une note publiée, il faut une
**révision avec motif obligatoire**, conservée à l'historique. La note
précédente, la nouvelle, l'auteur et la raison restent consultables.

C'est contraignant, et c'est le but : une note qui change après remise d'un
bulletin doit pouvoir s'expliquer.

---

## 3. Faire l'appel

**Pédagogie → Absences**

Choisissez la classe, la date et, si besoin, l'heure de cours. Pour chaque
élève : **Présent**, **Absent**, **Retard**, **Excusé**.

Faites l'appel **le jour même**. Les absences alimentent le suivi de la
direction et peuvent être signalées aux familles.

---

## 4. Les devoirs

**Pédagogie → Devoirs**

1. **Créez le devoir** : intitulé, consigne, classe, matière, date limite.
2. **Joignez un fichier** si nécessaire — énoncé en PDF, photo d'exercice.
3. Les élèves déposent leur travail depuis leur espace.
4. **Corrigez** : note et commentaire.

**Le corrigé** ne peut être publié **qu'après la date limite**. L'application
refuse avant — publier un corrigé pendant que les élèves composent n'aurait
aucun sens.

L'application repère seule les remises **en retard**, en comparant à la date
limite avec **son horloge**, pas celle de l'élève.

---

## 4 bis. Les demandes de rendez-vous

**Communication → Demandes des familles**

Les familles peuvent solliciter un rendez-vous. Vous pouvez y répondre :
**Confirmer** avec une date, **Décliner** avec un motif — le motif est
obligatoire et transmis à la famille — ou **Marquer effectué** après
l'entretien.

Vous ne traitez **pas** les demandes de documents (certificats, bulletins) :
elles relèvent du secrétariat et de la direction.

---

## 5. Les appréciations par matière

**Pédagogie → Appréciations**

Choisissez classe, matière et période. Rédigez pour chaque élève. Enregistrez
tout d'un coup.

Vous ne pouvez écrire que sur **vos** matières.

> **Une appréciation vide est supprimée** : le bulletin n'affichera pas de
> ligne vide. Pour retirer une appréciation, effacez le texte et enregistrez.

L'appréciation est **figée dans le bulletin à sa génération**. Si vous la
modifiez après, le bulletin déjà produit ne change pas — il faut le regénérer.
Rédigez donc avant la génération.

> **Exemple** — « Yao progresse régulièrement. La géométrie reste fragile :
> un travail sur les démonstrations serait profitable au 3ᵉ trimestre. »
>
> Évitez « Peut mieux faire » : ce bulletin est lu par une famille, souvent
> conservé des années.

---

## 6. Exemple complet : du devoir au bulletin

> **Vous enseignez les mathématiques en 5ᵉ B. Trimestre 2.**

**Lundi 12 janvier.** Vous créez l'évaluation « Devoir n°2 — Thalès »,
type Devoir, barème 50, coefficient 2, date du 14.

**Mercredi 14.** Les élèves composent. Vous faites l'appel : 2 absents, dont
un avec justificatif → **Absent** pour l'un, **Absent + Excusé** pour l'autre.

**Vendredi 16.** Vous saisissez : Yao 38/50, Awa 45/50, Koffi 22/50…
L'élève excusé reste **Absent excusé** : sa moyenne n'en souffrira pas.
Vous **soumettez**.

**Lundi 19.** Le responsable pédagogique **valide**. Les notes entrent dans
les moyennes du trimestre.

**Vendredi 30.** Avant le conseil, **Pédagogie → Appréciations** →
Mathématiques → 5ᵉ B → Trimestre 2. Vous rédigez pour vos 32 élèves et
enregistrez.

**Lundi 2 février.** La direction génère les bulletins : votre appréciation
et la moyenne de Yao (38/50 → **15,20/20**, coefficient 2) y figurent, figées.

---

## 7. Erreurs fréquentes

**« Mes notes n'apparaissent pas dans la moyenne. »**
L'évaluation est encore en **Brouillon**. Soumettez-la.

**« Je ne peux plus modifier une note. »**
La période est publiée. Demandez une révision avec motif.

**« Ma classe n'apparaît pas. »**
Vous n'y êtes pas affecté pour cette matière. Voyez le responsable
pédagogique.

**« J'ai mis 45 au lieu de 4,5. »**
Si le barème est 20, l'application refuse : une note ne peut dépasser le
barème. Si le barème est 50, elle accepte — relisez avant de soumettre.

**« Je ne peux pas publier le corrigé. »**
La date limite n'est pas passée.

---

## 8. Limites à connaître

- Vous ne pouvez pas **générer de bulletin** ni **prendre une décision de
  passage** : c'est le conseil de classe.
- Les **moyennes affichées en cours de trimestre** sont indicatives : elles
  bougent à chaque nouvelle note. Seul le bulletin généré fait foi.
- Pas de **cahier de textes** ni de **bibliothèque de ressources
  pédagogiques** : seules les pièces jointes aux devoirs existent.
- La recherche d'élève ignore la casse mais **pas les accents**.
