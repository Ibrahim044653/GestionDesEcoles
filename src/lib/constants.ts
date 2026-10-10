/**
 * Vocabulaire metier centralise.
 *
 * Le schema Prisma stocke les statuts sous forme de chaines (portabilite
 * SQLite <-> PostgreSQL). Ces constantes sont la source de verite : elles
 * alimentent la validation Zod, les libelles d'interface et les tests.
 */

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  OWNER: "OWNER",
  DIRECTOR: "DIRECTOR",
  ACADEMIC_HEAD: "ACADEMIC_HEAD",
  ACCOUNTANT: "ACCOUNTANT",
  CASHIER: "CASHIER",
  TEACHER: "TEACHER",
  GUARDIAN: "GUARDIAN",
  STUDENT: "STUDENT",
} as const;
export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: "Super-administrateur SaaS",
  OWNER: "Proprietaire",
  DIRECTOR: "Directeur",
  ACADEMIC_HEAD: "Responsable pedagogique",
  ACCOUNTANT: "Comptable",
  CASHIER: "Caissier",
  TEACHER: "Enseignant",
  GUARDIAN: "Parent / tuteur",
  STUDENT: "Eleve / etudiant",
};

/** Plus le rang est petit, plus le role est privilegie. */
export const ROLE_RANKS: Record<RoleCode, number> = {
  SUPER_ADMIN: 0,
  OWNER: 10,
  DIRECTOR: 20,
  ACADEMIC_HEAD: 30,
  ACCOUNTANT: 40,
  CASHIER: 50,
  TEACHER: 60,
  GUARDIAN: 80,
  STUDENT: 90,
};

/** Roles qui appartiennent au personnel de l'etablissement. */
export const STAFF_ROLES: RoleCode[] = [
  ROLES.OWNER,
  ROLES.DIRECTOR,
  ROLES.ACADEMIC_HEAD,
  ROLES.ACCOUNTANT,
  ROLES.CASHIER,
  ROLES.TEACHER,
];

export const SCHOOL_TYPES = {
  PRESCOLAIRE: "PRESCOLAIRE",
  PRIMAIRE: "PRIMAIRE",
  COLLEGE: "COLLEGE",
  LYCEE: "LYCEE",
  UNIVERSITE: "UNIVERSITE",
  FORMATION_PRO: "FORMATION_PRO",
} as const;
export type SchoolType = (typeof SCHOOL_TYPES)[keyof typeof SCHOOL_TYPES];

export const SCHOOL_TYPE_LABELS: Record<SchoolType, string> = {
  PRESCOLAIRE: "Prescolaire",
  PRIMAIRE: "Primaire",
  COLLEGE: "College",
  LYCEE: "Lycee",
  UNIVERSITE: "Universite",
  FORMATION_PRO: "Formation professionnelle",
};

/** Etablissements fonctionnant en semestres / credits (regles LMD). */
export const HIGHER_EDUCATION_TYPES: SchoolType[] = ["UNIVERSITE", "FORMATION_PRO"];

export const STUDENT_STATUSES = {
  ACTIVE: "ACTIVE",
  TRANSFERRED: "TRANSFERRED",
  GRADUATED: "GRADUATED",
  DROPPED: "DROPPED",
  ARCHIVED: "ARCHIVED",
} as const;

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Inscrit",
  TRANSFERRED: "Transfere",
  GRADUATED: "Diplome",
  DROPPED: "Abandon",
  ARCHIVED: "Archive",
};

export const ENROLLMENT_DECISIONS = {
  EN_ATTENTE: "EN_ATTENTE",
  ADMIS: "ADMIS",
  REDOUBLE: "REDOUBLE",
  EXCLU: "EXCLU",
  ORIENTE: "ORIENTE",
} as const;

export const PAYMENT_METHODS = {
  ESPECES: "ESPECES",
  VIREMENT: "VIREMENT",
  CHEQUE: "CHEQUE",
  MOBILE_MONEY: "MOBILE_MONEY",
  EN_LIGNE: "EN_LIGNE",
} as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ESPECES: "Especes",
  VIREMENT: "Virement bancaire",
  CHEQUE: "Cheque",
  MOBILE_MONEY: "Mobile Money",
  EN_LIGNE: "Paiement en ligne",
};

export const PAYMENT_STATUSES = {
  VALIDATED: "VALIDATED",
  CANCELLED: "CANCELLED",
} as const;

/**
 * Statuts d'un justificatif televerse par une famille.
 * EN_ATTENTE n'augmente JAMAIS les encaissements valides.
 */
export const PROOF_STATUSES = {
  EN_ATTENTE: "EN_ATTENTE",
  ACCEPTE: "ACCEPTE",
  REJETE: "REJETE",
} as const;

export const PROOF_STATUS_LABELS: Record<string, string> = {
  EN_ATTENTE: "En attente de confirmation",
  ACCEPTE: "Accepte",
  REJETE: "Rejete",
};

export const FEE_CATEGORIES = {
  INSCRIPTION: "INSCRIPTION",
  SCOLARITE: "SCOLARITE",
  EXAMEN: "EXAMEN",
  CANTINE: "CANTINE",
  TRANSPORT: "TRANSPORT",
  TENUE: "TENUE",
  BIBLIOTHEQUE: "BIBLIOTHEQUE",
  LOGEMENT: "LOGEMENT",
  AUTRE: "AUTRE",
} as const;

export const FEE_CATEGORY_LABELS: Record<string, string> = {
  INSCRIPTION: "Frais d'inscription",
  SCOLARITE: "Scolarite",
  EXAMEN: "Frais d'examen",
  CANTINE: "Cantine",
  TRANSPORT: "Transport",
  TENUE: "Tenue scolaire",
  BIBLIOTHEQUE: "Bibliotheque",
  LOGEMENT: "Logement",
  AUTRE: "Autres frais",
};

export const DISCOUNT_KINDS = {
  BOURSE: "BOURSE",
  EXONERATION: "EXONERATION",
  FRATRIE: "FRATRIE",
  COMMERCIALE: "COMMERCIALE",
  AUTRE: "AUTRE",
} as const;

export const DISCOUNT_KIND_LABELS: Record<string, string> = {
  BOURSE: "Bourse",
  EXONERATION: "Exoneration",
  FRATRIE: "Remise fratrie",
  COMMERCIALE: "Remise commerciale",
  AUTRE: "Autre remise",
};

export const EVALUATION_KINDS = {
  DEVOIR: "DEVOIR",
  INTERROGATION: "INTERROGATION",
  EXAMEN: "EXAMEN",
  TP: "TP",
  ORAL: "ORAL",
  PROJET: "PROJET",
} as const;

export const EVALUATION_KIND_LABELS: Record<string, string> = {
  DEVOIR: "Devoir",
  INTERROGATION: "Interrogation",
  EXAMEN: "Examen",
  TP: "Travaux pratiques",
  ORAL: "Oral",
  PROJET: "Projet",
};

/**
 * Cycle de vie d'une evaluation. Les notes ne sont visibles des familles
 * qu'a l'etat PUBLISHED, et ce passage verrouille la saisie.
 */
export const EVALUATION_STATUSES = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  VALIDATED: "VALIDATED",
  PUBLISHED: "PUBLISHED",
} as const;

export const EVALUATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumise pour validation",
  VALIDATED: "Validee",
  PUBLISHED: "Publiee",
};

export const SUBMISSION_STATUSES = {
  A_FAIRE: "A_FAIRE",
  REMIS: "REMIS",
  EN_RETARD: "EN_RETARD",
  CORRIGE: "CORRIGE",
} as const;

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  A_FAIRE: "A faire",
  REMIS: "Remis",
  EN_RETARD: "En retard",
  CORRIGE: "Corrige",
};

export const ATTENDANCE_STATUSES = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  RETARD: "RETARD",
  EXCUSE: "EXCUSE",
  RENVOYE: "RENVOYE",
} as const;

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  RETARD: "Retard",
  EXCUSE: "Absence excusee",
  RENVOYE: "Renvoye",
};

export const EXPENSE_STATUSES = {
  DRAFT: "DRAFT",
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  REQUESTED: "Demande d'achat",
  APPROVED: "Approuvee",
  REJECTED: "Rejetee",
  PAID: "Payee",
  CANCELLED: "Annulee",
};

/** Types de comptes du plan comptable. */
export const ACCOUNT_TYPES = {
  ACTIF: "ACTIF",
  PASSIF: "PASSIF",
  CAPITAUX: "CAPITAUX",
  PRODUIT: "PRODUIT",
  CHARGE: "CHARGE",
} as const;
export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];

/** Sens naturel du solde : un compte d'actif/charge augmente au debit. */
export const ACCOUNT_NORMAL_SIDE: Record<AccountType, "DEBIT" | "CREDIT"> = {
  ACTIF: "DEBIT",
  CHARGE: "DEBIT",
  PASSIF: "CREDIT",
  CAPITAUX: "CREDIT",
  PRODUIT: "CREDIT",
};

export const JOURNAL_CODES = {
  VE: "VE",
  AC: "AC",
  BQ: "BQ",
  CA: "CA",
  OD: "OD",
} as const;

export const JOURNAL_LABELS: Record<string, string> = {
  VE: "Journal des ventes",
  AC: "Journal des achats",
  BQ: "Journal de banque",
  CA: "Journal de caisse",
  OD: "Operations diverses",
};

export const JOURNAL_ENTRY_STATUSES = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
  REVERSED: "REVERSED",
} as const;

export const NOTIFICATION_KINDS = {
  NOTES_PUBLIEES: "NOTES_PUBLIEES",
  ABSENCE: "ABSENCE",
  PAIEMENT_VALIDE: "PAIEMENT_VALIDE",
  JUSTIFICATIF_REJETE: "JUSTIFICATIF_REJETE",
  ECHEANCE_PROCHE: "ECHEANCE_PROCHE",
  ANNONCE: "ANNONCE",
  DEVOIR: "DEVOIR",
  AUTRE: "AUTRE",
} as const;

/** Modules optionnels activables par etablissement. */
export const OPTIONAL_MODULES = {
  BIBLIOTHEQUE: "BIBLIOTHEQUE",
  CANTINE: "CANTINE",
  TRANSPORT: "TRANSPORT",
  INVENTAIRE: "INVENTAIRE",
  MAINTENANCE: "MAINTENANCE",
  EVENEMENTS: "EVENEMENTS",
  ANCIENS_ELEVES: "ANCIENS_ELEVES",
} as const;

export const OPTIONAL_MODULE_LABELS: Record<string, string> = {
  BIBLIOTHEQUE: "Bibliotheque",
  CANTINE: "Cantine",
  TRANSPORT: "Transport",
  INVENTAIRE: "Inventaire",
  MAINTENANCE: "Maintenance",
  EVENEMENTS: "Evenements",
  ANCIENS_ELEVES: "Anciens eleves",
};

export const PLAN_CODES = {
  ESSENTIEL: "ESSENTIEL",
  PROFESSIONNEL: "PROFESSIONNEL",
  PREMIUM: "PREMIUM",
} as const;

export const WEEKDAY_LABELS = [
  "",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

/** Types de fichiers acceptes a l'upload (controle serveur, pas seulement UI). */
export const ALLOWED_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const ALLOWED_IMPORT_MIME = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
