# Gestion Ecole

Plateforme SaaS multi-etablissements de gestion scolaire, du prescolaire a
l'universite, concue en priorite pour les etablissements prives de Cote
d'Ivoire et extensible a d'autres pays africains.

> **Etat du projet.** Le socle est fonctionnel de bout en bout : authentification,
> isolation multi-tenant, eleves, frais, encaissements, justificatifs,
> comptabilite en partie double, bulletins et espaces parent/eleve.
> Certaines fonctions sont partielles ou non implementees : le detail exhaustif
> figure dans [docs/ETAT-DES-FONCTIONNALITES.md](docs/ETAT-DES-FONCTIONNALITES.md).
> Aucune integration externe (paiement en ligne, SMS, OCR, IA) n'est branchee.

---

## Demarrage rapide

```bash
npm install
cp .env.example .env          # puis ajuster si besoin
npm run setup                 # genere le client Prisma, cree la base et les donnees de demonstration
npm run dev                   # http://localhost:3000
```

Comptes de demonstration (mot de passe commun : `Demo@2026`) :

| Role | Identifiant |
|---|---|
| Super-administrateur SaaS | `superadmin@exemple.test` |
| Proprietaire (2 etablissements) | `proprietaire@exemple.test` |
| Directeur | `directeur@exemple.test` |
| Responsable pedagogique | `pedagogie@exemple.test` |
| Comptable | `comptable@exemple.test` |
| Caissier | `caissier@exemple.test` |
| Enseignant | `enseignant@exemple.test` |
| Parent (2 enfants) | `parent@exemple.test` |

Le second etablissement utilise les memes adresses suffixees `.yop`
(ex. `directeur.yop@exemple.test`). Il sert a verifier concretement que les
donnees ne traversent pas la frontiere entre deux ecoles.

Guide detaille : [docs/INSTALLATION.md](docs/INSTALLATION.md).

---

## Ce que fait l'application

### Multi-tenant et roles
Une **organisation** (le client) regroupe une ou plusieurs **ecoles**. Chaque
ecole est un espace etanche. Un utilisateur peut etre rattache a plusieurs
ecoles, avec un role different dans chacune.

Neuf roles : super-administrateur SaaS, proprietaire, directeur, responsable
pedagogique, comptable, caissier, enseignant, parent, eleve. Les permissions
sont declarees dans [`src/lib/permissions.ts`](src/lib/permissions.ts) et
appliquees **cote serveur** sur chaque page et chaque action.

### Scolarite
Annees scolaires, cycles, niveaux, filieres, classes, matieres et coefficients
configurables. Dossiers eleves complets avec matricule parametrable,
responsables legaux, inscriptions, transferts et archivage. Import CSV/Excel en
deux temps : apercu avec rapport d'erreurs et detection de doublons, puis
validation explicite.

### Finances
Catalogue de frais par annee/niveau/classe/filiere avec echeanciers. Remises,
bourses et exonerations tracees. Encaissements idempotents avec recu PDF
numerote. Depenses avec circuit d'approbation. Comptabilite en partie double
(plan SYSCOHADA adaptable), balance, compte de resultat, bilan et cloture de
periode.

### Le cas central : justificatif ≠ encaissement
Un justificatif depose par une famille est une **declaration**. Il reste au
statut `EN_ATTENTE`, n'entre dans **aucun** total encaisse et ne reduit **aucun**
solde. Seule son acceptation par un comptable cree un encaissement reel, emet
un recu et passe l'ecriture comptable. Cette regle est verifiee par des tests
dedies.

### Pedagogie
Evaluations avec cycle de validation (brouillon → soumise → validee → publiee),
saisie des notes en centiemes de point, moyennes ponderees, classement avec ex
aequo, bulletins PDF figes, journal des corrections apres publication, devoirs
et remises, absences et emploi du temps.

### Espaces parent et eleve
Le parent ne voit **que** les enfants qui lui sont explicitement rattaches, avec
des autorisations distinctes pour les notes et pour la facturation. Il depose
ses justificatifs et telecharge recus et bulletins. L'eleve consulte ses propres
notes publiees, ses devoirs et son emploi du temps, et depose ses travaux.

---

## Architecture

| Couche | Choix | Pourquoi |
|---|---|---|
| Interface | Next.js 15 (App Router), React 19, Tailwind CSS v4 | Rendu serveur, interface responsive, faible charge client |
| Donnees | Prisma + SQLite (dev) / PostgreSQL (production) | Schema unique portable, migrations versionnees |
| Authentification | `node:crypto` (scrypt + sessions serveur) | Aucune dependance native, aucun prestataire externe a simuler |
| PDF | `pdf-lib` | Generation serveur deterministe, sans navigateur |
| Tests | Vitest | Unitaires et integration sur base reelle |

### Decisions structurantes

**Montants en entiers.** Tout montant est un entier en unites mineures de sa
devise (XOF : 1 unite = 1 franc). Aucun calcul financier n'utilise de flottant
binaire. Voir [`src/lib/money.ts`](src/lib/money.ts).

**Notes en centiemes.** 15,25/20 est stocke `1525`. Les divisions sont arrondies
une seule fois, a la production de la moyenne.

**SQLite par defaut.** L'application demarre sans serveur de base a installer.
Le schema evite `enum` et `Decimal` afin de rester identique en PostgreSQL : le
passage en production ne demande qu'un changement de `provider` et d'URL
(voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)).

**Double controle d'acces.** Chaque operation verifie la **permission** puis le
**tenant**. Un identifiant appartenant a une autre ecole produit une page 404 —
jamais un message revelant son existence.

### Organisation du code

```
prisma/schema.prisma          Schema relationnel (60+ modeles) et seed
src/lib/
  money.ts                    Arithmetique monetaire entiere
  permissions.ts              Catalogue et matrice role -> permissions
  auth/                       Mots de passe (scrypt), sessions, garde-fous
  domain/                     Regles metier : comptes eleves, frais, paiements,
                              notes, bulletins, comptabilite, imports
  pdf/                        Recus, bulletins, certificats, listes
src/app/
  (app)/                      Pages authentifiees, une Server Action par module
  api/files/[id]              Service des fichiers prives (verification serveur)
  api/documents/              Generation PDF
  api/export/                 Exports CSV
tests/                        Tests unitaires et d'integration
docs/                         Installation, deploiement, administration, securite
```

---

## Commandes

| Commande | Role |
|---|---|
| `npm run dev` | Serveur de developpement |
| `npm run build` / `npm start` | Build et execution en production |
| `npm run setup` | Client Prisma + base + donnees de demonstration |
| `npm run db:push` | Applique le schema sans migration (developpement) |
| `npm run db:migrate` | Cree une migration versionnee |
| `npm run db:seed` | Recharge les donnees de demonstration |
| `npm run db:studio` | Explorateur de base Prisma |
| `npm test` | Tests unitaires et d'integration |
| `npm run typecheck` | Verification TypeScript |

---

## Tests

```bash
npm test
```

216 tests couvrent les points sensibles exiges par le cahier des charges :
arithmetique monetaire, soldes et echeanciers, idempotence des encaissements,
cycle des justificatifs, annulations et contrepassations, remboursements,
moyennes ponderees et absences, publication verrouillante, import CSV avec
doublons, et **isolation entre etablissements**.

Detail et limites : [docs/TESTS.md](docs/TESTS.md).

---

## Documentation

- [Installation](docs/INSTALLATION.md)
- [Deploiement](docs/DEPLOIEMENT.md)
- [Guide administrateur](docs/GUIDE-ADMINISTRATEUR.md)
- **[Guides d'utilisation par profil](docs/guides/README.md)** — un guide par
  role (directeur, comptable, enseignant, parent, proprietaire, pedagogie,
  caissier, super-administrateur), avec exemples
- [Securite et protection des donnees](docs/SECURITE.md)
- [Integrations externes a configurer](docs/INTEGRATIONS.md)
- [Modele de donnees](docs/MODELE-DE-DONNEES.md)
- [Etat des fonctionnalites](docs/ETAT-DES-FONCTIONNALITES.md)
- [Tests](docs/TESTS.md)

---

## Avertissements

- **Aucune integration externe n'est branchee.** Paiement en ligne, SMS,
  WhatsApp, OCR et IA exposent une interface et un mode de test, mais ne sont
  pas operationnels. Ne les presentez pas comme actifs.
- **La paie n'est pas calculee.** Les elements de remuneration sont indicatifs
  et destines a alimenter un logiciel de paie externe.
- **Les donnees de demonstration sont fictives** et ne doivent jamais etre
  chargees sur une base de production.
