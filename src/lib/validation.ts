import { z } from "zod";
import { ValidationError } from "./errors";
import { parseAmountToMinor, currencyDecimals } from "./money";
import {
  ATTENDANCE_STATUSES,
  DISCOUNT_KINDS,
  EVALUATION_KINDS,
  FEE_CATEGORIES,
  PAYMENT_METHODS,
  ROLES,
  SCHOOL_TYPES,
} from "./constants";

/**
 * Schemas de validation serveur.
 *
 * Toute donnee entrante est validee ICI, cote serveur, independamment de ce
 * que fait le navigateur. Les messages sont en francais et destines a etre
 * affiches directement sous le champ concerne.
 */

const requiredText = (label: string, max = 255) =>
  z
    .string({ required_error: `${label} est obligatoire.` })
    .trim()
    .min(1, `${label} est obligatoire.`)
    .max(max, `${label} ne doit pas depasser ${max} caracteres.`);

const optionalText = (max = 255) => z.string().trim().max(max).optional().default("");

export const emailSchema = z
  .string({ required_error: "L'adresse e-mail est obligatoire." })
  .trim()
  .toLowerCase()
  .min(1, "L'adresse e-mail est obligatoire.")
  .email("Adresse e-mail invalide.");

/** Numero de telephone ivoirien ou international, format souple. */
export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine((value) => value === "" || /^[+]?[\d\s().-]{8,}$/.test(value), {
    message: "Numero de telephone invalide.",
  })
  .optional()
  .default("");

/** Date au format AAAA-MM-JJ renvoyee par <input type="date">. */
export const dateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || !Number.isNaN(new Date(value).getTime()), {
    message: "Date invalide.",
  });

/**
 * Montant saisi par l'utilisateur -> entier en unites mineures.
 * `currency` determine le nombre de decimales acceptees.
 */
export function moneySchema(currency: string, options: { min?: number; label?: string } = {}) {
  const decimals = currencyDecimals(currency);
  const label = options.label ?? "Le montant";

  return z.string().transform((value, context) => {
    try {
      const minor = parseAmountToMinor(value, decimals);
      if (options.min !== undefined && minor < options.min) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            options.min === 1
              ? `${label} doit etre strictement positif.`
              : `${label} doit etre superieur ou egal a ${options.min}.`,
        });
        return z.NEVER;
      }
      return minor;
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : `${label} est invalide.`,
      });
      return z.NEVER;
    }
  });
}

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Le mot de passe est obligatoire."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est obligatoire."),
    newPassword: z.string().min(10, "Le nouveau mot de passe doit contenir au moins 10 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// Etablissement
// ---------------------------------------------------------------------------

export const schoolSchema = z.object({
  name: requiredText("Le nom de l'etablissement"),
  code: requiredText("Le code", 20).regex(
    /^[A-Za-z0-9_-]+$/,
    "Le code ne peut contenir que des lettres, chiffres, tirets et underscores.",
  ),
  type: z.enum(Object.values(SCHOOL_TYPES) as [string, ...string[]]),
  address: optionalText(),
  city: optionalText(120),
  country: z.string().trim().length(2, "Code pays sur 2 lettres (ex. CI).").default("CI"),
  phone: phoneSchema,
  email: z.string().trim().email("Adresse e-mail invalide.").or(z.literal("")).default(""),
  website: optionalText(),
  currency: z.string().trim().length(3, "Code devise sur 3 lettres (ex. XOF).").default("XOF"),
  locale: z.string().trim().max(16).default("fr-CI"),
  matriculePattern: z.string().trim().max(64).default("{SCHOOL}-{YEAR}-{SEQ:4}"),
});

export const academicYearSchema = z
  .object({
    name: requiredText("Le nom de l'annee", 32),
    startDate: dateSchema,
    endDate: dateSchema,
    isCurrent: z.coerce.boolean().default(false),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: "La date de fin doit etre posterieure a la date de debut.",
    path: ["endDate"],
  });

export const classRoomSchema = z.object({
  name: requiredText("Le nom de la classe", 80),
  code: requiredText("Le code", 20),
  levelId: requiredText("Le niveau"),
  trackId: z.string().trim().optional().default(""),
  academicYearId: requiredText("L'annee scolaire"),
  capacity: z.coerce.number().int().min(1, "La capacite doit etre d'au moins 1 place.").max(500),
  roomLabel: optionalText(60),
  mainTeacherId: z.string().trim().optional().default(""),
});

export const subjectSchema = z.object({
  name: requiredText("Le nom de la matiere", 120),
  code: requiredText("Le code", 20),
  defaultCoefficient: z.coerce.number().int().min(1, "Le coefficient doit etre d'au moins 1.").max(20),
  credits: z.coerce.number().int().min(0).max(60).default(0),
  teachingUnitId: z.string().trim().optional().default(""),
});

// ---------------------------------------------------------------------------
// Eleves et personnel
// ---------------------------------------------------------------------------

export const studentSchema = z.object({
  firstName: requiredText("Le prenom", 120),
  lastName: requiredText("Le nom", 120),
  matricule: z.string().trim().max(40).optional().default(""),
  gender: z.enum(["M", "F", "UNSPECIFIED"]).default("UNSPECIFIED"),
  birthDate: dateSchema.optional().default(""),
  birthPlace: optionalText(120),
  nationality: z.string().trim().max(2).default("CI"),
  email: z.string().trim().email("Adresse e-mail invalide.").or(z.literal("")).default(""),
  phone: phoneSchema,
  address: optionalText(),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: phoneSchema,
  previousSchool: optionalText(160),
  bloodGroup: optionalText(8),
  medicalNotes: optionalText(1000),
});

export const enrollmentSchema = z.object({
  studentId: requiredText("L'eleve"),
  academicYearId: requiredText("L'annee scolaire"),
  classRoomId: requiredText("La classe"),
  kind: z.enum(["INSCRIPTION", "REINSCRIPTION", "TRANSFERT_ENTRANT"]).default("INSCRIPTION"),
  applyFees: z.coerce.boolean().default(true),
});

export const guardianSchema = z.object({
  firstName: requiredText("Le prenom", 120),
  lastName: requiredText("Le nom", 120),
  email: z.string().trim().email("Adresse e-mail invalide.").or(z.literal("")).default(""),
  phone: phoneSchema,
  phoneAlt: phoneSchema,
  address: optionalText(),
  profession: optionalText(120),
  relation: z.enum(["PERE", "MERE", "TUTEUR", "AUTRE"]).default("TUTEUR"),
  canViewGrades: z.coerce.boolean().default(true),
  canViewFinance: z.coerce.boolean().default(true),
  /** Creer un acces a l'espace parent pour ce responsable. */
  createAccount: z.coerce.boolean().default(false),
});

export const staffSchema = z.object({
  firstName: requiredText("Le prenom", 120),
  lastName: requiredText("Le nom", 120),
  email: z.string().trim().email("Adresse e-mail invalide.").or(z.literal("")).default(""),
  phone: phoneSchema,
  gender: z.enum(["M", "F", "UNSPECIFIED"]).default("UNSPECIFIED"),
  birthDate: dateSchema.optional().default(""),
  address: optionalText(),
  jobTitle: z
    .enum(["ENSEIGNANT", "DIRECTION", "ADMINISTRATIF", "COMPTABLE", "CAISSIER", "TECHNIQUE"])
    .default("ENSEIGNANT"),
  qualification: optionalText(160),
  contractType: z.enum(["CDI", "CDD", "VACATAIRE", "STAGE"]).default("CDI"),
  contractStart: dateSchema.optional().default(""),
  contractEnd: dateSchema.optional().default(""),
  createAccount: z.coerce.boolean().default(false),
  roleCode: z.enum(Object.values(ROLES) as [string, ...string[]]).optional(),
});

// ---------------------------------------------------------------------------
// Frais et paiements
// ---------------------------------------------------------------------------

export function feeItemSchema(currency: string) {
  return z.object({
    name: requiredText("Le libelle du frais", 160),
    code: requiredText("Le code", 30),
    category: z.enum(Object.values(FEE_CATEGORIES) as [string, ...string[]]),
    amount: moneySchema(currency, { min: 0, label: "Le montant du frais" }),
    academicYearId: requiredText("L'annee scolaire"),
    levelId: z.string().trim().optional().default(""),
    trackId: z.string().trim().optional().default(""),
    classRoomId: z.string().trim().optional().default(""),
    isMandatory: z.coerce.boolean().default(true),
    autoAssign: z.coerce.boolean().default(true),
  });
}

export function paymentSchema(currency: string) {
  return z.object({
    studentId: requiredText("L'eleve"),
    amount: moneySchema(currency, { min: 1, label: "Le montant encaisse" }),
    method: z.enum(Object.values(PAYMENT_METHODS) as [string, ...string[]]),
    paidAt: dateSchema,
    externalReference: optionalText(80),
    financialAccountId: z.string().trim().optional().default(""),
    note: optionalText(500),
    /** Fournie par le formulaire pour rendre la soumission idempotente. */
    idempotencyKey: z.string().trim().min(8).max(100),
  });
}

export function proofSchema(currency: string) {
  return z.object({
    studentId: requiredText("L'eleve"),
    declaredAmount: moneySchema(currency, { min: 1, label: "Le montant declare" }),
    declaredMethod: z.enum(Object.values(PAYMENT_METHODS) as [string, ...string[]]),
    declaredReference: optionalText(80),
    declaredPaidAt: dateSchema.optional().default(""),
  });
}

export const proofReviewSchema = z
  .object({
    proofId: requiredText("Le justificatif"),
    decision: z.enum(["ACCEPTE", "REJETE"]),
    rejectionReason: optionalText(500),
    confirmedAmount: z.string().optional().default(""),
    financialAccountId: z.string().trim().optional().default(""),
  })
  .refine((data) => data.decision !== "REJETE" || data.rejectionReason.trim().length >= 5, {
    message: "Indiquez un motif de rejet d'au moins 5 caracteres : la famille doit comprendre.",
    path: ["rejectionReason"],
  });

export function discountSchema(currency: string) {
  return z
    .object({
      feeAssignmentId: requiredText("Le frais"),
      kind: z.enum(Object.values(DISCOUNT_KINDS) as [string, ...string[]]),
      label: requiredText("Le libelle de la remise", 120),
      mode: z.enum(["MONTANT", "POURCENTAGE"]),
      amount: z.string().optional().default(""),
      percent: z.string().optional().default(""),
      reason: optionalText(500),
    })
    .superRefine((data, context) => {
      if (data.mode === "MONTANT") {
        try {
          const minor = parseAmountToMinor(data.amount, currencyDecimals(currency));
          if (minor <= 0) throw new Error("Le montant doit etre strictement positif.");
        } catch (error) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["amount"],
            message: error instanceof Error ? error.message : "Montant invalide.",
          });
        }
        return;
      }

      const percent = Number.parseFloat(data.percent.replace(",", "."));
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["percent"],
          message: "Le pourcentage doit etre compris entre 0 et 100.",
        });
      }
    });
}

export function expenseSchema(currency: string) {
  return z.object({
    label: requiredText("Le libelle de la depense", 160),
    categoryId: requiredText("La categorie"),
    supplierId: z.string().trim().optional().default(""),
    amount: moneySchema(currency, { min: 1, label: "Le montant de la depense" }),
    description: optionalText(1000),
    invoiceNumber: optionalText(60),
    invoiceDate: dateSchema.optional().default(""),
    dueDate: dateSchema.optional().default(""),
    paymentMethod: z.enum(Object.values(PAYMENT_METHODS) as [string, ...string[]]).default("ESPECES"),
    financialAccountId: z.string().trim().optional().default(""),
  });
}

// ---------------------------------------------------------------------------
// Pedagogie
// ---------------------------------------------------------------------------

export const evaluationSchema = z.object({
  title: requiredText("Le titre de l'evaluation", 160),
  classRoomId: requiredText("La classe"),
  subjectId: requiredText("La matiere"),
  gradingPeriodId: requiredText("La periode"),
  kind: z.enum(Object.values(EVALUATION_KINDS) as [string, ...string[]]),
  date: dateSchema,
  maxScore: z.coerce.number().int().min(1, "Le bareme doit etre d'au moins 1.").max(100),
  coefficient: z.coerce.number().int().min(1, "Le coefficient doit etre d'au moins 1.").max(20),
  examSession: z.enum(["NORMALE", "RATTRAPAGE"]).default("NORMALE"),
});

export const attendanceSchema = z.object({
  classRoomId: requiredText("La classe"),
  subjectId: z.string().trim().optional().default(""),
  date: dateSchema,
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(Object.values(ATTENDANCE_STATUSES) as [string, ...string[]]),
        minutesLate: z.coerce.number().int().min(0).max(600).default(0),
        justification: z.string().trim().max(300).optional().default(""),
      }),
    )
    .min(1, "Aucun eleve a enregistrer."),
});

export const assignmentSchema = z.object({
  title: requiredText("Le titre du devoir", 160),
  classRoomId: requiredText("La classe"),
  subjectId: requiredText("La matiere"),
  description: optionalText(4000),
  dueAt: dateSchema,
  maxScore: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/**
 * Valide un FormData et convertit les erreurs Zod en ValidationError exploitable
 * par les formulaires (erreurs rattachees aux champs).
 */
export function parseFormData<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const raw: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;

    // Les cases a cocher HTML renvoient "on" ; les champs repetes forment un tableau.
    if (key in raw) {
      const existing = raw[key];
      raw[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      raw[key] = value === "on" ? "true" : value;
    }
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_global";
      (fieldErrors[path] ??= []).push(issue.message);
    }
    throw new ValidationError("Certaines informations sont invalides.", fieldErrors);
  }

  return result.data;
}

/** Variante pour un objet deja desserialise (API JSON). */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_global";
      (fieldErrors[path] ??= []).push(issue.message);
    }
    throw new ValidationError("Certaines informations sont invalides.", fieldErrors);
  }

  return result.data;
}
