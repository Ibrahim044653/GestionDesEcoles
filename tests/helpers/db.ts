import { prisma } from "@/lib/prisma";

/**
 * Utilitaires des tests d'integration.
 *
 * La base SQLite jetable est creee par tests/global-setup.ts, qui positionne
 * DATABASE_URL avant tout chargement de module : le client Prisma partage par
 * l'application pointe donc sur la base de test.
 */

export { prisma };

/** Vide les tables dans l'ordre inverse des dependances. */
export async function resetDatabase(): Promise<void> {
  const tables = [
    "gradeRevision", "reportCard", "grade", "evaluation",
    "submission", "assignment", "attendance", "timetableSlot",
    "paymentAllocation", "receipt", "refund", "payment", "paymentProof",
    "installment", "discount", "feeAssignment", "feeItem",
    "journalLine", "journalEntry", "accountingPeriod", "ledgerAccount",
    "bankReconciliation", "expense", "supplier", "expenseCategory", "financialAccount",
    "budget", "libraryLoan", "libraryItem", "subjectAppreciation",
    "message", "threadParticipant", "messageThread", "announcement",
    "notification", "documentRequest", "appointmentRequest", "document",
    "auditEvent", "importBatch", "rateLimitBucket",
    "staffAttendance", "staffLeave", "enrollment", "studentGuardian",
    "classSubject", "classRoom", "subject", "teachingUnit", "gradingPeriod",
    "level", "cycle", "track", "academicYear",
    "student", "guardian", "staff", "session", "membership",
    "supportTicket", "saasInvoice", "subscription", "school", "organization",
    "rolePermission", "role", "permission", "plan", "user",
  ] as const;

  for (const table of tables) {
    await (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[
      table
    ].deleteMany();
  }
}

/** Plan comptable minimal requis par les ecritures d'encaissement. */
const LEDGER_ACCOUNTS = [
  { code: "411", name: "Eleves - creances", type: "ACTIF", accountClass: 4 },
  { code: "419", name: "Eleves - avances recues", type: "PASSIF", accountClass: 4 },
  { code: "521", name: "Banque", type: "ACTIF", accountClass: 5 },
  { code: "531", name: "Mobile Money", type: "ACTIF", accountClass: 5 },
  { code: "571", name: "Caisse", type: "ACTIF", accountClass: 5 },
  { code: "601", name: "Achats", type: "CHARGE", accountClass: 6 },
  { code: "701", name: "Frais de scolarite", type: "PRODUIT", accountClass: 7 },
  { code: "702", name: "Frais d'inscription", type: "PRODUIT", accountClass: 7 },
  { code: "758", name: "Produits divers", type: "PRODUIT", accountClass: 7 },
];

/**
 * Jeu de donnees minimal : DEUX etablissements d'une meme organisation.
 * Cette configuration permet de verifier qu'aucune donnee ne traverse la
 * frontiere entre deux ecoles, meme au sein du meme client.
 */
export async function seedTwoSchools() {
  const organization = await prisma.organization.create({
    data: { name: "Groupe de test", slug: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });

  const [schoolA, schoolB] = await Promise.all([
    prisma.school.create({
      data: {
        organizationId: organization.id,
        name: "Ecole A",
        code: "ECOLE-A",
        currency: "XOF",
        currencyDecimals: 0,
        matriculePattern: "{SCHOOL}-{SEQ:4}",
      },
    }),
    prisma.school.create({
      data: {
        organizationId: organization.id,
        name: "Ecole B",
        code: "ECOLE-B",
        currency: "XOF",
        currencyDecimals: 0,
        matriculePattern: "{SCHOOL}-{SEQ:4}",
      },
    }),
  ]);

  for (const school of [schoolA, schoolB]) {
    await prisma.ledgerAccount.createMany({
      data: LEDGER_ACCOUNTS.map((account) => ({ ...account, schoolId: school.id })),
    });
    await prisma.accountingPeriod.create({
      data: {
        schoolId: school.id,
        name: "Exercice de test",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2026-12-31"),
        status: "OPEN",
      },
    });
  }

  const [yearA, yearB] = await Promise.all([
    prisma.academicYear.create({
      data: {
        schoolId: schoolA.id,
        name: "2025-2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-31"),
        isCurrent: true,
      },
    }),
    prisma.academicYear.create({
      data: {
        schoolId: schoolB.id,
        name: "2025-2026",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2026-07-31"),
        isCurrent: true,
      },
    }),
  ]);

  const [studentA, studentB] = await Promise.all([
    prisma.student.create({
      data: { schoolId: schoolA.id, matricule: "A-0001", firstName: "Awa", lastName: "KOUASSI" },
    }),
    prisma.student.create({
      data: { schoolId: schoolB.id, matricule: "B-0001", firstName: "Yao", lastName: "TRAORE" },
    }),
  ]);

  const cashier = await prisma.user.create({
    data: {
      email: `caissier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      passwordHash: "scrypt$placeholder",
      firstName: "Test",
      lastName: "CAISSIER",
    },
  });

  return { organization, schoolA, schoolB, yearA, yearB, studentA, studentB, cashier };
}
