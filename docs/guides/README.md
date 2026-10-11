# Guides d'utilisation

Un guide par profil. Lisez celui qui correspond à votre rôle — vous n'avez pas
besoin des autres.

| Votre rôle | Votre guide |
|---|---|
| Propriétaire d'un ou plusieurs établissements | [proprietaire.md](proprietaire.md) |
| Directeur | [directeur.md](directeur.md) |
| Responsable pédagogique | [responsable-pedagogique.md](responsable-pedagogique.md) |
| Enseignant | [enseignant.md](enseignant.md) |
| Comptable | [comptable.md](comptable.md) |
| Caissier | [caissier.md](caissier.md) |
| Parent ou tuteur | [parent.md](parent.md) |
| Super-administrateur de la plateforme | [super-administrateur.md](super-administrateur.md) |

### Versions PDF

Les mêmes guides sont disponibles en PDF imprimables dans
[pdf/](pdf/) — pratique pour remettre un document papier à un enseignant ou à
une famille sans accès à l'application.

Pour les regénérer après modification d'un guide :

```bash
npm run guides:pdf
```

Un profil **Élève** existe aussi (consulter ses notes, ses devoirs, déposer un
travail). Il est décrit à la fin du guide parent.

---

## 1. Se connecter

1. Ouvrez l'adresse de votre établissement.
2. Saisissez votre **adresse e-mail** et votre **mot de passe**.
3. Si c'est votre première connexion, l'application vous demande de changer le
   mot de passe reçu de l'administration.

**Au bout de 5 échecs**, le compte se bloque un moment. Ce n'est pas une panne :
c'est une protection contre quelqu'un qui essaierait de deviner votre mot de
passe. Attendez, ou demandez à un administrateur de réinitialiser le vôtre.

> **Mot de passe oublié ?** Il n'y a pas d'envoi automatique par e-mail :
> l'application n'est reliée à aucun service de messagerie.
>
> Demandez une réinitialisation au **propriétaire de l'établissement**. C'est
> le seul rôle qui en a le droit — le directeur peut créer des comptes et
> suspendre des accès, mais **pas** réinitialiser un mot de passe. Vous
> recevrez un mot de passe provisoire, **affiché une seule fois**, que vous
> changerez à la connexion suivante.

---

## 2. Se repérer dans l'écran

**La colonne de gauche** liste vos rubriques, groupées par thème : Pilotage,
Scolarité, Pédagogie, Finances, Communication, Administration.

> Vous ne voyez que ce que votre rôle autorise. Si un collègue vous parle d'un
> écran que vous n'avez pas, ce n'est pas un bug : il n'est pas prévu pour vous.

**La barre du haut** affiche :

- le nom de l'établissement actif — cliquable si vous en gérez plusieurs ;
- la **cloche** des notifications, avec le nombre de messages non lus ;
- votre nom, qui ouvre **Mon compte** (changer de mot de passe) et **Se
  déconnecter**.

### « Accès refusé »

Vous avez ouvert un lien réservé à un autre rôle. Rien n'est cassé. Si vous
pensez devoir y accéder, demandez à votre directeur : il peut ajuster vos
droits, personne par personne.

---

## 3. Six règles qui expliquent le comportement de l'application

Ces règles reviennent dans tous les guides. Les comprendre une fois évite
beaucoup de questions.

### 3.1 Un justificatif n'est pas un paiement

Quand un parent photographie son reçu Mobile Money et le dépose, **rien ne
bouge** sur son compte. Le montant reste dû. Il ne devient un encaissement que
lorsqu'un comptable l'a **vérifié et accepté**.

C'est volontaire : une photo peut être retouchée, rejouée ou mal lue. Seul un
humain qui a constaté l'argent valide l'opération.

### 3.2 Un reçu est figé

Le reçu reprend la situation **au moment de l'encaissement**. Si les frais de
l'élève changent le lendemain, le reçu déjà remis ne change pas. C'est ce qui
lui donne sa valeur : un document remis à une famille ne doit jamais se
réécrire tout seul.

### 3.3 On n'efface pas, on contrepasse

Annuler un encaissement ne le supprime pas. L'application enregistre une
**écriture inverse** qui l'annule, et les deux restent visibles.

Un paiement qui disparaîtrait sans trace rendrait toute vérification
impossible. Ici, on peut toujours répondre à la question « que s'est-il
passé ? ».

### 3.4 Un bulletin est figé à sa génération

Une fois le bulletin produit, modifier une note ne le change plus. Il faut le
**regénérer** explicitement. Un bulletin déjà remis à une famille ne doit pas
se modifier dans son dos.

### 3.5 Publier verrouille la période

Publier les résultats les rend visibles aux familles **et verrouille la
période**. Les notes ne sont plus modifiables librement : toute correction
passe par une révision tracée, avec motif obligatoire.

### 3.6 Chaque établissement est hermétique

Si vous travaillez dans deux établissements, vous basculez de l'un à l'autre
par le sélecteur du haut. Les données ne se mélangent **jamais** : depuis
l'établissement A, un élève de l'établissement B n'existe tout simplement pas.

---

## 4. Conventions d'affichage

**Les montants** sont en francs CFA, sans décimales : `125 000 F CFA`. Les
calculs se font en unités entières, donc aucun centime ne se perd en route.

**Les notes** sont affichées sur le barème de l'établissement, 20 par défaut :
`15,25`. Un devoir noté sur 50 est automatiquement ramené au barème pour la
moyenne.

**Les dates** sont au format jour/mois/année : `15/01/2026`.

---

## 5. Ce que l'application ne fait pas

Dit clairement pour éviter les mauvaises surprises :

- **Aucun envoi d'e-mail, de SMS ou de WhatsApp.** Les notifications restent
  dans l'application, derrière la cloche. Aucun opérateur n'est raccordé.
- **Aucun paiement en ligne.** Les familles paient sur place ou déposent un
  justificatif de leur virement ou de leur Mobile Money.
- **Aucune lecture automatique des reçus.** Un comptable lit et saisit.
- **Aucun calcul de bulletin de paie.** Les présences du personnel sont
  enregistrées, mais aucune retenue n'en est déduite : ces règles dépendent du
  droit du travail applicable.
- **La recherche ignore la casse mais pas les accents.** `kouame` trouve
  `KOUAME`, mais pas `KOUAMÉ`.

---

## 6. En cas de problème

1. **Rafraîchissez la page.**
2. **Vérifiez l'établissement actif** en haut : vous cherchez peut-être un
   élève dans la mauvaise école.
3. **Vérifiez l'année scolaire** : les écrans affichent l'année en cours.
4. Si le problème persiste, notez **l'heure, l'écran et ce que vous faisiez**,
   puis signalez-le. Le journal d'audit permet de retrouver l'opération.
