# Guide du comptable

Vous tenez les finances de l'établissement : frais, encaissements, dépenses,
comptabilité, rapprochement bancaire. Vous êtes aussi le seul à pouvoir
**valider un justificatif** et **annuler un encaissement**.

Lisez d'abord les [règles communes](README.md).

---

## 1. Vos écrans

| Écran | Ce que vous y faites |
|---|---|
| **Tableau de bord** | Recettes, impayés, trésorerie en un coup d'œil |
| **Frais scolaires** | Créer les frais, les affecter, accorder des remises |
| **Encaissements** | Enregistrer, consulter, annuler |
| **Justificatifs** | Accepter ou refuser les dépôts des familles |
| **Dépenses** | Saisir, approuver, payer les dépenses |
| **Comptabilité** | Journal, balance, compte de résultat, bilan |
| **Rapprochement bancaire** | Comparer un relevé au solde comptable |
| **Pénalités et remises** | Pénalités de retard, remise fratrie |
| **Rapports et exports** | Exports CSV pour votre tableur |
| **Journal d'audit** | Qui a fait quoi, quand |

---

## 2. Les justificatifs : votre responsabilité centrale

**Finances → Justificatifs**

Une famille dépose la photo de son reçu Mobile Money. **Tant que vous ne
l'avez pas accepté, rien ne bouge** : le montant reste dû, les recettes ne
bougent pas.

### Comment traiter un dépôt

1. Ouvrez le justificatif. Vous voyez ce que la famille **déclare** : montant,
   mode, référence, date, et la pièce jointe.
2. **Vérifiez que l'argent est réellement arrivé** — relevé bancaire, compte
   Mobile Money, remise d'espèces. L'application ne peut pas le savoir à votre
   place.
3. Si c'est confirmé : **Accepter**. Le montant saisi à l'acceptation devient
   l'encaissement, un reçu est émis, l'écriture comptable est passée.
4. Sinon : **Refuser**, avec un motif. Le motif est transmis à la famille.

> **Le montant que vous acceptez fait foi**, pas celui déclaré par la famille.
> Si la capture annonce 50 000 et que vous n'avez reçu que 45 000, acceptez
> 45 000 et expliquez-le en observation.

### Pourquoi l'application ne lit pas la photo

Il n'y a **aucune lecture automatique**. Une capture d'écran se retouche, se
rejoue, se fabrique. Seul un humain qui a constaté l'argent sur un relevé peut
engager l'établissement.

---

## 3. Annuler un encaissement

**Finances → Encaissements**, ouvrez le paiement, **Annuler**. Un motif est
obligatoire.

Ce qui se produit :

- Le paiement passe en **Annulé** — il reste visible.
- Une **écriture de contrepassation** est enregistrée.
- Les imputations sur les échéances sont défaites, le solde de la famille
  remonte d'autant.

L'écriture d'origine et sa contrepassation restent toutes deux au grand livre.
C'est le comportement comptable attendu : on ne fait pas disparaître une
opération, on l'annule visiblement.

> **Cas typique** : le caissier a saisi 750 000 au lieu de 75 000. Annulez
> avec le motif « erreur de saisie, montant réel 75 000 », puis enregistrez le
> bon encaissement.

---

## 4. Les frais et les remises

**Finances → Frais scolaires**

1. **Créez les frais** de l'année : inscription, scolarité, cantine,
   transport, examen…
2. **Affectez-les** aux élèves, par classe ou individuellement.
3. **Découpez en échéances** si le règlement est échelonné.
4. **Accordez les remises** : bourse, exonération, fratrie, commerciale.

Une remise peut être un **montant fixe** ou un **pourcentage**. Elle s'applique
au frais, pas au compte global : vous gardez la trace de ce qui a été réduit et
pourquoi.

> **Exemple** — Scolarité 6ᵉ : 250 000 F CFA. L'élève KOUASSI bénéficie d'une
> bourse de 25 %. Le brut reste 250 000, la remise vaut 62 500, le net dû est
> 187 500. Le bulletin de compte montre les trois lignes : la famille comprend
> ce qu'elle doit et pourquoi.

---

## 5. Pénalités de retard et remise fratrie

**Finances → Pénalités et remises**

L'écran fonctionne **en deux temps**, et c'est délibéré.

### Temps 1 — Définir la règle

Enregistrer une règle **ne modifie aucun compte**. Vous décrivez seulement ce
que l'établissement a décidé.

**Pénalités** : montant fixe, pourcentage une fois, ou pourcentage par jour.
Avec un délai de tolérance et, surtout, un **plafond**.

> En mode « par jour », mettez toujours un plafond. 0,5 % par jour sur
> 200 jours dépasserait le montant de l'échéance elle-même.

**Remise fratrie** : des paliers — par exemple 5 % à partir de 2 enfants, 10 %
à partir de 3 — et les catégories de frais concernées.

### Temps 2 — Appliquer

L'écran affiche **l'aperçu** : quelles familles, quels montants. Vous relisez,
puis vous déclenchez. L'opération est inscrite au journal d'audit.

Deux garanties :

- **La pénalité porte sur le reste dû**, pas sur le montant initial. Une
  famille qui a réglé l'essentiel n'est pas pénalisée comme si elle n'avait
  rien versé.
- **La pénalité est recalculée, jamais cumulée.** Relancer le traitement deux
  fois le même jour ne la double pas.

Une remise fratrie **déjà accordée n'est jamais écrasée** : vous avez pu
négocier un taux particulier avec une famille.

> **Exemple** — Échéance de 100 000 F CFA due le 10 janvier, dont 60 000 déjà
> versés. Règle : 5 % une fois, tolérance 7 jours. Au 25 janvier, le retard
> dépasse la tolérance : la pénalité est de **5 % de 40 000 = 2 000 F CFA**, et
> non 5 000.

---

## 6. Les dépenses

**Finances → Dépenses**

Le cycle : **Brouillon → Demande → Approuvée → Payée**. Une dépense peut aussi
être **Rejetée** (avec motif) ou **Annulée**.

Seule une dépense **payée** sort de la trésorerie. Une dépense approuvée est un
engagement, pas un décaissement — ne la comptez pas comme une sortie.

Joignez la facture du fournisseur via **Pièce jointe**.

---

## 7. La comptabilité

**Finances → Comptabilité**

L'application tient une comptabilité en **partie double** sur un plan de
comptes SYSCOHADA. Chaque encaissement, chaque dépense payée, chaque
annulation produit une écriture équilibrée automatiquement.

Vous y trouvez :

- **Journal** : toutes les écritures, dans l'ordre
- **Balance générale** : débits et crédits par compte
- **Compte de résultat** : produits et charges
- **Bilan** : actif et passif, avec un indicateur d'équilibre

> **Si le bilan signale un déséquilibre**, ne le corrigez pas à la main :
> signalez-le. Un bilan déséquilibré révèle une anomalie en amont, et la
> masquer la rendrait introuvable.

Le résultat n'est **jamais** déduit des seuls encaissements et dépenses : il
vient des écritures. Un règlement d'avance n'est pas un produit de l'exercice.

---

## 8. Le rapprochement bancaire

**Finances → Rapprochement bancaire**

1. Choisissez le compte et la période.
2. Saisissez le **solde final du relevé** de la banque.
3. L'application reconstitue le **solde comptable** : solde d'ouverture
   + encaissements validés − dépenses payées.
4. L'**écart** est figé.

**L'écart n'est jamais corrigé automatiquement et aucune écriture n'est
passée.** Si l'écart n'est pas nul, la clôture **exige une explication
écrite** : chèques en circulation, virement non crédité, frais bancaires.

Clore en silence un rapprochement qui ne tombe pas juste reviendrait à effacer
le problème au lieu de le traiter.

> **Exemple** — Relevé au 31 janvier : 4 850 000 F CFA. Solde comptable :
> 4 900 000. Écart : **−50 000**. Vous identifiez un chèque fournisseur de
> 50 000 émis le 28 mais non encore débité. Vous clôturez avec cette
> explication. Le mois suivant, l'écart disparaît de lui-même.

---

## 9. Exemple d'une journée type

**8 h 30 — Les justificatifs.** 6 dépôts pendant la nuit. Vous ouvrez le
compte Mobile Money : 4 versements correspondent, 1 a été rejeté par
l'opérateur, 1 est un doublon du dépôt de la veille. Vous acceptez les 4,
refusez les 2 avec un motif clair. Les 6 familles sont notifiées.

**10 h — Une annulation.** Le caissier signale une erreur de saisie. Vous
annulez avec motif, il ressaisit le bon montant.

**11 h — Les pénalités.** Fin de mois. **Pénalités et remises** → l'aperçu
annonce 23 échéances concernées, 46 000 F CFA au total. Vous relisez, vous
appliquez.

**14 h — Une dépense.** Facture d'électricité, 180 000 F CFA. Vous saisissez,
joignez la facture, approuvez, puis marquez payée après le virement.

**16 h — Le rapprochement.** Relevé bancaire reçu. Écart de −50 000 expliqué
par un chèque en circulation. Vous clôturez avec l'explication.

**17 h — Le contrôle.** **Rapports et exports** → vous exportez les
encaissements du jour et les impayés pour la direction.

---

## 10. Erreurs fréquentes

**« Les recettes ne correspondent pas aux justificatifs déposés. »**
Normal : les justificatifs en attente ne sont pas des recettes. Seuls les
acceptés comptent.

**« J'ai accepté un justificatif par erreur. »**
Annulez l'encaissement qu'il a produit, avec motif. Le justificatif reste à
l'historique avec sa décision.

**« La trésorerie semble négative après une annulation. »**
Elle ne doit pas l'être. L'écriture d'origine et sa contrepassation restent
toutes deux au grand livre et s'annulent. Si un solde paraît aberrant,
signalez-le plutôt que de le corriger à la main.

**« Je ne peux pas clôturer un rapprochement. »**
L'écart n'est pas nul et l'explication est vide. C'est le garde-fou qui joue
son rôle.

---

## 11. Limites à connaître

- **Aucune lecture automatique des reçus.** Vous lisez, vous décidez.
- **Aucun prestataire de paiement raccordé.**
- **Pas d'écritures de clôture ni de report à nouveau.** Les comptes existent
  au plan, le traitement de fin d'exercice n'est pas automatisé.
- **Pas de prévision de trésorerie.**
- **Export en CSV**, pas en .xlsx natif. Le CSV s'ouvre dans Excel et
  LibreOffice.
