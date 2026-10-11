# Guide du responsable pédagogique

Vous pilotez la vie scolaire : organisation des classes et des matières,
validation et publication des notes, bulletins, conseils de classe.

Vous n'avez **aucun accès aux finances**. C'est voulu : votre métier est
pédagogique.

Lisez d'abord les [règles communes](README.md).

---

## 1. Vos écrans

| Écran | Ce que vous y faites |
|---|---|
| **Tableau de bord** | Effectifs, moyennes, absences |
| **Élèves**, **Classes**, **Personnel** | Consultation. Vous gérez les **inscriptions** et les décisions de fin d'année, mais la **création** d'une fiche élève revient au directeur |
| **Évaluations et notes** | Valider et publier |
| **Appréciations** | Appréciations par matière |
| **Bulletins** | Générer les bulletins d'une classe |
| **Conseil de classe** | Délibérer, décider, éditer le PV |
| **Devoirs**, **Absences**, **Emploi du temps** | Suivi pédagogique |
| **Paramètres → Pédagogie** | Barème, règle d'absence, moyenne de passage, rattrapage |
| **Annonces**, **Messages**, **Demandes des familles** | Communication |

---

## 2. Préparer l'année

**Paramètres → Pédagogie**

| Réglage | Effet |
|---|---|
| **Barème de référence** | 20 par défaut. Toutes les notes y sont ramenées. |
| **Traitement des absences non excusées** | Exclure du calcul, ou compter zéro |
| **Absence excusée toujours exclue** | Recommandé : une absence justifiée ne pénalise pas |
| **Classement sur les bulletins** | Activable ou non, selon votre règlement |
| **Moyenne de passage** | 10,00 par défaut |
| **Session de rattrapage** | Meilleure des deux, remplacement systématique, ou ignorer |
| **Plafond de rattrapage** | Facultatif |

> **Le plafond de rattrapage** limite la note de seconde session — par exemple
> à la moyenne de passage. Il **ne ramène jamais** un élève **sous** sa note de
> session normale : un élève à 12 qui repasse ne peut pas y perdre.

Créez ensuite **années scolaires**, **périodes** (trimestres ou semestres),
**cycles**, **niveaux**, **classes**, **filières**, **matières** et
**coefficients**. Affectez les enseignants aux couples classe/matière : c'est
cette affectation qui ouvre leurs écrans de saisie.

---

## 3. Le cycle d'une note

```
Enseignant                    Vous
──────────                    ────
Brouillon  ──soumet──>  Soumise  ──valide──>  Validée  ──publie──>  Publiée
                                                  │                     │
                                      compte dans          visible des familles
                                      les moyennes         + période verrouillée
```

**Pédagogie → Évaluations et notes**

- **Valider** : les notes entrent dans les moyennes. Rien n'est encore visible
  des familles.
- **Publier** : les résultats deviennent visibles, les parents sont notifiés,
  **la période est verrouillée**.

Après publication, une correction passe par une **révision avec motif
obligatoire**, conservée à l'historique.

> **Avant de publier**, vérifiez que toutes les évaluations de la période sont
> validées. Publier avec un devoir encore en brouillon fausse les moyennes
> communiquées — et une moyenne corrigée après coup se remarque.

---

## 4. Générer les bulletins

**Pédagogie → Bulletins** → classe + période → **Générer**.

Ce que contient un bulletin : moyenne par matière avec coefficient, moyenne
générale, rang et effectif (si le classement est activé), moyenne de classe,
appréciation par matière, appréciation générale, décision.

> **Le bulletin est figé.** Modifier une note après génération ne le change
> pas : il faut le **regénérer**. Un bulletin remis à une famille ne doit pas
> se réécrire tout seul.

**Ordre recommandé :**

1. Toutes les évaluations validées
2. Appréciations par matière saisies par les enseignants
3. **Générer les bulletins**
4. Tenir le conseil de classe
5. Éditer le PV

---

## 5. Le conseil de classe

**Pédagogie → Conseil de classe** → classe + période.

L'écran affiche les moyennes **issues des bulletins déjà générés** : le
conseil délibère sur des valeurs **figées**, pas sur un calcul qui bougerait
pendant la séance. Si des bulletins manquent, l'écran le signale.

### Dérouler la séance

1. **« Proposer selon la moyenne de passage »** pré-remplit les décisions.
   C'est une **aide à la saisie, pas une décision** : le conseil modifie
   librement chaque ligne.
2. Ajustez : **Admis**, **Redouble**, **Orienté**, **Exclu**, **En attente**.
3. Ajoutez une observation par élève si nécessaire.
4. **Enregistrer les décisions** — tout part en une seule fois. Un conseil
   interrompu à mi-parcours ne laisse pas la moitié des élèves sans décision.
5. **Procès-verbal PDF** : liste complète, synthèse par décision, espaces de
   signature.

> Le PV **signale explicitement** les élèves sans bulletin ou sans décision.
> Un procès-verbal incomplet doit se voir, pas se dissimuler.

Une **année clôturée** refuse toute modification de décision.

> **Exemple** — 5ᵉ B, 32 élèves, fin d'année. Vous générez les bulletins,
> l'écran annonce 32/32 et 27 élèves au-dessus de 10. Vous cliquez
> « Proposer » : 27 Admis, 5 Redouble. Le conseil discute : un élève à 9,70
> avec une progression nette passe en **Admis** avec l'observation « Progrès
> constants au 3ᵉ trimestre, admis par décision du conseil ». Un autre à 10,20
> mais absentéiste passe en **Orienté**. Vous enregistrez : 28 admis,
> 3 redoublent, 1 orienté. Vous éditez le PV et le faites signer.

---

## 6. Les appréciations

**Pédagogie → Appréciations** : vous pouvez saisir pour **toutes** les
matières, contrairement aux enseignants limités aux leurs. Utile pour une
matière dont l'enseignant est absent.

L'appréciation **générale** se saisit depuis le conseil de classe.

> Elles sont **figées dans le bulletin à sa génération**. Rédigez avant.

---

## 7. Les rattrapages

Créez l'évaluation avec **Session = Rattrapage**. L'application applique la
règle de l'établissement :

- **Meilleure des deux** : le rattrapage ne remplace que s'il est meilleur.
- **Remplacement systématique** : il remplace toujours, même à la baisse.
- **Ignorer** : il n'entre pas dans le calcul.

La substitution porte sur la **moyenne de la matière**, pas sur une note
isolée : un rattrapage est une seconde chance sur l'ensemble de la matière.

Sur le bulletin, les matières rattrapées portent un **astérisque**, avec la
moyenne de session normale rappelée en bas de page. La famille voit ce qui
s'est passé.

> **Un rattrapage non noté — élève absent, saisie non faite — n'efface jamais
> la session normale.**

---

## 8. Erreurs fréquentes

**« Les moyennes semblent fausses. »**
Des évaluations sont encore en brouillon, ou les coefficients de matière ne
sont pas ceux attendus. Vérifiez les deux avant de conclure.

**« Un enseignant ne peut pas saisir ses notes. »**
Il n'est pas affecté au couple classe/matière. Corrigez l'affectation.

**« J'ai publié trop tôt. »**
La période est verrouillée. Les corrections passent par des révisions tracées.
Mieux vaut vérifier avant de publier que corriger après.

**« Le bulletin ne reflète pas la dernière note. »**
Il est figé. Regénérez-le.

**« Je ne peux pas enregistrer les décisions du conseil. »**
L'année est clôturée, ou aucune décision n'a été modifiée.

---

## 9. Limites à connaître

- **Pas de compensation automatique entre unités d'enseignement** à
  l'université : cette règle varie trop d'un établissement à l'autre.
- **Pas de gestion des stages, mémoires, soutenances, jurys ni diplomation.**
- **Pas de cahier de textes** ni de bibliothèque de ressources pédagogiques.
- Les **moyennes affichées hors bulletin** sont indicatives. Seul le bulletin
  généré fait foi.
