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
| Multi-tenant (organisation → ecoles) | TERMINE | Isolation verifiee par tests d'integration dedies |
| Proprietaire gerant plusieurs ecoles | TERMINE | Selecteur d'etablissement dans la barre superieure |
| 9 roles avec permissions strictes | TERMINE | Matrice dans `src/lib/permissions.ts`, 33 tests |
| Affectation multi-etablissements | TERMINE | Un role par ecole et par utilisateur |
| Permissions fines par membership | PARTIEL | Le moteur de surcharges (`grant`/`revoke`) existe et est teste ; **aucun ecran** ne permet encore de les editer |
| Types d'etablissement (prescolaire → universite) | TERMINE | Influence la terminologie (trimestre/semestre, credits) |

## 3. Creation et configuration d'une ecole

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Identite, contacts, devise, locale | TERMINE | |
| Cycles, niveaux, classes, matieres, coefficients | TERMINE | |
| Filieres | PARTIEL | Modele complet et utilisable ; **pas d'ecran de creation** (a creer en base ou via le seed) |
| Periodes d'evaluation | TERMINE | Trimestres, semestres, modules |
| Regle de matricule parametrable | TERMINE | Jetons `{SCHOOL}`, `{YEAR}`, `{YY}`, `{SEQ:n}` |
| Frais et moyens de paiement | TERMINE | |
| Import CSV avec apercu, erreurs, doublons | TERMINE | 13 tests d'integration |
| Import Excel (.xlsx) natif | NON IMPLEMENTE | Exporter en CSV depuis Excel ; le format CSV est pleinement gere (separateurs, accents, Windows-1252) |
| Logo de l'etablissement | PARTIEL | Champ present en base ; **pas d'ecran de televersement** |

## 4. Eleves et etudiants

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Dossier complet, matricule unique | TERMINE | |
| Responsables legaux et autorisations | TERMINE | Droits distincts notes / facturation |
| Inscriptions, reinscriptions, transferts de classe | TERMINE | Controle de capacite |
| Statuts (transfere, abandon, diplome, archive) | TERMINE | Aucune suppression, historique conserve |
| Places disponibles | TERMINE | Affichage et blocage a la capacite |
| Certificats, cartes, listes de classe, releves (PDF) | TERMINE | |
| Photo de l'eleve | PARTIEL | Champ et emplacement reserve sur la carte ; **pas d'ecran de televersement** |
| Historique scolaire inter-etablissements | NON IMPLEMENTE | L'historique est propre a chaque ecole |

## 5. Enseignants et personnel

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Profils, qualifications, contrats | TERMINE | |
| Affectation classes/matieres | TERMINE | Borne les droits de l'enseignant |
| Creation et suspension des acces | TERMINE | Suspendre ferme les sessions en cours |
| Export vers logiciel de paie | TERMINE | CSV ; **aucun calcul de paie legale** (choix assume) |
| Presences, retards, conges du personnel | PARTIEL | Modeles `StaffAttendance` / `StaffLeave` presents et exportes ; **pas d'ecran de saisie** |
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
| Appreciations | PARTIEL | Suggestion automatique et champ en base ; **pas d'ecran de saisie par matiere** |
| Decisions de passage / redoublement | PARTIEL | Champ `decision` sur l'inscription ; **pas d'ecran de conseil de classe** |
| Universite : UE, EC, credits, semestres | PARTIEL | Modele complet, credits calcules (`computeEarnedCredits`), affichage adapte ; **pas d'ecran de gestion des UE** |
| Rattrapages | PARTIEL | Champ `examSession` sur l'evaluation ; **pas de logique de substitution de note** |
| Stages, memoires, soutenances, jurys, diplomation | NON IMPLEMENTE | |
| Proces-verbaux PDF | NON IMPLEMENTE | Les bulletins et listes de classe existent |

## 7. Devoirs et ressources

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Publication de devoirs | TERMINE | |
| Statuts a faire / remis / en retard / corrige | TERMINE | Retard determine par l'horloge **serveur** |
| Depot des travaux par l'eleve | TERMINE | Saisie texte |
| Notation et commentaires | TERMINE | |
| Pieces jointes aux devoirs et aux remises | PARTIEL | Modele `Document` relie ; **pas d'ecran de televersement** |
| Corrige publie ulterieurement | PARTIEL | Champs en base ; **pas d'ecran** |
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
| Rapprochement bancaire | PARTIEL | Modele `BankReconciliation` present ; **pas d'ecran** |
| Remise fratrie automatique | PARTIEL | `countSiblings()` disponible ; application **manuelle** |
| Penalites de retard | PARTIEL | Champ `penaltyMinor` pris en compte dans les soldes ; **pas de calcul automatique** |
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
| Budget vs realise | PARTIEL | Modele et calcul presents, affiches dans les rapports ; **pas d'ecran de saisie du budget** |
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
| Demandes de documents et de rendez-vous | PARTIEL | Actions serveur completes ; **pas d'ecran de traitement cote etablissement** |
| Messagerie parent ↔ ecole | PARTIEL | Modeles `MessageThread`/`Message` presents ; **pas d'ecran** |
| Espace eleve (notes, devoirs, remises, calendrier) | TERMINE | |
| Espace enseignant borne a ses classes | TERMINE | Applique par les requetes, pas par l'affichage |

## 14. Communication et modules optionnels

| Fonctionnalite | Etat | Precisions |
|---|---|---|
| Annonces ciblees par audience et par classe | TERMINE | |
| Notifications applicatives | TERMINE | |
| E-mail, SMS, WhatsApp | NON IMPLEMENTE | Interfaces definies ; un canal non configure est marque `FAILED`, jamais `SENT` |
| Activation des modules optionnels | PARTIEL | Les cases existent et sont enregistrees ; **les modules (bibliotheque, cantine, transport, inventaire, maintenance, evenements, anciens eleves) n'ont pas d'ecran** |

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
| Tickets d'assistance | PARTIEL | Affichage et modele ; **pas d'ecran de reponse** |
| Export complet des donnees d'une ecole | PARTIEL | 6 exports CSV thematiques ; **pas d'export global en un clic** |
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
| Tests de parcours navigateur automatises | NON IMPLEMENTE | Aucun outil de test navigateur n'etait disponible dans l'environnement. Un parcours de fumee manuel a ete execute sur 35 pages × 8 roles (voir `docs/TESTS.md`) |
| Tests des Server Actions via HTTP | NON IMPLEMENTE | La logique metier qu'elles appellent est testee directement |

---

## Resume

| Categorie | Nombre |
|---|---|
| **TERMINE** | 78 |
| **PARTIEL** | 25 |
| **NON IMPLEMENTE** | 21 |

Les fonctions **PARTIEL** disposent presque toutes du modele de donnees et de la
logique metier : il leur manque un ecran. Les fonctions **NON IMPLEMENTE** se
concentrent sur les integrations externes (volontairement non simulees), les
modules optionnels, et le perimetre universitaire avance.
