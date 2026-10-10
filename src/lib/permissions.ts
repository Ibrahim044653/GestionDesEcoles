/**
 * Catalogue des permissions et matrice role -> permissions.
 *
 * PRINCIPE : l'interface peut masquer un bouton, mais ce fichier (applique
 * cote serveur par src/lib/auth/guard.ts) est la seule autorite. Toute action
 * serveur verifie explicitement une permission ET le tenant.
 */

import { ROLES, type RoleCode } from "./constants";

export const PERMISSIONS = {
  // --- Etablissement & configuration ---
  SCHOOL_VIEW: "school.view",
  SCHOOL_UPDATE: "school.update",
  SCHOOL_CREATE: "school.create",
  SCHOOL_CONFIGURE_ACADEMIC: "school.configure_academic",
  SCHOOL_CONFIGURE_FINANCE: "school.configure_finance",

  // --- Utilisateurs & roles ---
  USER_VIEW: "user.view",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DISABLE: "user.disable",
  MEMBERSHIP_MANAGE: "membership.manage",

  // --- Eleves ---
  STUDENT_VIEW: "student.view",
  STUDENT_VIEW_OWN: "student.view_own",
  STUDENT_CREATE: "student.create",
  STUDENT_UPDATE: "student.update",
  STUDENT_ARCHIVE: "student.archive",
  STUDENT_IMPORT: "student.import",
  STUDENT_EXPORT: "student.export",
  ENROLLMENT_MANAGE: "enrollment.manage",

  // --- Personnel ---
  STAFF_VIEW: "staff.view",
  STAFF_CREATE: "staff.create",
  STAFF_UPDATE: "staff.update",
  STAFF_EXPORT_PAYROLL: "staff.export_payroll",

  // --- Pedagogie ---
  SUBJECT_MANAGE: "subject.manage",
  TIMETABLE_VIEW: "timetable.view",
  TIMETABLE_MANAGE: "timetable.manage",
  EVALUATION_VIEW: "evaluation.view",
  EVALUATION_MANAGE: "evaluation.manage",
  GRADE_ENTER: "grade.enter",
  /** Valider puis publier : etape distincte de la simple saisie. */
  GRADE_VALIDATE: "grade.validate",
  GRADE_PUBLISH: "grade.publish",
  GRADE_VIEW_ALL: "grade.view_all",
  GRADE_VIEW_OWN: "grade.view_own",
  REPORTCARD_GENERATE: "reportcard.generate",
  ATTENDANCE_VIEW: "attendance.view",
  ATTENDANCE_RECORD: "attendance.record",
  ASSIGNMENT_MANAGE: "assignment.manage",
  ASSIGNMENT_VIEW_OWN: "assignment.view_own",
  ASSIGNMENT_SUBMIT: "assignment.submit",
  ASSIGNMENT_GRADE: "assignment.grade",

  // --- Frais & comptes eleves ---
  FEE_VIEW: "fee.view",
  FEE_MANAGE: "fee.manage",
  FEE_ASSIGN: "fee.assign",
  DISCOUNT_GRANT: "discount.grant",
  STUDENT_ACCOUNT_VIEW: "student_account.view",
  STUDENT_ACCOUNT_VIEW_OWN: "student_account.view_own",

  // --- Paiements ---
  PAYMENT_VIEW: "payment.view",
  PAYMENT_CREATE: "payment.create",
  PAYMENT_CANCEL: "payment.cancel",
  RECEIPT_ISSUE: "receipt.issue",
  RECEIPT_VIEW_OWN: "receipt.view_own",
  /** Televerser un justificatif (parent). Ne vaut jamais encaissement. */
  PROOF_SUBMIT: "proof.submit",
  PROOF_VIEW: "proof.view",
  PROOF_REVIEW: "proof.review",
  REFUND_REQUEST: "refund.request",
  REFUND_APPROVE: "refund.approve",

  // --- Depenses & comptabilite ---
  EXPENSE_VIEW: "expense.view",
  EXPENSE_CREATE: "expense.create",
  EXPENSE_APPROVE: "expense.approve",
  EXPENSE_PAY: "expense.pay",
  SUPPLIER_MANAGE: "supplier.manage",
  ACCOUNT_MANAGE: "account.manage",
  JOURNAL_VIEW: "journal.view",
  JOURNAL_POST: "journal.post",
  JOURNAL_REVERSE: "journal.reverse",
  PERIOD_CLOSE: "period.close",
  RECONCILIATION_MANAGE: "reconciliation.manage",

  // --- Tableaux de bord & rapports ---
  DASHBOARD_OWNER: "dashboard.owner",
  DASHBOARD_DIRECTION: "dashboard.direction",
  DASHBOARD_ACADEMIC: "dashboard.academic",
  DASHBOARD_FINANCE: "dashboard.finance",
  REPORT_EXPORT: "report.export",

  // --- Communication ---
  ANNOUNCEMENT_VIEW: "announcement.view",
  ANNOUNCEMENT_MANAGE: "announcement.manage",
  MESSAGE_SEND: "message.send",
  DOCUMENT_REQUEST: "document.request",
  DOCUMENT_FULFILL: "document.fulfill",
  APPOINTMENT_REQUEST: "appointment.request",
  APPOINTMENT_MANAGE: "appointment.manage",

  // --- Administration & securite ---
  AUDIT_VIEW: "audit.view",
  SAAS_ADMIN: "saas.admin",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/** Permissions communes a tout membre du personnel. */
const STAFF_BASE: PermissionCode[] = [
  P.SCHOOL_VIEW,
  P.ANNOUNCEMENT_VIEW,
  P.MESSAGE_SEND,
];

/** Lecture pedagogique complete (direction, pedagogie). */
const ACADEMIC_READ: PermissionCode[] = [
  P.STUDENT_VIEW,
  P.STAFF_VIEW,
  P.SUBJECT_MANAGE,
  P.TIMETABLE_VIEW,
  P.EVALUATION_VIEW,
  P.GRADE_VIEW_ALL,
  P.ATTENDANCE_VIEW,
  P.DASHBOARD_ACADEMIC,
];

/** Lecture financiere complete (direction, comptabilite). */
const FINANCE_READ: PermissionCode[] = [
  P.FEE_VIEW,
  P.STUDENT_ACCOUNT_VIEW,
  P.PAYMENT_VIEW,
  P.PROOF_VIEW,
  P.EXPENSE_VIEW,
  P.JOURNAL_VIEW,
  P.DASHBOARD_FINANCE,
];

/**
 * Matrice des permissions par role.
 * SUPER_ADMIN est traite a part : il dispose de la totalite des permissions
 * sur l'espace SaaS, mais n'accede PAS implicitement aux donnees d'une ecole
 * (voir guard.ts : l'acces tenant reste conditionne a un membership).
 */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  [ROLES.SUPER_ADMIN]: [P.SAAS_ADMIN, P.AUDIT_VIEW, P.USER_VIEW, P.SCHOOL_VIEW],

  [ROLES.OWNER]: [
    ...STAFF_BASE,
    ...ACADEMIC_READ,
    ...FINANCE_READ,
    P.SCHOOL_CREATE,
    P.SCHOOL_UPDATE,
    P.SCHOOL_CONFIGURE_ACADEMIC,
    P.SCHOOL_CONFIGURE_FINANCE,
    P.USER_VIEW,
    P.USER_CREATE,
    P.USER_UPDATE,
    P.USER_DISABLE,
    P.MEMBERSHIP_MANAGE,
    P.STUDENT_CREATE,
    P.STUDENT_UPDATE,
    P.STUDENT_ARCHIVE,
    P.STUDENT_IMPORT,
    P.STUDENT_EXPORT,
    P.ENROLLMENT_MANAGE,
    P.STAFF_CREATE,
    P.STAFF_UPDATE,
    P.STAFF_EXPORT_PAYROLL,
    P.TIMETABLE_MANAGE,
    P.EVALUATION_MANAGE,
    P.GRADE_VALIDATE,
    P.GRADE_PUBLISH,
    P.REPORTCARD_GENERATE,
    P.ASSIGNMENT_MANAGE,
    P.FEE_MANAGE,
    P.FEE_ASSIGN,
    P.DISCOUNT_GRANT,
    P.PAYMENT_CREATE,
    P.PAYMENT_CANCEL,
    P.RECEIPT_ISSUE,
    P.PROOF_REVIEW,
    P.REFUND_REQUEST,
    P.REFUND_APPROVE,
    P.EXPENSE_CREATE,
    P.EXPENSE_APPROVE,
    P.EXPENSE_PAY,
    P.SUPPLIER_MANAGE,
    P.ACCOUNT_MANAGE,
    P.JOURNAL_POST,
    P.JOURNAL_REVERSE,
    P.PERIOD_CLOSE,
    P.RECONCILIATION_MANAGE,
    P.DASHBOARD_OWNER,
    P.DASHBOARD_DIRECTION,
    P.REPORT_EXPORT,
    P.ANNOUNCEMENT_MANAGE,
    P.DOCUMENT_FULFILL,
    P.APPOINTMENT_MANAGE,
    P.AUDIT_VIEW,
  ],

  [ROLES.DIRECTOR]: [
    ...STAFF_BASE,
    ...ACADEMIC_READ,
    ...FINANCE_READ,
    P.SCHOOL_UPDATE,
    P.SCHOOL_CONFIGURE_ACADEMIC,
    P.USER_VIEW,
    P.USER_CREATE,
    P.MEMBERSHIP_MANAGE,
    P.STUDENT_CREATE,
    P.STUDENT_UPDATE,
    P.STUDENT_ARCHIVE,
    P.STUDENT_IMPORT,
    P.STUDENT_EXPORT,
    P.ENROLLMENT_MANAGE,
    P.STAFF_CREATE,
    P.STAFF_UPDATE,
    P.TIMETABLE_MANAGE,
    P.EVALUATION_MANAGE,
    P.GRADE_VALIDATE,
    P.GRADE_PUBLISH,
    P.REPORTCARD_GENERATE,
    P.ASSIGNMENT_MANAGE,
    P.FEE_ASSIGN,
    P.DISCOUNT_GRANT,
    P.EXPENSE_CREATE,
    P.EXPENSE_APPROVE,
    P.DASHBOARD_DIRECTION,
    P.REPORT_EXPORT,
    P.ANNOUNCEMENT_MANAGE,
    P.DOCUMENT_FULFILL,
    P.APPOINTMENT_MANAGE,
    P.AUDIT_VIEW,
  ],

  [ROLES.ACADEMIC_HEAD]: [
    ...STAFF_BASE,
    ...ACADEMIC_READ,
    P.SCHOOL_CONFIGURE_ACADEMIC,
    P.ENROLLMENT_MANAGE,
    P.TIMETABLE_MANAGE,
    P.EVALUATION_MANAGE,
    P.GRADE_ENTER,
    P.GRADE_VALIDATE,
    P.GRADE_PUBLISH,
    P.REPORTCARD_GENERATE,
    P.ATTENDANCE_RECORD,
    P.ASSIGNMENT_MANAGE,
    P.STUDENT_EXPORT,
    P.REPORT_EXPORT,
    P.ANNOUNCEMENT_MANAGE,
    P.DOCUMENT_FULFILL,
    P.APPOINTMENT_MANAGE,
  ],

  [ROLES.ACCOUNTANT]: [
    ...STAFF_BASE,
    ...FINANCE_READ,
    P.STUDENT_VIEW,
    P.SCHOOL_CONFIGURE_FINANCE,
    P.FEE_MANAGE,
    P.FEE_ASSIGN,
    P.DISCOUNT_GRANT,
    P.PAYMENT_CREATE,
    P.PAYMENT_CANCEL,
    P.RECEIPT_ISSUE,
    // Seul le comptable (et au-dessus) tranche un justificatif.
    P.PROOF_REVIEW,
    P.REFUND_REQUEST,
    P.REFUND_APPROVE,
    P.EXPENSE_CREATE,
    P.EXPENSE_APPROVE,
    P.EXPENSE_PAY,
    P.SUPPLIER_MANAGE,
    P.ACCOUNT_MANAGE,
    P.JOURNAL_POST,
    P.JOURNAL_REVERSE,
    P.PERIOD_CLOSE,
    P.RECONCILIATION_MANAGE,
    P.STAFF_EXPORT_PAYROLL,
    P.REPORT_EXPORT,
    P.AUDIT_VIEW,
  ],

  [ROLES.CASHIER]: [
    ...STAFF_BASE,
    P.STUDENT_VIEW,
    P.FEE_VIEW,
    P.STUDENT_ACCOUNT_VIEW,
    P.PAYMENT_VIEW,
    // Encaisse et edite le recu, mais ne valide PAS un justificatif
    // et ne touche ni aux remises ni a la comptabilite.
    P.PAYMENT_CREATE,
    P.RECEIPT_ISSUE,
    P.PROOF_VIEW,
  ],

  [ROLES.TEACHER]: [
    ...STAFF_BASE,
    // La restriction "uniquement ses classes et matieres" est appliquee par
    // les filtres de scope (voir guard.ts / teacherScope), pas par ce tableau.
    P.STUDENT_VIEW,
    P.TIMETABLE_VIEW,
    P.EVALUATION_VIEW,
    P.EVALUATION_MANAGE,
    P.GRADE_ENTER,
    P.GRADE_VIEW_ALL,
    P.ATTENDANCE_VIEW,
    P.ATTENDANCE_RECORD,
    P.ASSIGNMENT_MANAGE,
    P.ASSIGNMENT_GRADE,
    P.APPOINTMENT_MANAGE,
  ],

  [ROLES.GUARDIAN]: [
    P.SCHOOL_VIEW,
    P.ANNOUNCEMENT_VIEW,
    P.MESSAGE_SEND,
    // Toutes ces permissions sont bornees aux enfants rattaches au parent.
    P.STUDENT_VIEW_OWN,
    P.GRADE_VIEW_OWN,
    P.STUDENT_ACCOUNT_VIEW_OWN,
    P.RECEIPT_VIEW_OWN,
    P.PROOF_SUBMIT,
    P.ASSIGNMENT_VIEW_OWN,
    P.DOCUMENT_REQUEST,
    P.APPOINTMENT_REQUEST,
  ],

  [ROLES.STUDENT]: [
    P.SCHOOL_VIEW,
    P.ANNOUNCEMENT_VIEW,
    P.STUDENT_VIEW_OWN,
    P.GRADE_VIEW_OWN,
    P.ASSIGNMENT_VIEW_OWN,
    P.ASSIGNMENT_SUBMIT,
    P.TIMETABLE_VIEW,
  ],
};

/** Toutes les permissions existantes, pour le seed et l'ecran d'administration. */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionCode[];

export function describePermission(code: string): { resource: string; action: string } {
  const [resource = code, action = "*"] = code.split(".");
  return { resource, action };
}

/**
 * Permissions effectives : matrice du role + surcharges du membership.
 * `overrides` a la forme {"grant":["x.y"],"revoke":["a.b"]}.
 */
export function effectivePermissions(
  roleCode: string,
  overrides?: { grant?: string[]; revoke?: string[] } | null,
): Set<string> {
  const base = ROLE_PERMISSIONS[roleCode as RoleCode] ?? [];
  const result = new Set<string>(base);
  for (const granted of overrides?.grant ?? []) result.add(granted);
  for (const revoked of overrides?.revoke ?? []) result.delete(revoked);
  return result;
}

/**
 * Libelles francais des permissions, pour l'editeur de surcharges.
 *
 * Ils decrivent ce que la permission AUTORISE, pas l'ecran ou elle s'applique :
 * un administrateur doit comprendre ce qu'il accorde sans connaitre le code.
 */
export const PERMISSION_LABELS: Record<string, string> = {
  "school.view": "Consulter la fiche de l'etablissement",
  "school.update": "Modifier la fiche de l'etablissement",
  "school.create": "Creer un etablissement",
  "school.configure_academic": "Configurer la pedagogie (annees, periodes, bareme)",
  "school.configure_finance": "Configurer les finances (comptes, penalites, remises)",

  "user.view": "Consulter les comptes utilisateurs",
  "user.create": "Creer un compte utilisateur",
  "user.update": "Modifier un compte utilisateur",
  "user.disable": "Desactiver un compte utilisateur",
  "membership.manage": "Gerer les rattachements et les roles",

  "student.view": "Consulter tous les eleves",
  "student.view_own": "Consulter uniquement ses propres eleves (parent, eleve)",
  "student.create": "Inscrire un eleve",
  "student.update": "Modifier la fiche d'un eleve",
  "student.archive": "Archiver un eleve",
  "student.import": "Importer des eleves en masse",
  "student.export": "Exporter la liste des eleves",
  "enrollment.manage": "Gerer les inscriptions et les decisions de fin d'annee",

  "staff.view": "Consulter le personnel",
  "staff.create": "Ajouter un membre du personnel",
  "staff.update": "Modifier un membre du personnel, pointer les presences",
  "staff.export_payroll": "Exporter les donnees de paie",

  "subject.manage": "Gerer les matieres et les unites d'enseignement",
  "timetable.view": "Consulter l'emploi du temps",
  "timetable.manage": "Modifier l'emploi du temps",
  "evaluation.view": "Consulter les evaluations",
  "evaluation.manage": "Creer et modifier des evaluations",
  "grade.enter": "Saisir des notes et des appreciations",
  "grade.validate": "Valider des notes saisies",
  "grade.publish": "Publier les resultats aux familles",
  "grade.view_all": "Consulter toutes les notes de l'etablissement",
  "grade.view_own": "Consulter uniquement ses propres notes",
  "reportcard.generate": "Generer les bulletins et tenir le conseil de classe",
  "attendance.view": "Consulter les absences des eleves",
  "attendance.record": "Saisir les absences des eleves",
  "assignment.manage": "Creer et gerer des devoirs",
  "assignment.view_own": "Consulter ses propres devoirs",
  "assignment.submit": "Deposer un travail",
  "assignment.grade": "Corriger et noter les remises",

  "fee.view": "Consulter les frais scolaires",
  "fee.manage": "Creer et modifier les frais, appliquer les penalites",
  "fee.assign": "Affecter des frais a un eleve",
  "discount.grant": "Accorder une remise ou une bourse",
  "student_account.view": "Consulter le compte financier de tout eleve",
  "student_account.view_own": "Consulter uniquement son propre compte financier",

  "payment.view": "Consulter les encaissements",
  "payment.create": "Enregistrer un encaissement",
  "payment.cancel": "Annuler un encaissement (par contrepassation)",
  "receipt.issue": "Emettre un recu",
  "receipt.view_own": "Consulter ses propres recus",
  "proof.submit": "Deposer un justificatif de paiement",
  "proof.view": "Consulter les justificatifs deposes",
  "proof.review": "Accepter ou refuser un justificatif",
  "refund.request": "Demander un remboursement",
  "refund.approve": "Approuver et payer un remboursement",

  "expense.view": "Consulter les depenses",
  "expense.create": "Saisir une depense",
  "expense.approve": "Approuver une depense",
  "expense.pay": "Payer une depense",
  "supplier.manage": "Gerer les fournisseurs",
  "account.manage": "Gerer le plan comptable et les comptes financiers",
  "journal.view": "Consulter le journal comptable",
  "journal.post": "Passer une ecriture comptable",
  "journal.reverse": "Contrepasser une ecriture comptable",
  "period.close": "Cloturer un exercice comptable",
  "reconciliation.manage": "Effectuer les rapprochements bancaires",

  "dashboard.owner": "Tableau de bord proprietaire",
  "dashboard.direction": "Tableau de bord direction",
  "dashboard.academic": "Tableau de bord pedagogique",
  "dashboard.finance": "Tableau de bord financier",
  "report.export": "Exporter les rapports",

  "announcement.view": "Consulter les annonces",
  "announcement.manage": "Publier des annonces",
  "message.send": "Utiliser la messagerie interne",
  "document.request": "Demander un document officiel",
  "document.fulfill": "Traiter les demandes de documents",
  "appointment.request": "Demander un rendez-vous",
  "appointment.manage": "Traiter les demandes de rendez-vous",

  "audit.view": "Consulter le journal d'audit",
  "saas.admin": "Administration de la plateforme SaaS",
};

/** Regroupement des permissions pour l'affichage, dans l'ordre du catalogue. */
export const PERMISSION_GROUPS: { label: string; prefixes: string[] }[] = [
  { label: "Etablissement et configuration", prefixes: ["school."] },
  { label: "Utilisateurs et roles", prefixes: ["user.", "membership."] },
  { label: "Eleves et inscriptions", prefixes: ["student.", "student_account.", "enrollment."] },
  { label: "Personnel", prefixes: ["staff."] },
  {
    label: "Pedagogie",
    prefixes: [
      "subject.",
      "timetable.",
      "evaluation.",
      "grade.",
      "reportcard.",
      "attendance.",
      "assignment.",
    ],
  },
  { label: "Frais et remises", prefixes: ["fee.", "discount."] },
  { label: "Encaissements", prefixes: ["payment.", "receipt.", "proof.", "refund."] },
  {
    label: "Depenses et comptabilite",
    prefixes: [
      "expense.",
      "supplier.",
      "account.",
      "journal.",
      "period.",
      "reconciliation.",
    ],
  },
  { label: "Pilotage et rapports", prefixes: ["dashboard.", "report."] },
  {
    label: "Communication",
    prefixes: ["announcement.", "message.", "document.", "appointment."],
  },
  { label: "Securite", prefixes: ["audit."] },
];

/**
 * Permissions qu'une surcharge de membership ne peut jamais accorder.
 *
 * `saas.admin` est transverse aux etablissements : l'accorder depuis l'ecran
 * d'une ecole permettrait a un administrateur local de s'octroyer un acces a
 * TOUTES les ecoles de la plateforme. Il ne se donne que par le drapeau
 * `isSuperAdmin` du compte, hors du contexte d'un tenant.
 */
export const NON_GRANTABLE_PERMISSIONS: string[] = [PERMISSIONS.SAAS_ADMIN];

/** Permissions pouvant faire l'objet d'une surcharge, groupees pour l'affichage. */
export function grantablePermissionGroups(): {
  label: string;
  permissions: { code: string; label: string }[];
}[] {
  const all = Object.values(PERMISSIONS).filter(
    (code) => !NON_GRANTABLE_PERMISSIONS.includes(code),
  );

  return PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    permissions: all
      .filter((code) => group.prefixes.some((prefix) => code.startsWith(prefix)))
      .map((code) => ({ code, label: PERMISSION_LABELS[code] ?? code })),
  })).filter((group) => group.permissions.length > 0);
}
