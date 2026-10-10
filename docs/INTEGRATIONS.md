# Integrations externes a configurer

> **Aucune integration externe n'est branchee dans cette version.**
>
> Les contrats sont definis, les champs existent en base, et l'interface
> affiche honnetement l'etat de chaque integration. Mais **aucun prestataire
> n'est implemente**. Ne presentez jamais une de ces fonctions comme active
> tant qu'elle n'a pas ete implementee, configuree **et testee**.

L'etat reel est consultable dans l'application : **Parametres → Integrations
externes**, alimente par [`src/lib/integrations.ts`](../src/lib/integrations.ts).

---

## Tableau de synthese

| Integration | Etat | Impact si absente |
|---|---|---|
| Paiement en ligne | Non implemente | Les reglements se saisissent en caisse ; les familles deposent un justificatif |
| E-mail (SMTP) | Non implemente | Les notifications restent consultables dans l'application |
| SMS | Non implemente | Idem |
| WhatsApp | Non implemente | Idem |
| OCR des justificatifs | Non implemente | Verification manuelle — **c'est de toute facon obligatoire** |
| IA (synthese, anomalies) | Non implemente | Aucun |

Aucune de ces absences n'empeche l'application de fonctionner.

---

## 1. Paiement en ligne (Mobile Money, carte)

### Variables

```ini
PAYMENT_PROVIDER="none"          # none | wave | orange_money | mtn_momo | stripe
PAYMENT_PROVIDER_MODE="test"     # test | live
PAYMENT_PROVIDER_API_KEY=""
PAYMENT_PROVIDER_WEBHOOK_SECRET=""
```

### Contrat a implementer

```ts
interface PaymentProvider {
  createIntent(intent: PaymentIntent): Promise<{ providerReference: string; redirectUrl: string }>;
  verifyWebhook(payload: string, signature: string): Promise<boolean>;
  parseWebhook(payload: string): Promise<{ providerReference: string; status: string; amountMinor: number }>;
}
```

Implementez-le, puis faites retourner votre instance par `getPaymentProvider()`.

### Regles imperatives

1. **Verifiez la signature du webhook** avant tout traitement. Un webhook non
   signe est une porte ouverte a la creation d'encaissements fictifs.
2. **Soyez idempotent.** Les prestataires rejouent les webhooks. Appelez
   `recordPayment()` avec une cle derivee de la reference prestataire :

   ```ts
   idempotencyKey: `provider:${providerReference}`
   ```

   Le double encaissement sera alors impossible, comme pour la caisse.
3. **N'encaissez que sur confirmation du prestataire**, jamais sur la redirection
   du navigateur : l'utilisateur peut la forger.
4. **Rapprochez.** Comparez periodiquement le journal du prestataire et les
   encaissements enregistres.
5. **`PAYMENT_PROVIDER_MODE=test` ne doit jamais passer pour de la production.**
   L'interface distingue les deux ; conservez cette distinction.

### Avant d'annoncer la fonction

- [ ] Webhook signe et verifie
- [ ] Idempotence testee par rejeu d'un meme webhook
- [ ] Paiement reel de bout en bout en mode `live`
- [ ] Echec et annulation testes
- [ ] Rapprochement verifie sur une journee complete

---

## 2. E-mail (SMTP)

```ini
MAIL_DRIVER="log"          # log | smtp
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
MAIL_FROM="no-reply@votre-ecole.ci"
```

Avec `MAIL_DRIVER=log`, `sendMail()` journalise le message et retourne `false` :
l'appelant **sait** que rien n'est parti. Ce comportement est volontaire —
aucune fonction ne doit afficher « e-mail envoye » sans envoi reel.

Implementez l'envoi SMTP dans `sendMail()`
([`src/lib/integrations.ts`](../src/lib/integrations.ts)).

**Ce que l'e-mail debloquerait :** reinitialisation autonome du mot de passe
(aujourd'hui faite par un administrateur), envoi des bulletins et recus,
relances d'echeance.

**Attention aux donnees personnelles.** Un bulletin ou un releve de compte en
piece jointe transite en clair. Preferez une notification renvoyant vers
l'application.

---

## 3. SMS et WhatsApp

```ini
SMS_DRIVER="none"          # none | twilio | orange_sms
SMS_API_KEY=""
WHATSAPP_DRIVER="none"
```

```ts
interface SmsProvider {
  send(message: { to: string; text: string }): Promise<void>;
}
```

Canal pertinent en Cote d'Ivoire, ou le SMS atteint les familles plus surement
que l'e-mail.

Points d'attention : normalisez les numeros au format international ;
le cout etant par message, limitez-vous aux evenements importants (absence,
paiement valide, echeance) ; un message non delivre doit etre marque `FAILED`,
jamais `SENT`.

---

## 4. OCR des justificatifs

```ini
OCR_DRIVER="none"          # none | tesseract | external
```

```ts
interface OcrProvider {
  extract(file: { buffer: Buffer; mimeType: string }): Promise<OcrResult>;
}
```

Les champs `ocrExtract` et `ocrStatus` existent sur `PaymentProof`.

### Regle absolue

> **Une extraction OCR ne valide JAMAIS un paiement.**

L'OCR pre-remplit le montant et la reference pour faire gagner du temps au
comptable. La validation reste **toujours** un acte humain, conformement a la
section 15 du cahier des charges. L'interface le rappelle explicitement a
l'ecran d'arbitrage.

Si vous implementez un OCR externe, n'oubliez pas qu'un justificatif contient
des donnees personnelles et bancaires : verifiez les conditions du prestataire
et la localisation du traitement.

---

## 5. Assistance IA

```ini
AI_DRIVER="none"               # none | anthropic | openai
AI_API_KEY=""
AI_SEND_PERSONAL_DATA="false"  # consentement requis avant activation
```

### Usages envisages

- Synthese de rapports financiers ou pedagogiques
- Detection d'anomalies de rapprochement
- Reponses aux questions a partir des donnees **accessibles a l'utilisateur**

### Garde-fous a respecter

1. **L'IA ne publie aucune note** et ne prend **aucune decision penalisante**
   concernant un eleve.
2. **Respectez les permissions.** Une synthese ne doit jamais exposer des
   donnees que l'utilisateur ne peut pas consulter lui-meme.
3. **Minimisez les donnees envoyees.** `AI_SEND_PERSONAL_DATA=false` par defaut.
   Transmettez des agregats plutot que des dossiers nominatifs.
4. **Consentement.** Informez les familles avant tout envoi de donnees
   personnelles a un service tiers.
5. **Signalez les contenus generes** comme tels dans l'interface.

---

## 6. Ajouter une integration : marche a suivre

1. Declarez les variables dans `.env.example`, **sans valeur reelle**.
2. Ajoutez la lecture dans `src/lib/env.ts`.
3. Decrivez l'etat dans `listIntegrations()` — l'ecran Parametres s'actualise seul.
4. Definissez le contrat (`interface`) dans `src/lib/integrations.ts`.
5. Implementez l'adaptateur dans `src/lib/integrations/<prestataire>.ts`.
6. Faites-le retourner par la fabrique correspondante.
7. **Ecrivez des tests**, notamment sur l'idempotence et la gestion d'echec.
8. Documentez la procedure de test et de bascule ici.

> Tant que ces etapes ne sont pas faites, la fabrique leve
> `IntegrationNotConfiguredError` : un echec explicite, jamais un faux succes.
> **Conservez ce comportement.**
