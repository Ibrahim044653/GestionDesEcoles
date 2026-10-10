import { env } from "./env";

/**
 * INTEGRATIONS EXTERNES - interfaces uniquement.
 *
 * Aucune de ces integrations n'est reellement branchee. Ce fichier definit les
 * contrats et un etat explicite, pour que l'application :
 *   - n'affiche jamais une fonctionnalite externe comme active alors qu'elle
 *     ne l'est pas ;
 *   - distingue clairement le mode TEST du mode PRODUCTION ;
 *   - echoue de maniere lisible plutot que de simuler un succes.
 *
 * Brancher un prestataire = implementer l'adaptateur correspondant et renseigner
 * les variables d'environnement. Voir docs/INTEGRATIONS.md.
 */

export type IntegrationStatus = {
  key: string;
  label: string;
  /** Un prestataire est-il designe dans la configuration ? */
  configured: boolean;
  /** L'integration est-elle reellement operationnelle ? */
  available: boolean;
  mode: "test" | "live" | "desactive";
  provider: string;
  /** Explication affichee a l'administrateur. */
  note: string;
};

export class IntegrationNotConfiguredError extends Error {
  constructor(integration: string) {
    super(
      `L'integration "${integration}" n'est pas configuree. ` +
        "Renseignez le prestataire dans le fichier .env, puis testez-la avant de l'activer.",
    );
    this.name = "IntegrationNotConfiguredError";
  }
}

/** Etat de toutes les integrations, pour l'ecran d'administration. */
export function listIntegrations(): IntegrationStatus[] {
  const { payment, mail, sms, whatsapp, ocr, ai } = env.integrations;

  return [
    {
      key: "payment",
      label: "Paiement en ligne (Mobile Money / carte)",
      configured: payment.configured,
      // Jamais "disponible" tant qu'une cle n'est pas fournie ET testee.
      available: payment.configured && payment.mode === "live",
      mode: payment.configured ? (payment.mode as "test" | "live") : "desactive",
      provider: payment.provider,
      note: payment.configured
        ? payment.mode === "test"
          ? "Prestataire configure en MODE TEST. Aucun paiement reel n'est encaisse."
          : "Prestataire configure en mode production. Verifiez la reconciliation avant usage."
        : "Aucun prestataire configure. Les paiements se saisissent manuellement en caisse.",
    },
    {
      key: "mail",
      label: "Envoi d'e-mails",
      configured: mail.configured,
      available: mail.configured,
      mode: mail.configured ? "live" : "desactive",
      provider: mail.driver,
      note: mail.configured
        ? "SMTP configure."
        : "Aucun serveur SMTP. Les notifications restent consultables dans l'application.",
    },
    {
      key: "sms",
      label: "SMS",
      configured: sms.configured,
      available: sms.configured,
      mode: sms.configured ? "live" : "desactive",
      provider: sms.driver,
      note: sms.configured ? "Prestataire SMS configure." : "Aucun prestataire SMS configure.",
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      configured: whatsapp.configured,
      available: whatsapp.configured,
      mode: whatsapp.configured ? "live" : "desactive",
      provider: whatsapp.driver,
      note: whatsapp.configured ? "Prestataire WhatsApp configure." : "Aucun prestataire configure.",
    },
    {
      key: "ocr",
      label: "OCR des justificatifs",
      configured: ocr.configured,
      available: ocr.configured,
      mode: ocr.configured ? "live" : "desactive",
      provider: ocr.driver,
      note:
        "Une extraction OCR est indicative : elle ne valide JAMAIS seule un paiement. " +
        "La confirmation par un comptable reste obligatoire.",
    },
    {
      key: "ai",
      label: "Assistance IA (synthese, anomalies)",
      configured: ai.configured,
      available: ai.configured,
      mode: ai.configured ? "live" : "desactive",
      provider: ai.driver,
      note:
        "L'IA ne publie aucune note et ne prend aucune decision penalisante. " +
        (ai.maySendPersonalData
          ? "L'envoi de donnees personnelles est AUTORISE par configuration : verifiez le consentement."
          : "L'envoi de donnees personnelles est desactive."),
    },
  ];
}

// ---------------------------------------------------------------------------
// Contrats des adaptateurs (a implementer lors du branchement reel)
// ---------------------------------------------------------------------------

export type PaymentIntent = {
  schoolId: string;
  studentId: string;
  amountMinor: number;
  currency: string;
  description: string;
  idempotencyKey: string;
};

export interface PaymentProvider {
  createIntent(intent: PaymentIntent): Promise<{ providerReference: string; redirectUrl: string }>;
  verifyWebhook(payload: string, signature: string): Promise<boolean>;
  /** Doit etre idempotent : un webhook peut etre rejoue par le prestataire. */
  parseWebhook(payload: string): Promise<{ providerReference: string; status: string; amountMinor: number }>;
}

export interface MailProvider {
  send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

export interface SmsProvider {
  send(message: { to: string; text: string }): Promise<void>;
}

export type OcrResult = {
  /** Montant detecte, en unites mineures. Toujours a confirmer par un humain. */
  amountMinor: number | null;
  reference: string | null;
  date: Date | null;
  rawText: string;
  /** Indice de confiance 0..100 fourni par le moteur. */
  confidence: number;
};

export interface OcrProvider {
  extract(file: { buffer: Buffer; mimeType: string }): Promise<OcrResult>;
}

/**
 * Resolution des adaptateurs.
 * Tant qu'aucun prestataire n'est implemente, ces fabriques levent une erreur
 * explicite plutot que de renvoyer un faux succes.
 */
export function getPaymentProvider(): PaymentProvider {
  throw new IntegrationNotConfiguredError("paiement en ligne");
}

export function getSmsProvider(): SmsProvider {
  throw new IntegrationNotConfiguredError("SMS");
}

export function getOcrProvider(): OcrProvider {
  throw new IntegrationNotConfiguredError("OCR");
}

/**
 * Envoi d'e-mail. En l'absence de SMTP configure, le message est journalise
 * cote serveur et la fonction retourne `false` : l'appelant sait que rien n'est
 * parti et peut en informer l'utilisateur.
 */
export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!env.integrations.mail.configured) {
    console.info("[mail non configure] message non envoye", {
      to: message.to,
      subject: message.subject,
    });
    return false;
  }
  // Implementer ici l'envoi SMTP reel lors du branchement.
  throw new IntegrationNotConfiguredError("e-mail (SMTP declare mais adaptateur non implemente)");
}
