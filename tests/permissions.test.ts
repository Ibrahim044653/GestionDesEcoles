import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  describePermission,
  effectivePermissions,
} from "@/lib/permissions";
import { ROLES, STAFF_ROLES, type RoleCode } from "@/lib/constants";

/**
 * Matrice des permissions.
 *
 * Ces tests verrouillent les separations de responsabilites exigees par le
 * cahier des charges : un caissier n'arbitre pas un justificatif, un parent
 * n'accede pas aux donnees globales, un enseignant ne touche pas aux finances.
 */

describe("catalogue des permissions", () => {
  it("ne contient aucun doublon", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it("respecte le format ressource.action", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it("n'attribue que des permissions existantes", () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(known.has(permission), `${role} reference ${permission} qui n'existe pas`).toBe(true);
      }
    }
  });

  it("definit une entree pour chaque role", () => {
    for (const role of Object.values(ROLES)) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("decompose une permission en ressource et action", () => {
    expect(describePermission("payment.create")).toEqual({
      resource: "payment",
      action: "create",
    });
  });
});

describe("separation des responsabilites financieres", () => {
  const cashier = new Set(ROLE_PERMISSIONS[ROLES.CASHIER]);
  const accountant = new Set(ROLE_PERMISSIONS[ROLES.ACCOUNTANT]);

  it("le caissier encaisse et edite un recu", () => {
    expect(cashier.has(PERMISSIONS.PAYMENT_CREATE)).toBe(true);
    expect(cashier.has(PERMISSIONS.RECEIPT_ISSUE)).toBe(true);
  });

  it("le caissier NE valide PAS un justificatif", () => {
    // Exigence : l'arbitrage releve du comptable, pas de celui qui encaisse.
    expect(cashier.has(PERMISSIONS.PROOF_REVIEW)).toBe(false);
  });

  it("le caissier n'accede ni a la comptabilite ni aux depenses", () => {
    expect(cashier.has(PERMISSIONS.JOURNAL_VIEW)).toBe(false);
    expect(cashier.has(PERMISSIONS.JOURNAL_POST)).toBe(false);
    expect(cashier.has(PERMISSIONS.EXPENSE_VIEW)).toBe(false);
    expect(cashier.has(PERMISSIONS.PERIOD_CLOSE)).toBe(false);
  });

  it("le caissier n'accorde pas de remise et n'annule pas un encaissement", () => {
    expect(cashier.has(PERMISSIONS.DISCOUNT_GRANT)).toBe(false);
    expect(cashier.has(PERMISSIONS.PAYMENT_CANCEL)).toBe(false);
  });

  it("le comptable arbitre les justificatifs et tient les comptes", () => {
    expect(accountant.has(PERMISSIONS.PROOF_REVIEW)).toBe(true);
    expect(accountant.has(PERMISSIONS.JOURNAL_POST)).toBe(true);
    expect(accountant.has(PERMISSIONS.JOURNAL_REVERSE)).toBe(true);
    expect(accountant.has(PERMISSIONS.PERIOD_CLOSE)).toBe(true);
  });

  it("le comptable ne saisit pas de notes", () => {
    expect(accountant.has(PERMISSIONS.GRADE_ENTER)).toBe(false);
    expect(accountant.has(PERMISSIONS.GRADE_PUBLISH)).toBe(false);
  });
});

describe("separation des responsabilites pedagogiques", () => {
  const teacher = new Set(ROLE_PERMISSIONS[ROLES.TEACHER]);
  const academicHead = new Set(ROLE_PERMISSIONS[ROLES.ACADEMIC_HEAD]);

  it("l'enseignant saisit des notes mais ne les publie pas seul", () => {
    expect(teacher.has(PERMISSIONS.GRADE_ENTER)).toBe(true);
    // La publication est une etape de validation distincte (cahier des charges 13).
    expect(teacher.has(PERMISSIONS.GRADE_PUBLISH)).toBe(false);
    expect(teacher.has(PERMISSIONS.GRADE_VALIDATE)).toBe(false);
  });

  it("le responsable pedagogique valide et publie", () => {
    expect(academicHead.has(PERMISSIONS.GRADE_VALIDATE)).toBe(true);
    expect(academicHead.has(PERMISSIONS.GRADE_PUBLISH)).toBe(true);
    expect(academicHead.has(PERMISSIONS.REPORTCARD_GENERATE)).toBe(true);
  });

  it("l'enseignant n'accede a aucune donnee financiere", () => {
    expect(teacher.has(PERMISSIONS.PAYMENT_VIEW)).toBe(false);
    expect(teacher.has(PERMISSIONS.STUDENT_ACCOUNT_VIEW)).toBe(false);
    expect(teacher.has(PERMISSIONS.FEE_VIEW)).toBe(false);
    expect(teacher.has(PERMISSIONS.JOURNAL_VIEW)).toBe(false);
  });

  it("le responsable pedagogique n'accede pas a la comptabilite", () => {
    expect(academicHead.has(PERMISSIONS.JOURNAL_VIEW)).toBe(false);
    expect(academicHead.has(PERMISSIONS.PAYMENT_CREATE)).toBe(false);
  });
});

describe("espace parent", () => {
  const guardian = new Set(ROLE_PERMISSIONS[ROLES.GUARDIAN]);

  it("ne dispose que de permissions bornees a ses propres enfants", () => {
    expect(guardian.has(PERMISSIONS.STUDENT_VIEW_OWN)).toBe(true);
    expect(guardian.has(PERMISSIONS.GRADE_VIEW_OWN)).toBe(true);
    expect(guardian.has(PERMISSIONS.STUDENT_ACCOUNT_VIEW_OWN)).toBe(true);
  });

  it("n'accede JAMAIS aux listes globales", () => {
    expect(guardian.has(PERMISSIONS.STUDENT_VIEW)).toBe(false);
    expect(guardian.has(PERMISSIONS.GRADE_VIEW_ALL)).toBe(false);
    expect(guardian.has(PERMISSIONS.STUDENT_ACCOUNT_VIEW)).toBe(false);
    expect(guardian.has(PERMISSIONS.PAYMENT_VIEW)).toBe(false);
    expect(guardian.has(PERMISSIONS.STAFF_VIEW)).toBe(false);
  });

  it("peut deposer un justificatif mais jamais le valider", () => {
    expect(guardian.has(PERMISSIONS.PROOF_SUBMIT)).toBe(true);
    expect(guardian.has(PERMISSIONS.PROOF_REVIEW)).toBe(false);
    expect(guardian.has(PERMISSIONS.PAYMENT_CREATE)).toBe(false);
  });

  it("n'a aucun droit d'administration", () => {
    expect(guardian.has(PERMISSIONS.MEMBERSHIP_MANAGE)).toBe(false);
    expect(guardian.has(PERMISSIONS.SCHOOL_UPDATE)).toBe(false);
    expect(guardian.has(PERMISSIONS.AUDIT_VIEW)).toBe(false);
  });
});

describe("espace eleve", () => {
  const student = new Set(ROLE_PERMISSIONS[ROLES.STUDENT]);

  it("consulte ses propres donnees et depose ses devoirs", () => {
    expect(student.has(PERMISSIONS.STUDENT_VIEW_OWN)).toBe(true);
    expect(student.has(PERMISSIONS.GRADE_VIEW_OWN)).toBe(true);
    expect(student.has(PERMISSIONS.ASSIGNMENT_SUBMIT)).toBe(true);
  });

  it("n'accede a aucune donnee financiere ni a celle d'autrui", () => {
    expect(student.has(PERMISSIONS.STUDENT_ACCOUNT_VIEW_OWN)).toBe(false);
    expect(student.has(PERMISSIONS.STUDENT_VIEW)).toBe(false);
    expect(student.has(PERMISSIONS.GRADE_VIEW_ALL)).toBe(false);
  });

  it("ne note pas et ne publie rien", () => {
    expect(student.has(PERMISSIONS.GRADE_ENTER)).toBe(false);
    expect(student.has(PERMISSIONS.ASSIGNMENT_GRADE)).toBe(false);
    expect(student.has(PERMISSIONS.ANNOUNCEMENT_MANAGE)).toBe(false);
  });
});

describe("super-administrateur SaaS", () => {
  const superAdmin = new Set(ROLE_PERMISSIONS[ROLES.SUPER_ADMIN]);

  it("administre la plateforme", () => {
    expect(superAdmin.has(PERMISSIONS.SAAS_ADMIN)).toBe(true);
  });

  it("n'herite d'AUCUN droit sur les donnees d'un etablissement", () => {
    // Exigence : l'acces tenant reste conditionne a un rattachement explicite.
    expect(superAdmin.has(PERMISSIONS.STUDENT_VIEW)).toBe(false);
    expect(superAdmin.has(PERMISSIONS.PAYMENT_VIEW)).toBe(false);
    expect(superAdmin.has(PERMISSIONS.PAYMENT_CREATE)).toBe(false);
    expect(superAdmin.has(PERMISSIONS.GRADE_VIEW_ALL)).toBe(false);
    expect(superAdmin.has(PERMISSIONS.PROOF_REVIEW)).toBe(false);
    expect(superAdmin.has(PERMISSIONS.JOURNAL_VIEW)).toBe(false);
  });
});

describe("proprietaire et directeur", () => {
  const owner = new Set(ROLE_PERMISSIONS[ROLES.OWNER]);
  const director = new Set(ROLE_PERMISSIONS[ROLES.DIRECTOR]);

  it("le proprietaire pilote l'etablissement de bout en bout", () => {
    expect(owner.has(PERMISSIONS.DASHBOARD_OWNER)).toBe(true);
    expect(owner.has(PERMISSIONS.SCHOOL_CREATE)).toBe(true);
    expect(owner.has(PERMISSIONS.MEMBERSHIP_MANAGE)).toBe(true);
    expect(owner.has(PERMISSIONS.JOURNAL_POST)).toBe(true);
  });

  it("le directeur supervise sans gerer le plan comptable", () => {
    expect(director.has(PERMISSIONS.DASHBOARD_DIRECTION)).toBe(true);
    expect(director.has(PERMISSIONS.STUDENT_CREATE)).toBe(true);
    expect(director.has(PERMISSIONS.ACCOUNT_MANAGE)).toBe(false);
    expect(director.has(PERMISSIONS.JOURNAL_POST)).toBe(false);
  });

  it("ni l'un ni l'autre ne dispose du droit d'administration SaaS", () => {
    expect(owner.has(PERMISSIONS.SAAS_ADMIN)).toBe(false);
    expect(director.has(PERMISSIONS.SAAS_ADMIN)).toBe(false);
  });
});

describe("effectivePermissions", () => {
  it("retourne la matrice du role sans surcharge", () => {
    const permissions = effectivePermissions(ROLES.TEACHER, null);
    expect(permissions.has(PERMISSIONS.GRADE_ENTER)).toBe(true);
    expect(permissions.has(PERMISSIONS.PAYMENT_CREATE)).toBe(false);
  });

  it("ajoute une permission accordee ponctuellement", () => {
    const permissions = effectivePermissions(ROLES.TEACHER, {
      grant: [PERMISSIONS.GRADE_VALIDATE],
    });
    expect(permissions.has(PERMISSIONS.GRADE_VALIDATE)).toBe(true);
  });

  it("retire une permission du role", () => {
    const permissions = effectivePermissions(ROLES.CASHIER, {
      revoke: [PERMISSIONS.PAYMENT_CREATE],
    });
    expect(permissions.has(PERMISSIONS.PAYMENT_CREATE)).toBe(false);
  });

  it("applique le retrait apres l'ajout", () => {
    const permissions = effectivePermissions(ROLES.TEACHER, {
      grant: [PERMISSIONS.PAYMENT_CREATE],
      revoke: [PERMISSIONS.PAYMENT_CREATE],
    });
    expect(permissions.has(PERMISSIONS.PAYMENT_CREATE)).toBe(false);
  });

  it("retourne un ensemble vide pour un role inconnu", () => {
    expect(effectivePermissions("ROLE_INEXISTANT", null).size).toBe(0);
  });
});

describe("roles de personnel", () => {
  it("n'inclut ni parent, ni eleve, ni super-administrateur", () => {
    expect(STAFF_ROLES).not.toContain(ROLES.GUARDIAN as RoleCode);
    expect(STAFF_ROLES).not.toContain(ROLES.STUDENT as RoleCode);
    expect(STAFF_ROLES).not.toContain(ROLES.SUPER_ADMIN as RoleCode);
  });
});
