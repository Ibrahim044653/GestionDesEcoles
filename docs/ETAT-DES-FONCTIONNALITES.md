# Etat des fonctionnalites

Inventaire honnete de ce qui fonctionne reellement, de ce qui est partiel et de
ce qui n'est pas implemente. Les numeros renvoient aux sections du cahier des
charges.

**Legende**
- **TERMINE** — implemente, utilisable, et couvert par des tests ou verifie manuellement.
- **PARTIEL** — le socle existe et fonctionne, mais une partie du perimetre manque.
- **NON IMPLEMENTE** — modele de donnees et/ou interface absents.

---

## 2. Produit, utilisateurs et roles

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Creation d'un client (organisation + ecole + proprietaire + abonnement) | TERMINE | Depuis `/admin-saas`. Plan comptable pose a la creation, limite de formule opposable, mot de passe provisoire affiche une seule fois, compte existant reutilise sans ecrasement. 13 tests |
| Ajout d'un etablissement par le proprietaire | TERMINE | Depuis `/parametres`. L'organisation est deduite de l'etablissement actif, jamais prise dans le formulaire |
| Multi-tenant (organisation → ecoles) | TERMINE | Isolation verifiee par tests d'integration dedies |
| Proprietaire gerant plusieurs ecoles | TERMINE | Selecteur d'etablissement dans la barre superieure |
| 9 roles avec permissions strictes | TERMINE | Matrice dans `src/lib/permissions.ts`, 33 tests |
| Affectation multi-etablissements | TERMINE | Un role par ecole et par utilisateur |
| Permissions fines par membership | TERMINE | Editeur par rattachement (`/parametres/utilisateurs/[membershipId]`), ecarts au role signales, `saas.admin` non accordable, auto-modification refusee |
| Types d'etablissement (prescolaire → universite) | TERMINE | Influence la terminologie (trimestre/semestre, credits) |

## 3. Creation et configuration d'une ecole

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Identite, contacts, devise, locale | TERMINE | |
| Cycles, niveaux, classes, matieres, coefficients | TERMINE | |
| Filieres | TERMINE | Creation depuis `/parametres/classes` |
| Periodes d'evaluation | TERMINE | Trimestres, semestres, modules |
| Regle de matricule parametrable | TERMINE | Jetons `{SCHOOL}`, `{YEAR}`, `{YY}`, `{SEQ:n}` |
| Frais et moyens de paiement | TERMINE | |
| Import CSV avec apercu, erreurs, doublons | TERMINE | 13 tests d'integration |
| Import Excel (.xlsx) natif | NON IMPLEMENTE | Exporter en CSV depuis Excel ; le format CSV est pleinement gere (separateurs, accents, Windows-1252) |
| Logo de l'etablissement | TERMINE | Televersement depuis `/parametres`, repris sur les documents PDF |

## 4. Eleves et etudiants

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Dossier complet, matricule unique | TERMINE | |
| Responsables legaux et autorisations | TERMINE | Droits distincts notes / facturation |
| Inscriptions, reinscriptions, transferts de classe | TERMINE | Controle de capacite |
| Statuts (transfere, abandon, diplome, archive) | TERMINE | Aucune suppression, historique conserve |
| Places disponibles | TERMINE | Affichage et blocage a la capacite |
| Certificats, cartes, listes de classe, releves (PDF) | TERMINE | |
| Photo de l'eleve | TERMINE | Televersement depuis la fiche eleve, incrustee sur la carte scolaire |
| Historique scolaire inter-etablissements | NON IMPLEMENTE | L'historique est propre a chaque ecole |

## 5. Enseignants et personnel

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Profils, qualifications, contrats | TERMINE | |
| Affectation classes/matieres | TERMINE | Borne les droits de l'enseignant |
| Creation et suspension des acces | TERMINE | Suspendre ferme les sessions en cours |
| Export vers logiciel de paie | TERMINE | CSV ; **aucun calcul de paie legale** (choix assume) |
| Presences, retards, conges du personnel | TERMINE | `/personnel/presences` : feuille quotidienne, retards en minutes, demandes de conge et approbation (l'approbation marque les journees, sans ecraser un fait deja constate). **Aucune retenue sur salaire n'est calculee** |
| Emploi du temps enseignant | TERMINE | Vue « mes cours » |

## 6. Gestion pedagogique

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Evaluations, baremes, coefficients | TERMINE | |
| Saisie et validation des notes | TERMINE | Cycle brouillon → soumise → validee → publiee |
| Moyennes ponderees et generales | TERMINE | 37 tests unitaires |
| Gestion des absences aux evaluations | TERMINE | Regle configurable (exclure / compter zero) |
| Classement avec ex aequo | TERMINE | Desactivable par etablissement |
| Bulletins PDF figes | TERMINE | |
| Verrouillage a la publication | TERMINE | |
| Journal des corrections | TERMINE | Motif obligatoire, tracabilite complete |
| Appreciations | TERMINE | Appreciation generale (conseil de classe) et **par matiere** (`/pedagogie/appreciations`, saisie par l'enseignant de la matiere, figee dans le bulletin a la generation) |
| Decisions de passage / redoublement | TERMINE | `/pedagogie/conseil` : deliberation par classe, proposition selon la moyenne de passage (modifiable), enregistrement en une seule transaction, annee cloturee refusee |
| Universite : UE, EC, credits, semestres | TERMINE | Gestion des UE depuis `/parametres/matieres`, credits calcules (`computeEarnedCredits`) |
| Rattrapages | TERMINE | Substitution parametrable (meilleure session / remplacement / ignore), plafond facultatif qui ne degrade jamais la session normale, les deux sessions restent lisibles sur le bulletin. 9 tests |
| Stages, memoires, soutenances, jurys, diplomation | NON IMPLEMENTE | |
| Proces-verbaux PDF | TERMINE | PV de deliberation (`/api/documents/proces-verbal/...`), synthese par decision, reserve explicite si des bulletins ou des decisions manquent |

## 7. Devoirs et ressources

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Publication de devoirs | TERMINE | |
| Statuts a faire / remis / en retard / corrige | TERMINE | Retard determine par l'horloge **serveur** |
| Depot des travaux par l'eleve | TERMINE | Saisie texte |
| Notation et commentaires | TERMINE | |
| Pieces jointes aux devoirs et aux remises | TERMINE | Televersement cote enseignant et cote eleve |
| Corrige publie ulterieurement | TERMINE | Publication refusee avant la date limite |
| Supports pedagogiques, bibliotheque de ressources | NON IMPLEMENTE | |

## 8-9. Frais, comptes eleves, paiements

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Catalogue de frais cible (annee/niveau/classe/filiere) | TERMINE | |
| Echeanciers, paiement fractionne | TERMINE | Repartition sans perte d'unite |
| Bourses, exonerations, remises | TERMINE | Plafonnees au montant du, tracees |
| Compte eleve (du / remises / paye / en attente / trop-percu / solde) | TERMINE | 24 tests |
| Encaissements multi-modes | TERMINE | Especes, virement, cheque, Mobile Money |
| **Idempotence des encaissements** | TERMINE | Cle par formulaire, double soumission bloquee et tracee |
| Recus PDF numerotes | TERMINE | Instantane fige pour reimpression a l'identique |
| **Justificatif = declaration, pas encaissement** | TERMINE | Exigence centrale, verifiee par tests |
| Acceptation / rejet motive par le comptable | TERMINE | Montant confirme pouvant differer du declare |
| Televersement du justificatif par le parent | TERMINE | Type reel verifie par signature binaire |
| Paiements partiels, trop-percus, remboursements | TERMINE | |
| Annulation avec contrepassation | TERMINE | Aucune suppression |
| Rapprochement bancaire | TERMINE | `/finance/rapprochement` : solde comptable reconstitue (ouverture + encaissements valides − depenses payees), ecart fige, **cloture impossible sans explication quand l'ecart n'est pas nul**. Aucune ecriture correctrice automatique |
| Remise fratrie automatique | TERMINE | Paliers parametrables, apercu avant application, declenchement explicite et trace ; une remise fratrie deja accordee n'est jamais ecrasee |
| Penalites de retard | TERMINE | Modes fixe / pourcentage / pourcentage par jour, jours de tolerance, plafond ; calcul sur le **reste du**, penalite **recalculee et non cumulee**, declenchement explicite. 11 tests |
| Paiement en ligne | NON IMPLEMENTE | Interface definie, **aucun prestataire branche** |

## 10. Depenses et comptabilite

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Categories, fournisseurs, factures | TERMINE | |
| Circuit demande → approbation → reglement | TERMINE | L'ecriture n'est passee **qu'au reglement** |
| Caisses et comptes bancaires | TERMINE | |
| Plan comptable configurable (SYSCOHADA) | TERMINE | 31 comptes fournis, modifiables |
| Ecritures equilibrees debit/credit | TERMINE | Desequilibre rejete |
| Contrepassation tracee | TERMINE | L'originale reste au grand livre |
| Balance, grand livre, compte de resultat, bilan | TERMINE | Desequilibre **signale**, jamais masque |
| Cloture de periode | TERMINE | Brouillons bloquants |
| Distinction CA / encaissements / creances / resultat / tresorerie | TERMINE | Definitions rappelees dans l'interface |
| Budget vs realise | TERMINE | Saisie depuis `/parametres/comptabilite` |
| Previsions de tresorerie | NON IMPLEMENTE | |
| Tableau de flux de tresorerie | NON IMPLEMENTE | Le solde de tresorerie est disponible |
| Ecritures de cloture / report a nouveau | NON IMPLEMENTE | Les comptes existent au plan |

## 11. Tableaux de bord et rapports

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Tableau de bord adaptatif par role | TERMINE | Aucun chiffre financier pour un profil pedagogique |
| Effectifs, inscriptions, recouvrement, impayes, resultat, tresorerie | TERMINE | Issus des donnees reelles |
| Evolution mensuelle et repartition par mode | TERMINE | Graphiques CSS, equivalent textuel accessible |
| Filtres (annee, periode, classe, niveau) | TERMINE | |
| Exports CSV | TERMINE | 6 exports, respectant la portee de l'utilisateur |
| Exports Excel (.xlsx) et PDF des rapports | NON IMPLEMENTE | Le CSV s'ouvre dans Excel ; les documents nominatifs sont en PDF |

## 12-13. Espaces parent, eleve, enseignant

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Parent rattache a plusieurs enfants | TERMINE | Acces borne, verifie a chaque requete |
| Resultats, bulletins, devoirs, absences, emploi du temps, soldes | TERMINE | |
| Depot de justificatif, telechargement recus/bulletins | TERMINE | |
| Notifications (notes, absence, paiement, echeance) | TERMINE | Canal applicatif |
| Demandes de documents et de rendez-vous | TERMINE | Cote famille `/parent/demandes` (depot et suivi), cote etablissement `/demandes` (traitement, motif obligatoire pour un refus, notification systematique du demandeur) |
| Messagerie parent ↔ ecole | TERMINE | `/messages` : fils, non-lus, reponses. **Acces par participation uniquement** : aucun role, pas meme la direction, ne lit un fil auquel il ne participe pas. Messages ni modifiables ni supprimables. 11 tests |
| Espace eleve (notes, devoirs, remises, calendrier) | TERMINE | |
| Espace enseignant borne a ses classes | TERMINE | Applique par les requetes, pas par l'affichage |

## 14. Communication et modules optionnels

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Annonces ciblees par audience et par classe | TERMINE | |
| Notifications applicatives | TERMINE | |
| E-mail, SMS, WhatsApp | NON IMPLEMENTE | Interfaces definies ; un canal non configure est marque `FAILED`, jamais `SENT` |
| Activation des modules optionnels | PARTIEL | **Bibliotheque : implementee** (`/bibliotheque`, fonds, prets, retours, pertes, disponibilite calculee et non stockee, 17 tests). Les six autres modules (cantine, transport, inventaire, maintenance, evenements, anciens eleves) sont **activables mais sans ecran** : leur case n'ouvre aucune fonction |

## 15. IA et OCR

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Interfaces OCR / IA | TERMINE | Contrats definis dans `src/lib/integrations.ts` |
| Champs OCR sur le justificatif | TERMINE | `ocrExtract`, `ocrStatus` |
| Extraction OCR reelle | NON IMPLEMENTE | **Aucun moteur branche** |
| Garde-fous (l'OCR ne valide jamais seul, l'IA ne publie pas de notes) | TERMINE | Respectes par construction : seul un humain habilite declenche ces actions |

## 16. Administration SaaS

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Espace super-administrateur | TERMINE | |
| Organisations, ecoles, statistiques | TERMINE | |
| Formules Essentiel / Professionnel / Premium | TERMINE | Limites affichees, depassements signales |
| Abonnements et changements de statut | TERMINE | **La suspension ne supprime aucune donnee** |
| Factures SaaS distinctes des frais scolaires | TERMINE | Modeles et ecrans separes |
| Tickets d'assistance | TERMINE | Reponse horodatee depuis `/admin-saas`, statut choisi explicitement, demandeur notifie |
| Export complet des donnees d'une ecole | TERMINE | `/api/export/etablissement` : archive JSON de 50 entites. **Exclut les empreintes de mots de passe et les jetons de session** (verifie) ; le contenu binaire des fichiers se sauvegarde separement |
| Procedure de resiliation | PARTIEL | Statut et conservation garantis ; **procedure de suppression a declencher manuellement** |

## 17. Securite

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Authentification scrypt, sessions serveur revocables | TERMINE | |
| Controle d'acces serveur systematique | TERMINE | Permission **et** tenant, a chaque operation |
| Isolation stricte entre ecoles | TERMINE | Testee explicitement |
| Limitation des tentatives, verrouillage de compte | TERMINE | Par e-mail et par IP |
| Journal d'audit | TERMINE | Donnees sensibles masquees a l'ecriture |
| Validation serveur de toutes les entrees | TERMINE | Zod |
| Fichiers prives servis sous controle | TERMINE | Type reel verifie par signature binaire |
| Messages d'erreur ne revelant rien | TERMINE | 404 uniforme en cas d'acces croise |
| Recuperation de mot de passe par e-mail | PARTIEL | Reinitialisation **par un administrateur** disponible ; le parcours autonome exige un service e-mail |
| Sauvegardes automatiques | NON IMPLEMENTE | Procedure documentee dans `DEPLOIEMENT.md` |
| Politique de conservation et purge automatique | PARTIEL | Regles documentees et purge des sessions disponible ; **aucune tache planifiee fournie** |
| Chiffrement au repos | NON IMPLEMENTE | A assurer au niveau du disque ou du SGBD |

## 18-20. Technique et donnees

| Fonctionnalite | Etat |
|---|---|
| TypeScript strict, React/Next.js responsive | TERMINE |
| ORM, migrations versionnees | TERMINE |
| Separation metier / interface / donnees | TERMINE |
| `.env.example` sans aucun secret reel | TERMINE |
| Donnees de demonstration clairement fictives | TERMINE |
| Schema relationnel complet avec contraintes et index | TERMINE |
| Montants en unites monetaires entieres | TERMINE |
| Regles de suppression et d'archivage | TERMINE |

## 21. Tests

| Element | Etat |
|---|---|
| Tests unitaires (monnaie, moyennes, permissions, comptabilite) | TERMINE — 153 tests |
| Tests d'integration (paiements, pedagogie, imports, isolation) | TERMINE — 63 tests |
| Cas limites (montant nul/negatif, doublon, rejet, annee cloturee, acces inter-ecoles) | TERMINE |
| Tests de parcours navigateur automatises | NON IMPLEMENTE | Aucun outil de test navigateur n'etait disponible dans l'environnement. Un parcours de fumee scripte couvre **43 pages × 8 roles = 344 requetes HTTP** sur le build de production (voir `docs/TESTS.md`) |
| Tests des Server Actions via HTTP | NON IMPLEMENTE | La logique metier qu'elles appellent est testee directement |

---

## Resume

| Categorie | Nombre |
|---|---|
| **TERMINE** | 113 |
| **PARTIEL** | 4 |
| **NON IMPLEMENTE** | 15 |

### Ce qui reste PARTIEL, et pourquoi

- **Modules optionnels** : seule la *bibliotheque* a un ecran. Les six autres
  cases (cantine, transport, inventaire, maintenance, evenements, anciens
  eleves) s'enregistrent mais **n'ouvrent aucune fonction**. Les activer ne
  donne rien : c'est dit ici plutot que decouvert en production.
- **Procedure de resiliation** : la suspension et la conservation des donnees
  fonctionnent et sont testees ; la suppression definitive reste un geste
  manuel, volontairement. Une suppression automatique de donnees scolaires
  apres impaye serait inacceptable.
- **Recuperation de mot de passe par e-mail** : la reinitialisation par un
  administrateur fonctionne. Le parcours autonome exige un service e-mail
  reel ; aucun n'est branche, donc il n'est pas propose.
- **Purge automatique** : les regles de conservation sont documentees et la
  purge des sessions existe, mais aucune tache planifiee n'est fournie avec
  l'application.

### Ce qui reste NON IMPLEMENTE

Trois familles, et aucune n'est simulee :

1. **Integrations externes** — paiement en ligne, e-mail, SMS, WhatsApp, OCR.
   Les interfaces existent, aucun prestataire n'est branche. Un canal non
   configure est marque `FAILED`, jamais `SENT` : l'application ne pretend
   jamais avoir envoye ce qu'elle n'a pas envoye.
2. **Perimetre universitaire avance** — stages, memoires, soutenances, jurys,
   diplomation.
3. **Confort et exploitation** — exports .xlsx natifs, previsions de
   tresorerie, ecritures de cloture, sauvegardes planifiees, chiffrement au
   repos (a assurer au niveau du disque ou du SGBD).

### Verification

Chiffres de la derniere execution complete :

- `npx tsc --noEmit` : aucune erreur
- `npx vitest run` : **275 tests** dans 10 fichiers, tous verts
- `npm run build` : 57 routes, compilation reussie
- Parcours de fumee sur le build de production : **344 requetes
  (43 pages × 8 roles), 0 erreur serveur**
- Les refus d'acces observes sont des redirections vers `/acces-refuse` ou des
  404, jamais des pages d'erreur : le controle d'acces repond, il ne plante pas.
