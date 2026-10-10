# Securite et protection des donnees

Ce document decrit les mesures reellement en place, leurs limites, et ce qui
reste a la charge de l'exploitant.

---

## 1. Principe directeur

> **L'interface ne protege rien.** Masquer un bouton est une commodite
> d'ergonomie. Chaque page, chaque Server Action et chaque route d'API refait
> sa propre verification cote serveur.

Deux controles **independants** s'appliquent a toute operation :

1. **La permission** — l'utilisateur a-t-il le droit de faire cela ?
2. **Le tenant** — sur quelles donnees ? appartiennent-elles a son etablissement ?

Point d'entree unique : [`src/lib/auth/guard.ts`](../src/lib/auth/guard.ts).

---

## 2. Authentification

| Mesure | Mise en oeuvre |
|---|---|
| Hachage des mots de passe | scrypt (RFC 7914), N=16384, r=8, p=1, sel aleatoire de 16 octets |
| Format de stockage | `scrypt$N$r$p$sel$empreinte` — les parametres sont embarques, le cout peut etre augmente sans invalider l'existant |
| Verification | Comparaison a temps constant (`timingSafeEqual`) |
| Politique | 10 caracteres minimum, majuscule, minuscule, chiffre, caractere special |
| Sessions | Jeton aleatoire de 32 octets ; le cookie ne contient **que** ce jeton opaque |
| Stockage des sessions | En base, empreinte HMAC-SHA256 « poivree » par `SESSION_SECRET` |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` en production, expiration explicite |
| Revocation | Immediate cote serveur (deconnexion, suspension, changement de mot de passe) |

**Pourquoi des sessions serveur plutot qu'un JWT auto-porte.** Un JWT reste
valide jusqu'a son expiration : desactiver un compte ne coupe pas l'acces en
cours. Ici, l'etat vit en base, donc une suspension ferme les sessions
immediatement.

### Protection contre les attaques par force brute

- Limitation par **adresse e-mail** et par **adresse IP** : 5 tentatives /
  5 minutes, blocage 15 minutes.
- Verrouillage du compte apres 8 echecs, pour 15 minutes.
- Message d'erreur **identique** que le compte existe ou non : pas d'enumeration.
- La verification du mot de passe est executee meme pour un compte inconnu,
  afin que le temps de reponse ne trahisse pas son existence.
- Chaque echec est trace dans le journal d'audit.

---

## 3. Isolation multi-tenant

C'est l'exigence la plus critique : **un utilisateur d'une ecole ne doit ni lire
ni modifier les donnees d'une autre.**

### Mecanismes

1. **Filtrage a la requete.** Toute lecture porte un `schoolId` issu de la
   session, jamais d'un parametre d'URL.
2. **Verification a l'ecriture.** Les fonctions metier revalident le tenant au
   plus pres de l'ecriture, a l'interieur de la transaction.
3. **Reponse indifferenciee.** Un acces croise renvoie **404**, jamais 403 :
   repondre « interdit » revelerait l'existence de la ressource ailleurs.
4. **Tracabilite.** Chaque tentative ecrit un evenement
   `security.cross_tenant_attempt`.

### Portees fines, au-dela du tenant

| Role | Restriction supplementaire |
|---|---|
| Enseignant | Uniquement ses couples classe/matiere (`assertTeacherCanTouch`) |
| Parent | Uniquement les enfants rattaches, avec autorisations notes/finances distinctes (`assertGuardianOwnsStudent`) |
| Eleve | Uniquement son propre dossier, identifie par la session |
| Super-administrateur | **Aucun** acces implicite aux donnees d'une ecole |

### Verification

`tests/payments.integration.test.ts` et `tests/academics.integration.test.ts`
creent deux ecoles d'une meme organisation et verifient qu'aucune operation ne
traverse la frontiere : encaissement, frais, justificatif, annulation, note,
compte eleve, balance comptable.

---

## 4. Separation des responsabilites

Pensee pour limiter la fraude interne :

| Role | Peut | Ne peut pas |
|---|---|---|
| Caissier | Encaisser, editer un recu | **Valider un justificatif**, annuler, accorder une remise, voir la comptabilite |
| Comptable | Arbitrer les justificatifs, tenir les comptes, approuver les depenses | Saisir ou publier des notes |
| Enseignant | Saisir des notes, corriger des devoirs | **Publier** des resultats, voir la moindre donnee financiere |
| Responsable pedagogique | Valider et publier les resultats | Acceder a la comptabilite ou encaisser |

Verifie par 33 tests dans `tests/permissions.test.ts`.

> **Recommandation d'exploitation.** Ne cumulez pas caissier et comptable sur un
> meme compte : la separation perd alors tout effet.

---

## 5. Integrite des donnees financieres

| Risque | Parade |
|---|---|
| Double encaissement | Cle d'idempotence par formulaire ; une re-soumission renvoie le paiement existant et trace `payment.duplicate_blocked` |
| Erreur d'arrondi | Montants en **entiers** (unites mineures) ; aucun flottant binaire |
| Perte d'unite a la repartition | Methode du plus fort reste : la somme des parts egale toujours le total |
| Suppression d'une ecriture | Impossible : une ecriture validee est **contrepassee**, l'originale reste au grand livre |
| Modification apres cloture | Une periode cloturee refuse toute ecriture ; une annee cloturee refuse inscriptions et frais |
| Encaissement fictif | Un justificatif n'est jamais un encaissement tant qu'un comptable ne l'a pas accepte |
| Bilan faux | Un desequilibre est **affiche**, jamais masque |

---

## 6. Fichiers televerses

| Mesure | Detail |
|---|---|
| Emplacement | Hors de la racine web (`STORAGE_LOCAL_PATH`), jamais dans `public/` |
| Acces | Uniquement via `/api/files/:id`, apres controle session + tenant + droits |
| Type de fichier | Verifie par **signature binaire**, pas par l'extension ni le type declare |
| Formats acceptes | PDF, JPEG, PNG, WebP |
| Taille | Plafonnee (`STORAGE_MAX_UPLOAD_MB`, 8 Mo par defaut) |
| Nom de fichier | Assaini (traversee de repertoire neutralisee) |
| Cle de stockage | UUID imprevisible, cloisonne par ecole |
| Traversee de chemin | Le chemin resolu est verifie comme restant sous la racine de stockage |
| Cache | `private, no-store` : aucun intermediaire ne conserve un document nominatif |
| Debit | Limite a 30 televersements / 10 minutes par utilisateur |

---

## 7. Validation des entrees

Toute donnee entrante est validee **cote serveur** par Zod
([`src/lib/validation.ts`](../src/lib/validation.ts)), independamment du
navigateur. Les montants passent par un analyseur strict qui refuse les
saisies ambigues et les decimales incompatibles avec la devise.

Les lignes de formulaire forgees (par exemple une note pour un eleve non
inscrit dans la classe) sont ignorees : la liste des destinataires est
reconstruite cote serveur.

---

## 8. Journal d'audit

Operations tracees : authentification, acces refuses, tentatives inter-ecoles,
encaissements, annulations, justificatifs, remboursements, notes et
corrections, depenses, ecritures, clotures, telechargements, gestion des
comptes.

**Donnees sensibles.** Les cles `password`, `token`, `secret`, `apikey`,
`authorization`, `cookie` (et variantes) sont **supprimees en profondeur** avant
ecriture. Un mot de passe provisoire genere n'est jamais journalise.

L'ecriture du journal est volontairement tolerante aux pannes : son echec ne
fait jamais echouer une operation metier deja validee ; il est signale dans les
logs serveur.

---

## 9. Ce qui reste a votre charge

Ces points **ne sont pas** couverts par l'application :

| Element | Action attendue |
|---|---|
| HTTPS | Terminaison TLS par un proxy (nginx, Caddy, hebergeur) |
| Sauvegardes | Voir [DEPLOIEMENT.md](DEPLOIEMENT.md) — a planifier et **a tester par restauration** |
| Chiffrement au repos | Au niveau du disque ou du SGBD |
| Purge des donnees | Definir une politique conforme au droit applicable ; `purgeExpiredSessions()` est disponible mais **aucune tache planifiee n'est fournie** |
| Gestion des secrets | Coffre de l'hebergeur ; ne jamais commiter de `.env` |
| En-tetes de securite | CSP, HSTS, `X-Frame-Options` a configurer au niveau du proxy |
| Protection DDoS | Au niveau reseau |
| Journalisation centralisee | Collecte et retention des logs applicatifs |

---

## 10. Donnees personnelles

L'application traite des donnees de **mineurs** : identite, date et lieu de
naissance, coordonnees, **observations medicales**, resultats scolaires,
situation financiere familiale.

Recommandations :

1. **Minimisation.** Ne renseignez les champs medicaux que si l'infirmerie en a
   l'usage.
2. **Conservation.** Definissez une duree par categorie. L'archivage d'un eleve
   conserve l'historique sans le supprimer : c'est un choix de conformite
   comptable, a arbitrer selon votre droit local.
3. **Acces.** Les autorisations parentales (notes / finances) sont par enfant :
   utilisez-les, notamment dans les situations familiales complexes.
4. **Export et suppression.** Les exports CSV repondent au droit d'acces. La
   suppression definitive doit etre une decision tracee, jamais une routine.
5. **Services externes.** `AI_SEND_PERSONAL_DATA` est a `false` par defaut.
   Ne l'activez qu'apres avoir recueilli les consentements necessaires et
   verifie les conditions du prestataire.

---

## 11. Signaler une vulnerabilite

Ne publiez pas de faille dans un suivi public. Contactez le responsable
technique de l'etablissement avec : le comportement observe, les etapes de
reproduction, et l'impact estime.
