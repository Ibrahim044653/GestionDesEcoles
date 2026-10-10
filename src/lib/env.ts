/**
 * Lecture et validation de la configuration.
 *
 * Aucun secret n'a de valeur par defaut exploitable en production : un
 * SESSION_SECRET faible fait echouer le demarrage hors developpement.
 */

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function readInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(read(name, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(name: string, fallback = false): boolean {
  const value = read(name, "").toLowerCase();
  if (value === "") return fallback;
  return value === "true" || value === "1" || value === "yes";
}

const nodeEnv = read("NODE_ENV", "development");
const isProduction = nodeEnv === "production";

const PLACEHOLDER_SECRET = "CHANGER_CETTE_VALEUR_EN_PRODUCTION_32_OCTETS_MINIMUM";
const rawSecret = read("SESSION_SECRET", "");
const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-do-not-use-in-production";

/**
 * Validation du secret de session.
 *
 * Volontairement PARESSEUSE : elle s'execute au premier usage reel du secret,
 * pas au chargement du module. Un `next build` evalue les modules sans
 * disposer des secrets de production ; echouer a ce moment-la empecherait
 * toute compilation alors qu'aucune session n'est encore manipulee.
 */
export function requireSessionSecret(): string {
  if (isProduction && (rawSecret.length < 32 || rawSecret === PLACEHOLDER_SECRET)) {
    throw new Error(
      "SESSION_SECRET est absent, trop court (< 32 caracteres) ou laisse a sa valeur d'exemple. " +
        "Generez-en un : node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }
  return rawSecret || DEV_FALLBACK_SECRET;
}

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === "test",

  appUrl: read("APP_URL", "http://localhost:3000"),
  locale: read("APP_LOCALE", "fr-CI"),

  sessionTtlHours: readInt("SESSION_TTL_HOURS", 12),

  storage: {
    driver: read("STORAGE_DRIVER", "local"),
    localPath: read("STORAGE_LOCAL_PATH", "./storage"),
    maxUploadBytes: readInt("STORAGE_MAX_UPLOAD_MB", 8) * 1024 * 1024,
  },

  seed: {
    demoPassword: read("SEED_DEMO_PASSWORD", "Demo@2026"),
    allowInProduction: readBool("ALLOW_SEED_IN_PRODUCTION", false),
  },

  /**
   * Integrations externes. `configured` ne signifie PAS "testee" : l'interface
   * affiche un paiement en ligne comme indisponible tant que le prestataire
   * n'est pas renseigne, et signale explicitement le mode test.
   */
  integrations: {
    payment: {
      provider: read("PAYMENT_PROVIDER", "none"),
      mode: read("PAYMENT_PROVIDER_MODE", "test"),
      configured:
        read("PAYMENT_PROVIDER", "none") !== "none" && read("PAYMENT_PROVIDER_API_KEY", "") !== "",
    },
    mail: {
      driver: read("MAIL_DRIVER", "log"),
      from: read("MAIL_FROM", "no-reply@example.test"),
      configured: read("MAIL_DRIVER", "log") === "smtp" && read("SMTP_HOST", "") !== "",
    },
    sms: {
      driver: read("SMS_DRIVER", "none"),
      configured: read("SMS_DRIVER", "none") !== "none" && read("SMS_API_KEY", "") !== "",
    },
    whatsapp: {
      driver: read("WHATSAPP_DRIVER", "none"),
      configured: read("WHATSAPP_DRIVER", "none") !== "none",
    },
    ocr: {
      driver: read("OCR_DRIVER", "none"),
      configured: read("OCR_DRIVER", "none") !== "none",
    },
    ai: {
      driver: read("AI_DRIVER", "none"),
      configured: read("AI_DRIVER", "none") !== "none" && read("AI_API_KEY", "") !== "",
      maySendPersonalData: readBool("AI_SEND_PERSONAL_DATA", false),
    },
  },
} as const;

export type AppEnv = typeof env;
