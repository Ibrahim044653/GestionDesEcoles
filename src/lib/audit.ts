import { prisma, type Db } from "@/lib/prisma";

/**
 * Journal d'audit.
 *
 * Regle : aucune donnee sensible dans `metadata`. Les cles ci-dessous sont
 * supprimees avant ecriture, y compris en profondeur, pour qu'un appelant
 * distrait ne puisse pas faire fuiter un mot de passe ou une cle API.
 */
const FORBIDDEN_KEYS = [
  "password",
  "passwordhash",
  "motdepasse",
  "token",
  "tokenhash",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "sessionsecret",
];

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[profondeur max]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(key.toLowerCase().replace(/[^a-z_]/g, ""))) {
        result[key] = "[masque]";
        continue;
      }
      result[key] = sanitize(entry, depth + 1);
    }
    return result;
  }

  if (typeof value === "string") return value.slice(0, 500);
  return value;
}

export type AuditInput = {
  action: string;
  schoolId?: string | null;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Enregistre un evenement d'audit.
 *
 * Volontairement tolerant aux pannes : un echec d'ecriture du journal ne doit
 * jamais faire echouer l'operation metier deja validee. L'echec est signale
 * dans les logs serveur.
 */
export async function recordAudit(input: AuditInput, db: Db = prisma): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        action: input.action,
        schoolId: input.schoolId ?? null,
        userId: input.userId ?? null,
        entityType: input.entityType ?? "",
        entityId: input.entityId ?? "",
        metadata: JSON.stringify(sanitize(input.metadata ?? {})),
        ipAddress: (input.ipAddress ?? "").slice(0, 64),
        userAgent: (input.userAgent ?? "").slice(0, 255),
      },
    });
  } catch (error) {
    console.error("[audit] ecriture impossible", { action: input.action, error });
  }
}

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILED: "auth.login.failed",
  LOGIN_LOCKED: "auth.login.locked",
  LOGOUT: "auth.logout",
  PASSWORD_CHANGED: "auth.password.changed",
  SCHOOL_SWITCHED: "auth.school.switched",
  ACCESS_DENIED: "security.access_denied",
  CROSS_TENANT_ATTEMPT: "security.cross_tenant_attempt",

  STUDENT_CREATED: "student.created",
  STUDENT_UPDATED: "student.updated",
  STUDENT_ARCHIVED: "student.archived",
  STUDENT_IMPORTED: "student.imported",

  FEE_ASSIGNED: "fee.assigned",
  DISCOUNT_GRANTED: "discount.granted",

  PAYMENT_CREATED: "payment.created",
  PAYMENT_CANCELLED: "payment.cancelled",
  PAYMENT_DUPLICATE_BLOCKED: "payment.duplicate_blocked",
  RECEIPT_ISSUED: "receipt.issued",

  PROOF_SUBMITTED: "proof.submitted",
  PROOF_ACCEPTED: "proof.accepted",
  PROOF_REJECTED: "proof.rejected",

  REFUND_REQUESTED: "refund.requested",
  REFUND_APPROVED: "refund.approved",

  GRADE_ENTERED: "grade.entered",
  GRADE_REVISED: "grade.revised",
  GRADES_PUBLISHED: "grade.published",
  REPORTCARD_GENERATED: "reportcard.generated",

  EXPENSE_CREATED: "expense.created",
  EXPENSE_APPROVED: "expense.approved",
  EXPENSE_PAID: "expense.paid",

  JOURNAL_POSTED: "journal.posted",
  JOURNAL_REVERSED: "journal.reversed",
  PERIOD_CLOSED: "period.closed",
  YEAR_CLOSED: "year.closed",

  FILE_DOWNLOADED: "file.downloaded",
  SUBSCRIPTION_CHANGED: "saas.subscription.changed",
} as const;
