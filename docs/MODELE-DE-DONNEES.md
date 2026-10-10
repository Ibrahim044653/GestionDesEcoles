# Modele de donnees

Source de verite : [`prisma/schema.prisma`](../prisma/schema.prisma) — 69 modeles.

---

## Conventions

| Regle | Pourquoi |
|---|---|
| **Pas d'`enum`** | Portabilite SQLite ↔ PostgreSQL. Les statuts sont des `String` valides par `src/lib/constants.ts` et par Zod cote serveur |
| **Pas de `Decimal`** | Meme raison, et surtout : tout montant est un **entier en unites mineures** (suffixe `Minor`) |
| **Notes en centiemes** | `scoreCenti` : 15,25/20 → `1525` |
| **Pourcentages en centiemes de pourcent** | `percentCenti` : 10,00 % → `1000` |
| **`schoolId` presque partout** | Cle d'isolation. Chaque requete la porte |
| **Pas de suppression physique** | Statuts, `archivedAt`, `deletedAt`, contrepassations |

---

## Les huit domaines

### 1. Tenant et abonnement

```
Organization ──< School
     │
     ├──< Subscription ──> Plan
     ├──< SaasInvoice
     └──< SupportTicket
```

`Organization` est le **client** ; `School` l'etablissement. Une organisation
peut en compter plusieurs.

> `SaasInvoice` (ce que l'editeur facture a l'ecole) est **strictement
> distincte** de `FeeAssignment` (ce que l'ecole facture aux familles). Deux
> modeles, deux ecrans, aucune confusion possible.

### 2. Utilisateurs et droits

```
User ──< Membership >── School
          │
          └──> Role ──< RolePermission >── Permission

User ──< Session
```

Un `Membership` = un utilisateur + une ecole + un role. Un utilisateur present
dans trois ecoles a trois memberships, avec des roles potentiellement
differents.

`Membership.overrides` (JSON `{grant, revoke}`) permet d'ajuster finement les
droits ; le moteur est teste, l'ecran d'edition reste a faire.

`Session` porte `tokenHash` (HMAC-SHA256 poivre), `expiresAt` et `revokedAt` :
une session se revoque immediatement cote serveur.

### 3. Structure academique

```
School ──< AcademicYear ──< GradingPeriod
       ├──< Cycle ──< Level ──< ClassRoom >── Track
       ├──< Subject ──> TeachingUnit        (universite : EC → UE)
       └──< ClassSubject (ClassRoom × Subject, coefficient, enseignant)
```

`ClassSubject` est la table pivot **centrale** : elle porte le coefficient reel,
le bareme et l'enseignant, et **determine le perimetre d'un enseignant**.

### 4. Personnes

```
School ──< Student ──< StudentGuardian >── Guardian
       ├──< Staff
       └──< Enrollment (Student × AcademicYear × ClassRoom)
```

`StudentGuardian` porte les **autorisations par enfant** : `canViewGrades`,
`canViewFinance`, `canPickUp`. C'est ce qui permet a un parent de voir les notes
d'un enfant sans voir celles d'un autre.

`Enrollment` est unique par `(studentId, academicYearId)` : un eleve ne peut
etre inscrit deux fois la meme annee.

### 5. Pedagogie

```
Evaluation ──< Grade ──< GradeRevision
    │
    └──> GradingPeriod, ClassRoom, Subject, Staff

Assignment ──< Submission
Attendance, TimetableSlot, ReportCard
```

`Grade` est unique par `(evaluationId, studentId)`.

`GradeRevision` conserve ancienne et nouvelle valeur, le motif et l'auteur :
c'est le journal des corrections exige apres publication.

`ReportCard.detail` fige le detail par matiere en JSON au moment de la
generation : un changement ulterieur de coefficient ne reecrit pas l'historique.

### 6. Frais et paiements

```
FeeItem (catalogue)
   └──> FeeAssignment (du par UN eleve)
            ├──< Discount
            ├──< Installment
            └──< PaymentAllocation >── Payment ──> Receipt
                                          │
                                          └──> PaymentProof
```

**Le point le plus important du modele :**

| Modele | Nature | Effet sur le solde |
|---|---|---|
| `PaymentProof` statut `EN_ATTENTE` | **Declaration** d'une famille | **Aucun** |
| `PaymentProof` statut `ACCEPTE` | Declaration validee | Via le `Payment` cree |
| `Payment` statut `VALIDATED` | **Encaissement reel** | Reduit le solde |
| `Payment` statut `CANCELLED` | Annule | Aucun, ecriture contrepassee |

`Payment` porte deux contraintes d'unicite par ecole : `reference` et
`idempotencyKey`. **C'est la seconde qui rend le double encaissement
impossible**, meme sur rejeu reseau.

### 7. Depenses et comptabilite

```
Expense ──> ExpenseCategory ──> (code du plan comptable)
        └──> Supplier, FinancialAccount

LedgerAccount ──< JournalLine >── JournalEntry ──> AccountingPeriod
                                       │
                                       └──> JournalEntry (contrepassation)
```

`JournalEntry.reversalOfId` lie une contrepassation a son originale. L'originale
passe a `REVERSED` mais **reste au grand livre** : les deux s'annulent, et
l'historique est intact.

`JournalLine` : `debitMinor` **ou** `creditMinor`, jamais les deux.

### 8. Transverse

`Document` (fichiers prives), `Notification`, `Announcement`, `MessageThread`/
`Message`, `AuditEvent`, `ImportBatch`, `RateLimitBucket`.

`Document` n'expose jamais de chemin disque : `storageKey` est un UUID resolu
uniquement par `/api/files/:id`, apres controle.

---

## Contraintes notables

| Contrainte | Effet metier |
|---|---|
| `Student @@unique([schoolId, matricule])` | Matricule unique **par ecole**, pas globalement |
| `Payment @@unique([schoolId, idempotencyKey])` | Double encaissement impossible |
| `Payment @@unique([schoolId, reference])` | Numerotation sequentielle sans trou exploitable |
| `Receipt @@unique([schoolId, number])` | Numero de recu unique |
| `Enrollment @@unique([studentId, academicYearId])` | Une inscription par annee |
| `Grade @@unique([evaluationId, studentId])` | Une note par eleve et par evaluation |
| `JournalEntry @@unique([schoolId, reference])` | Reference d'ecriture unique |
| `Attendance @@unique([studentId, date, subjectId])` | Un appel par eleve, date et matiere |

> `Attendance` a une contrainte portant sur `subjectId` **nullable**. En SQL,
> deux `NULL` ne sont pas egaux : `upsert` est donc inutilisable pour l'appel de
> journee. Le code resout la ligne explicitement (voir
> `saveAttendanceAction`) — le commentaire sur place rappelle pourquoi.

---

## Suppression, archivage, conservation

| Donnee | Regle |
|---|---|
| Eleve | **Jamais supprime.** Statut `TRANSFERRED` / `DROPPED` / `GRADUATED` / `ARCHIVED` + motif + date |
| Inscription | Cloturee (`endedAt`, `endReason`), jamais effacee |
| Paiement | **Jamais supprime.** Annule + ecriture contrepassee |
| Ecriture comptable | **Jamais supprimee.** Contrepassee, les deux restent au livre |
| Note | Modifiable, mais chaque correction cree une `GradeRevision` |
| Document | Suppression logique (`deletedAt`) + retrait du fichier disque |
| Session | Revoquee (`revokedAt`), purgeable apres expiration |
| Evenement d'audit | Conserve ; definir une politique de purge locale |
| Ecole suspendue | **Aucune donnee supprimee** — exigence de la section 16 |

Les `onDelete: Cascade` existants ne s'appliquent qu'a la suppression d'une
ecole ou d'une organisation, operation volontaire et exceptionnelle.

---

## Passer en PostgreSQL

Un seul changement : `provider = "postgresql"` dans `datasource db`. Le schema
est deja compatible. Voir [DEPLOIEMENT.md](DEPLOIEMENT.md).

Optimisations envisageables apres bascule, **sans changer le code applicatif** :
`citext` pour les e-mails, index partiels sur les statuts, partitionnement de
`AuditEvent` par date sur un gros volume.
