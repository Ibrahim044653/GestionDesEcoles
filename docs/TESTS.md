# Tests

```bash
npm test              # tout
npm run test:watch    # en continu
npx vitest run tests/payments.integration.test.ts
```

**216 tests, 7 fichiers.** Les tests d'integration creent une base SQLite
jetable (`prisma/test-integration.db`), creee et supprimee automatiquement. La
base de developpement n'est **jamais** touchee : `tests/global-setup.ts`
positionne `DATABASE_URL` avant le chargement du moindre module applicatif.

---

## Ce qui est couvert

### `money.test.ts` — 34 tests
L'exigence « aucun flottant binaire » (section 20).

- Rejet des montants non entiers, de `NaN`, de l'infini
- Pourcentages en centiemes de pourcent, arrondi symetrique sur les negatifs
- **Repartition sans perte** : la somme des parts egale toujours le total,
  y compris sur un reste important (`1 000 001` en 7 parts)
- Imputation sur echeances, calcul du trop-percu
- Analyse des saisies : `12,50` / `12.50` / `300 000`, rejet des decimales
  incompatibles avec la devise (XOF n'en accepte aucune)

### `grades.test.ts` — 38 tests
Moyennes et absences (section 6).

- Ponderation par coefficient d'evaluation puis de matiere
- Conversion entre baremes heterogenes (35/50 → 14,00/20)
- **Une matiere sans note vaut `null`, jamais zero** — un eleve n'est pas
  penalise parce qu'une matiere n'a pas encore ete evaluee
- Les quatre combinaisons de traitement des absences
- Classement avec ex aequo (1, 2, 2, 4)
- Credits LMD valides au seuil

### `permissions.test.ts` — 33 tests
La separation des responsabilites (sections 2 et 17).

- Le caissier encaisse mais **ne valide pas** un justificatif, ne voit ni
  comptabilite ni depenses, n'accorde pas de remise
- L'enseignant saisit des notes mais **ne publie pas**, et ne voit aucune
  donnee financiere
- Le parent n'accede **qu'aux** permissions `_own`, jamais aux listes globales
- Le super-administrateur **n'herite d'aucun** droit sur les donnees d'une ecole
- Coherence du catalogue : aucune permission referencee sans exister

### `accounting.test.ts` — 29 tests
Partie double et echeanciers (sections 8 et 10).

- Rejet des ecritures desequilibrees, a une seule ligne, a montant negatif,
  portant debit et credit sur la meme ligne, ou a montant nul
- Coherence du plan SYSCOHADA (classe 6 = charges, 7 = produits, 5 = tresorerie)
- Tous les comptes utilises par le code existent au plan par defaut
- Echeanciers : la somme des tranches egale **exactement** le montant du frais

### `student-account.test.ts` — 19 tests
Le coeur financier (sections 8 et 9).

- Remises plafonnees au montant brut : **jamais de dette negative**
- **Un justificatif en attente n'entre ni dans les encaissements ni dans le
  solde** — l'exigence centrale du cahier des charges
- Un justificatif rejete n'a aucun effet
- Pas de double comptage apres acceptation
- Paiements annules et frais annules ignores
- Trop-percu isole, solde jamais negatif
- Echeances depassees detectees, penalites prises en compte

### `payments.integration.test.ts` — 36 tests
Le parcours financier complet, sur base reelle.

- Le chiffre d'affaires est constate **a l'emission** du frais (411 / 701)
- Imputation automatique sur l'echeance la plus ancienne
- Recus numerotes sequentiellement, instantane fige
- **Idempotence** : deux appels avec la meme cle ne creent qu'un encaissement,
  le solde n'est reduit qu'une fois, le blocage est trace
- Trop-percu comptabilise en avance recue (419)
- Cycle complet du justificatif : depot sans effet → acceptation → encaissement,
  recu et ecriture ; montant confirme pouvant differer du declare ; rejet motive
- Annulation : le paiement est **conserve**, l'ecriture contrepassee, la
  tresorerie revient a zero
- Remboursement : la tresorerie ne bouge **qu'au versement effectif**
- **Isolation** : encaisser, imputer, annuler ou lire un compte depuis une autre
  ecole est refuse

### `academics.integration.test.ts` — 27 tests
Pedagogie et imports (sections 3 et 6).

- Moyenne generale ponderee, evaluations en brouillon ignorees
- Bulletins figes : modifier une note apres generation ne change pas le bulletin
- Publication : verrouille la periode, notifie les parents, refuse un second appel
- Correction tracee avec motif obligatoire
- Import : champs manquants, dates illisibles, classes inconnues, doublons en
  base et doublons internes au fichier, separateur virgule, accents, fichier vide
- Fratrie rattachee au **meme** responsable
- Inscription et frais appliques automatiquement quand la classe est fournie

---

## Deux bugs reels trouves par ces tests

Signales ici car ils illustrent ce que les tests ont reellement apporte.

**1. Balance faussee apres contrepassation.**
`computeTrialBalance` ne retenait que les ecritures `POSTED`. Une ecriture
contrepassee passant a `REVERSED` sortait de la balance, mais sa contrepartie
`POSTED` y restait : le solde de tresorerie devenait **negatif du montant
annule**. Corrige — les deux ecritures restent au grand livre et s'annulent,
ce qui est le comportement comptable attendu.

**2. Dates invalides silencieusement acceptees a l'import.**
`new Date(Date.UTC(2014, 12, 32))` ne leve pas : JavaScript reporte le
depassement. Une date `32/13/2014` devenait `01/02/2015` sans alerte. Corrige
par une verification d'aller-retour sur les composants.

---

## Ce qui n'est pas teste automatiquement

| Element | Raison | Compensation |
|---|---|---|
| Parcours navigateur (clics, formulaires) | Aucun outil de test navigateur disponible dans l'environnement | Parcours de fumee manuel : **35 pages × 8 roles**, 0 erreur serveur |
| Server Actions via HTTP | Le protocole RSC n'est pas pilotable simplement en ligne de commande | La logique metier qu'elles appellent est testee directement |
| Rendu visuel des PDF | Pas de comparaison d'images | Les 6 types de documents ont ete generes et ouverts manuellement |
| Montee en charge | Hors perimetre | Index declares au schema |
| Integrations externes | Aucune n'est branchee | Les fabriques levent une erreur explicite |

### Le parcours de fumee

Un script local (`smoke.mjs` + `mint-session.mjs`, non inclus dans
l'application) appelle chaque page avec une session de chaque role et
verifie l'absence d'erreur serveur ainsi que la coherence des refus :

```
superadmin     accessibles=5    refusees=30   erreurs=0
proprietaire   accessibles=33   refusees=2    erreurs=0
directeur      accessibles=31   refusees=4    erreurs=0
pedagogie      accessibles=21   refusees=14   erreurs=0
comptable      accessibles=20   refusees=15   erreurs=0
caissier       accessibles=15   refusees=20   erreurs=0
enseignant     accessibles=15   refusees=20   erreurs=0
parent         accessibles=9    refusees=26   erreurs=0
```

Les « refusees » sont le comportement **attendu** : une redirection vers
l'ecran d'explication quand le role n'a pas le droit d'ouvrir la page. Ces
chiffres constituent aussi une verification de la matrice de permissions.

---

## Ajouter un test

Test unitaire — aucune base requise :

```ts
import { describe, expect, it } from "vitest";
import { maFonction } from "@/lib/domain/mon-module";

describe("maFonction", () => {
  it("decrit le comportement attendu", () => {
    expect(maFonction(entree)).toBe(sortie);
  });
});
```

Test d'integration — nommer le fichier `*.integration.test.ts` :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase, seedTwoSchools } from "./helpers/db";

let fixtures: Awaited<ReturnType<typeof seedTwoSchools>>;

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedTwoSchools();
});
```

`seedTwoSchools()` cree **deux** etablissements : ajoutez systematiquement un
cas verifiant qu'une operation lancee depuis l'ecole B sur une ressource de
l'ecole A est refusee.
