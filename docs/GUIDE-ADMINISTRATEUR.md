# Guide administrateur

Destine au proprietaire, au directeur et au responsable administratif d'un
etablissement. Il suit l'ordre reel d'une mise en service.

> **Vous cherchez a utiliser l'application au quotidien ?** Voyez plutot les
> [guides par profil](guides/README.md) : un guide dedie pour chaque role,
> avec des exemples concrets.

---

## 1. Mise en service, dans l'ordre

Chaque etape conditionne la suivante.

### 1.1 Identite de l'etablissement
**Parametres** → nom, code, type, contacts, **devise** et format regional.

> Le **code** sert aux matricules et aux references : choisissez-le court et
> definitif (`GSE-COC`). Le **format du matricule** accepte `{SCHOOL}`,
> `{YEAR}`, `{YY}` et `{SEQ:4}` ; un apercu du prochain matricule est affiche.

### 1.2 Annee scolaire et periodes
**Parametres → Annees scolaires.** Creez l'annee, marquez-la « en cours », puis
ajoutez ses periodes (trimestres ou semestres).

> Sans periode, aucune evaluation ni bulletin n'est possible.

### 1.3 Niveaux et classes
**Parametres → Niveaux et classes.** Les niveaux d'abord (ils structurent le
cursus), les classes ensuite.

> Le **code de classe** est celui qu'utilisera l'import CSV : gardez-le simple
> (`6EME-A`).

### 1.4 Matieres et coefficients
**Parametres → Matieres.** Le coefficient saisi ici est une valeur par defaut,
surchargeable classe par classe.

### 1.5 Comptabilite
**Parametres → Comptabilite.** Un plan comptable SYSCOHADA de 31 comptes est
deja en place. Creez au minimum :
- une **caisse** et un **compte bancaire** ;
- vos **categories de depenses**, chacune rattachee a un compte de charge ;
- un **exercice comptable** couvrant l'annee scolaire.

### 1.6 Regles de notation
**Parametres → Regles de notation.** Bareme, traitement des absences, moyenne
de passage, classement active ou non.

> Modifier ces regles n'altere **pas** les bulletins deja generes : leurs
> valeurs sont figees.

### 1.7 Personnel et acces
**Personnel.** Enregistrez les agents, cochez « creer un acces » et choisissez
le role. Un mot de passe provisoire est affiché **une seule fois** : transmettez-le
par un canal distinct (en main propre, SMS), jamais par le meme e-mail que
l'identifiant.

Affectez ensuite chaque enseignant a ses couples classe/matiere : **cette
affectation determine ce qu'il peut voir et saisir.**

### 1.8 Frais scolaires
**Frais scolaires.** Pour chaque frais : libelle, code, montant, portee
(etablissement / niveau / classe) et echeancier.

> « Appliquer automatiquement a l'inscription » ajoute le frais au compte de
> chaque nouvel eleve concerne. C'est le reglage a privilegier pour
> l'inscription et la scolarite.

### 1.9 Eleves
Soit un par un (**Eleves → Nouvel eleve**), soit par import.

---

## 2. Importer les eleves

**Eleves → Importer.**

1. Telechargez le modele CSV.
2. Completez-le. Seuls **nom** et **prenom** sont obligatoires ; le matricule
   est genere s'il est vide.
3. Deposez le fichier : l'application produit un **apercu** et un rapport.
   **Rien n'est encore enregistre.**
4. Verifiez le rapport :
   - **ERREUR** — champ manquant, date illisible, classe inconnue. Ligne ecartee.
   - **DOUBLON** — matricule deja pris, ou meme nom + prenom + date de
     naissance. Ligne ecartee.
   - **AVERTISSEMENT** — classe complete. Ligne importee malgre tout.
5. Corrigez le fichier et recommencez, ou validez : seules les lignes valides
   sont importees, avec inscription, responsable legal et frais obligatoires.

> **Fratries.** Deux eleves partageant le meme telephone ou e-mail de parent
> sont rattaches au **meme** responsable, pas a deux fiches distinctes.

> **Excel.** Enregistrez en CSV. Les separateurs `;` et `,`, les accents et
> l'encodage Windows-1252 sont geres automatiquement.

---

## 3. Encaisser un reglement

**Encaissements → Nouvel encaissement.**

1. Recherchez l'eleve (nom ou matricule).
2. Lisez sa **situation** : total du, deja paye, **en attente de confirmation**,
   reste a payer, et les echeances ouvertes.
3. Saisissez le montant, le mode, la date, et la reference externe pour un
   Mobile Money, un cheque ou un virement.
4. Validez : le recu est imprimable immediatement.

**L'imputation est automatique** : le montant solde les echeances les plus
anciennes d'abord. Un excedent est enregistre comme avance et apparait en
trop-percu.

> **Double clic sans risque.** Chaque formulaire porte une cle unique. Une
> double soumission renvoie le reglement deja enregistre, avec un message
> explicite — aucun double encaissement n'est possible.

> **Attention au doublon humain.** Si la famille a deja depose un justificatif
> pour ce meme versement, un avertissement s'affiche. Verifiez avant
> d'encaisser : le justificatif devra sinon etre rejete.

---

## 4. Traiter les justificatifs

**C'est le point le plus sensible de l'application.**

Quand une famille depose un justificatif, il part au statut **EN ATTENTE**. A ce
stade :

- il **n'entre dans aucun** total encaisse ;
- il **ne reduit pas** le solde de la famille ;
- il **ne genere aucune** ecriture comptable.

**Justificatifs** (comptable, directeur ou proprietaire) :

1. Ouvrez la piece jointe.
2. **Verifiez le releve du compte beneficiaire.** Une capture d'ecran ne prouve
   pas la reception des fonds.
3. Puis :
   - **Accepter** — saisissez le montant **reellement constate** (il peut
     differer du montant declare). Un encaissement et un recu sont crees, et
     l'ecriture comptable passee.
   - **Rejeter** — un motif est obligatoire. Il est transmis a la famille.

> Ne validez jamais sur la seule foi d'une image. Cette etape existe
> precisement pour cela.

---

## 5. Depenses

Cycle en trois temps, volontairement :

1. **Demande** — n'importe quel profil habilite enregistre la depense.
2. **Approbation** — un responsable approuve ou refuse avec motif.
3. **Reglement** — « Marquer payee ». **C'est seulement ici** que l'ecriture
   comptable est passee et que la tresorerie diminue.

Une depense approuvee mais non reglee est un **engagement** : elle apparait a
part dans les tableaux de bord.

---

## 6. Notes et bulletins

### Le circuit, et pourquoi il existe

```
Brouillon  →  Soumise  →  Validee  →  Publiee
(enseignant)  (enseignant)  (pedagogie)  (pedagogie)
```

Seules les evaluations **validees ou publiees** comptent dans les bulletins. Un
brouillon n'influence aucune moyenne.

### Generer puis publier

**Bulletins** : choisissez classe et periode.

1. **Generer** — calcule moyennes, rangs et moyenne de classe, puis les **fige**.
   Reversible : vous pouvez regenerer.
2. **Publier** — rend les notes visibles des familles, **verrouille la periode**
   pour tout l'etablissement, et envoie les notifications.
   **Irreversible.**

> Generez et relisez avant de publier. Apres publication, toute correction exige
> un motif et apparait au journal des corrections, consultable.

---

## 6 bis. Conseil de classe et appreciations

**Appreciations par matiere** — `Pedagogie > Appreciations`
Chaque enseignant redige l'appreciation de **sa** matiere pour sa classe. Le
serveur verifie l'affectation : un enseignant ne peut pas ecrire sur une
matiere qu'il n'assure pas, meme en manipulant l'adresse.
Une appreciation laissee vide est supprimee, pour ne pas imprimer de ligne vide
sur le bulletin.

**Conseil de classe** — `Pedagogie > Conseil de classe`
1. Generez d'abord les bulletins de la periode : le conseil delibere sur des
   moyennes **figees**, pas sur un calcul qui bougerait pendant la seance. Si
   des bulletins manquent, l'ecran le dit.
2. Le bouton « Proposer selon la moyenne de passage » pre-remplit les
   decisions. **C'est une aide a la saisie, pas une decision** : modifiez
   librement chaque ligne.
3. Enregistrez. Toutes les decisions partent en une seule fois : un conseil
   interrompu a mi-parcours ne laisse pas la moitie des eleves sans decision.
4. Editez le proces-verbal PDF. Il mentionne explicitement les eleves sans
   bulletin ou sans decision : un PV incomplet doit se voir.

Une annee cloturee refuse toute modification de decision.

**Rattrapage** — `Parametres > Pedagogie`
Choisissez la regle : retenir la meilleure des deux sessions, remplacer
systematiquement, ou ignorer le rattrapage. Un plafond facultatif permet de
limiter la note de seconde session — il ne ramene jamais un eleve sous sa note
de session normale. Les deux sessions restent lisibles sur le bulletin, et les
matieres rattrapees y sont signalees par un asterisque.

---

## 6 ter. Penalites, remises et rapprochement

**Penalites de retard et remise fratrie** — `Finances > Penalites et remises`

Rien ne s'applique tout seul. L'ecran fonctionne en deux temps :
1. vous definissez la regle (elle ne modifie aucun compte) ;
2. vous consultez l'apercu — quelles familles, quels montants — puis vous
   declenchez l'application, qui est tracee au journal d'audit.

La penalite porte sur le **reste du**, pas sur le montant initial : une famille
qui a deja paye l'essentiel n'est pas penalisee comme si elle n'avait rien
verse. Elle est **recalculee** a chaque execution, jamais cumulee : relancer le
traitement deux fois le meme jour ne double pas la penalite.

En mode « pourcentage par jour », definissez un plafond. Sans plafond, le
montant devient vite disproportionne.

Une remise fratrie deja accordee sur un frais n'est jamais ecrasee : vous avez
pu negocier un taux particulier.

**Rapprochement bancaire** — `Finances > Rapprochement bancaire`

Saisissez le solde final du releve et la periode. L'application reconstitue le
solde comptable (solde d'ouverture + encaissements valides − depenses payees)
et fige l'ecart.

L'ecart n'est **jamais corrige automatiquement** et aucune ecriture n'est
passee. Si l'ecart n'est pas nul, la cloture exige une explication ecrite :
cheques en circulation, virement non credite, frais bancaires. Clore en
silence un rapprochement qui ne tombe pas juste reviendrait a effacer le
probleme.

---

## 6 quater. Presences du personnel, demandes et messagerie

**Presences du personnel** — `Scolarite > Presences du personnel`
Feuille quotidienne : present, absent, retard (en minutes), conge. Les
demandes de conge s'approuvent depuis le meme ecran ; l'approbation marque les
journees concernees en conge, **sans ecraser une presence ou un retard deja
constate** — un fait observe prime sur une regularisation administrative.

Aucune retenue sur salaire et aucun solde de conges ne sont calcules : ces
regles dependent du droit du travail applicable et doivent etre traitees hors
de l'application.

**Demandes des familles** — `Communication > Demandes des familles`
Les familles demandent documents et rendez-vous depuis `Mon espace > Mes
demandes`. Vous les traitez ici. Un refus exige un motif, transmis a la
famille ; aucun changement de statut n'est silencieux.

**Messagerie** — `Communication > Messages`
Un fil n'est lisible que par ses **participants**. Il n'existe aucune vue
« tous les messages de l'ecole », meme pour la direction : c'est une
conversation, pas un registre. Les messages ne peuvent etre ni modifies ni
supprimes apres envoi.

**Permissions fines** — `Parametres > Utilisateurs et roles > Permissions`
Vous pouvez ajouter ou retirer une permission a une personne precise, en ecart
de son role. Les ecarts sont signales en couleur et rappeles en haut de page.
Retirer une permission ferme reellement l'action : ce n'est pas un simple
masquage de bouton. Vous ne pouvez pas modifier vos propres permissions.

---

## 7. Comprendre les chiffres

Quatre grandeurs souvent confondues :

| Indicateur | Definition | Quand il bouge |
|---|---|---|
| **Chiffre d'affaires** | Frais emis aux familles, net de remises | A l'**emission** du frais |
| **Encaissements** | Reglements recus et valides | A l'**encaissement** |
| **Creances (impayes)** | Facture moins encaisse | Ecart entre les deux |
| **Tresorerie** | Solde des caisses et comptes | A chaque entree/sortie |
| **Resultat** | Produits moins charges | Compte de resultat |

> Un resultat positif avec une tresorerie faible est normal : vous avez
> facture, pas encore encaisse. **Ne confondez jamais resultat et tresorerie.**

Les justificatifs en attente n'entrent dans **aucune** de ces grandeurs.

---

## 8. Cloturer

### Periode comptable
**Comptabilite → Cloturer.** Refuse toute nouvelle ecriture sur la periode.
Les brouillons doivent etre traites avant.

### Annee scolaire
**Parametres → Annees scolaires → Cloturer.** Bloque inscriptions et nouveaux
frais. **Aucune donnee n'est supprimee** : tout reste consultable et exportable.

> Avant de cloturer : publiez les resultats, encaissez ou soldez les reglements
> en cours, et exportez vos etats.

---

## 9. Comptes et securite au quotidien

**Parametres → Utilisateurs.**

- **Rattacher** un compte existant, ou en creer un (mot de passe provisoire).
- **Suspendre** : coupe l'acces et **ferme immediatement les sessions en cours**.
- **Reinitialiser** un mot de passe : genere un code provisoire affiché **une
  seule fois**.

### Separation a respecter

| Role | Mission | Ne doit pas |
|---|---|---|
| **Caissier** | Encaisser, editer les recus | Valider un justificatif |
| **Comptable** | Arbitrer les justificatifs, tenir les comptes | Saisir des notes |
| **Enseignant** | Saisir les notes de **ses** classes | Publier, voir les finances |
| **Pedagogie** | Valider et publier | Toucher a la comptabilite |

> **Ne cumulez pas caissier et comptable sur un meme compte.** Celui qui
> encaisse ne doit pas etre celui qui valide : c'est la protection principale
> contre la fraude interne.

### Journal d'audit

**Journal d'audit** trace les operations sensibles. Surveillez l'onglet
**Securite** : une accumulation d'echecs de connexion ou de tentatives d'acces
inter-etablissements merite une verification.

---

## 10. Questions frequentes

**Une famille dit avoir paye, le solde n'a pas bouge.**
Son justificatif est probablement en attente. Ouvrez **Justificatifs** : tant
qu'il n'est pas accepte, le solde ne change pas — c'est voulu.

**J'ai encaisse deux fois le meme reglement.**
Ouvrez **Encaissements**, « Annuler » sur le doublon, avec motif. Le paiement
est conserve au statut annule et l'ecriture contrepassee.

**Une note est fausse apres publication.**
Ouvrez l'evaluation : « Corriger » exige un motif et laisse une trace. Le
bulletin deja genere garde ses valeurs figees ; regenerez-le si necessaire.

**Un parent voit les notes d'un enfant dont il ne devrait pas.**
Ouvrez le dossier de l'eleve, section Responsables legaux : decochez
« Autorise a consulter les notes ».

**Le bilan est signale desequilibre.**
Consultez le journal des ecritures de la periode. Un desequilibre est affiche
plutot que masque ; ne cloturez pas avant de l'avoir resolu.

**Je veux changer d'etablissement.**
Si votre compte est rattache a plusieurs ecoles, utilisez le selecteur dans la
barre superieure. Vos droits peuvent differer d'une ecole a l'autre.
