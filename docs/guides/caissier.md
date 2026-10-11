# Guide du caissier

Vous encaissez l'argent des familles et remettez les reçus. C'est le rôle le
plus restreint de l'application, et c'est voulu : moins un poste de caisse a de
pouvoirs, mieux il est protégé en cas de contestation.

Lisez d'abord les [règles communes](README.md), en particulier « un
justificatif n'est pas un paiement ».

---

## 1. Ce que vous pouvez faire

- Rechercher un élève et consulter **son compte** : ce qu'il doit, ce qu'il a
  payé, ce qui reste.
- **Enregistrer un encaissement** et **imprimer le reçu**.
- Consulter la liste des encaissements et les frais de l'établissement.
- Consulter les justificatifs déposés par les familles.
- Lire les annonces, utiliser la messagerie.

## 2. Ce que vous ne pouvez pas faire, et pourquoi

| Vous ne pouvez pas | Qui le fait | Pourquoi |
|---|---|---|
| **Accepter un justificatif** | Comptable | Celui qui encaisse ne valide pas ce qu'il a encaissé. Sinon, un seul agent pourrait créer un faux encaissement de bout en bout. |
| **Annuler un encaissement** | Comptable | Une annulation efface une recette. Elle exige un second regard. |
| **Modifier les frais ou accorder une remise** | Comptable, direction | Vous appliquez le tarif, vous ne le fixez pas. |
| **Voir les dépenses ou la comptabilité** | Comptable, direction | Hors de votre mission. |

Cette séparation vous protège. Si une famille conteste un versement, vous
pouvez montrer que vous n'aviez pas la possibilité de modifier quoi que ce soit
après coup.

---

## 3. Encaisser un règlement, pas à pas

**Finances → Encaissements → Nouvel encaissement**

### Étape 1 — Trouver l'élève

Tapez le **nom**, le **prénom** ou le **matricule**. La recherche ignore la
casse : `kouassi` trouve `KOUASSI`.

> Elle ne gère pas les accents : si la famille s'appelle **KOUAMÉ**, tapez
> `KOUAM` sans l'accent, ou utilisez le matricule.

### Étape 2 — Lire le compte avant d'encaisser

Dès l'élève sélectionné, son compte s'affiche :

| Ligne | Signification |
|---|---|
| **Total dû** | Tous les frais de l'année, remises déduites |
| **Déjà réglé** | Encaissements validés |
| **Justificatifs en attente** | Déposés par la famille, **pas encore acceptés** |
| **Reste à payer** | Ce que la famille doit **aujourd'hui** |

> ⚠️ **Les justificatifs en attente ne réduisent pas le reste à payer.** Si
> une mère dit « j'ai déjà envoyé 50 000 par Mobile Money », son dépôt est
> peut-être là, en attente. Tant que le comptable ne l'a pas accepté, le
> montant reste dû. Dites-le lui calmement et orientez-la vers la comptabilité
> — n'encaissez pas une seconde fois le même montant.

### Étape 3 — Saisir le règlement

| Champ | Ce qu'il faut mettre |
|---|---|
| **Montant** | Le montant **réellement reçu**, en F CFA, sans décimales |
| **Mode de règlement** | Espèces, Virement, Chèque, Mobile Money |
| **Date du règlement** | Aujourd'hui, sauf régularisation d'une date antérieure |
| **Référence externe** | N° de chèque, référence Mobile Money, avis de virement |
| **Caisse / compte créditeur** | Où va l'argent : caisse espèces, banque, compte Mobile Money |
| **Observation** | Facultatif : « acompte 2e tranche », « payé par l'oncle »… |

Validez. Le reçu est produit immédiatement.

### Étape 4 — Remettre le reçu

Cliquez sur **Reçu PDF**, imprimez, faites signer si c'est l'usage chez vous.

---

## 4. Exemple complet

> **Mme KONÉ se présente le 15 janvier pour régler la 2ᵉ tranche de son fils
> Yao, en 5ᵉ B. Elle apporte 75 000 F CFA en espèces.**

1. **Finances → Encaissements → Nouvel encaissement**.
2. Vous tapez `yao` — plusieurs résultats. Vous tapez le matricule
   `GSE-COC-25-0034`, l'élève apparaît.
3. Son compte affiche :
   - Total dû : **250 000 F CFA**
   - Déjà réglé : **100 000 F CFA**
   - Justificatifs en attente : **0**
   - **Reste à payer : 150 000 F CFA**
4. Vous saisissez : montant `75000`, mode `Espèces`, date `15/01/2026`,
   compte `Caisse principale`, observation `2e tranche`.
5. Vous validez. Le reçu **REC-2026-00412** est émis.
6. Vous imprimez et remettez le reçu. Le compte de Yao affiche désormais
   **75 000 F CFA** restants.

### Variante : la famille a déjà payé par Mobile Money

> **M. TRAORÉ vient chercher le bulletin de sa fille. Vous constatez un reste
> de 60 000 F CFA. Il affirme avoir payé hier par Wave.**

Regardez la ligne **Justificatifs en attente** :

- **60 000 F CFA en attente** → son dépôt est bien arrivé mais n'est pas
  validé. **N'encaissez pas.** Dites : « Votre justificatif est bien reçu, la
  comptabilité le vérifie. » Orientez-le vers le comptable.
- **0 en attente** → rien n'est arrivé. Demandez-lui de déposer son
  justificatif depuis son espace parent, ou de présenter sa preuve au
  comptable.

Dans les deux cas, vous n'encaissez rien : le risque de double paiement est
réel, et c'est la famille qui en pâtirait.

---

## 5. Erreurs fréquentes

**« J'ai saisi un mauvais montant. »**
Vous ne pouvez pas annuler. Prévenez immédiatement le comptable, qui passera
une annulation tracée. **N'enregistrez pas un second encaissement négatif** —
ce n'est pas prévu et cela fausserait la caisse.

**« J'ai cliqué deux fois, ai-je encaissé deux fois ? »**
Non. L'application reconnaît une double soumission du même formulaire et
n'enregistre qu'une opération. Vérifiez tout de même la liste des
encaissements : vous devez voir **un seul** reçu.

**« Je ne retrouve pas un élève. »**
Trois causes, dans l'ordre : mauvais établissement sélectionné en haut ; élève
archivé ou non réinscrit cette année ; nom accentué. Essayez le matricule.

**« Le total dû ne correspond pas à ce que dit la famille. »**
Une remise a pu être accordée, ou des frais ajoutés. Le détail est sur la
fiche de l'élève. Ne négociez pas : renvoyez vers la comptabilité.

---

## 6. Bonnes habitudes

- **Renseignez toujours la référence externe** pour un chèque, un virement ou
  un Mobile Money. C'est elle qui permettra de retrouver l'opération au
  rapprochement bancaire.
- **Choisissez le bon compte créditeur.** Encaisser du Mobile Money sur la
  caisse espèces fausse le rapprochement, même si le total reste juste.
- **Ne promettez jamais qu'un justificatif sera accepté.** Vous n'en décidez
  pas.
- **En fin de journée**, filtrez les encaissements sur la date du jour et
  comparez avec votre caisse physique.
