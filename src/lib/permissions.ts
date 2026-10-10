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
