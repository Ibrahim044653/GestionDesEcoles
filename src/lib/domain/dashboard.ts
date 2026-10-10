import { prisma } from "@/lib/prisma";
import { clampPositive, rateCenti, sumBy } from "@/lib/money";
import { computeIncomeStatement, computeTrialBalance } from "./accounting";
import { computeDiscount } from "./student-account";

/**
 * Indicateurs des tableaux de bord.
 *
 * REGLES (cahier des charges 10 et 11) :
 *  - les chiffres proviennent exclusivement des donnees reelles, aucune valeur
 *    de demonstration n'est injectee ici ;
 *  - CHIFFRE D'AFFAIRES et ENCAISSEMENTS sont deux grandeurs distinctes :
 *      . le CA est constate a l'EMISSION des frais (produits, classe 7) ;
 *      . les encaissements sont les reglements effectivement recus ;
 *      . la difference constitue les creances (impayes) ;
 *  - un justificatif en attente n'entre dans AUCUN de ces agregats.
 */

export type DashboardFilters = {
  schoolId: string;
  academicYearId?: string;
  from?: Date;
  to?: Date;
  levelId?: string;
  classRoomId?: string;
};

export type FinancialSnapshot = {
  /** Total facture aux familles sur la periode (net de remises). */
  billedMinor: number;
  /** Total brut avant remises. */
  grossBilledMinor: number;
  /** Remises, bourses et exonerations accordees. */
  discountMinor: number;
  /** Reglements valides encaisses. */
  collectedMinor: number;
  /** Montant declare par les familles, non encore confirme. */
  pendingProofMinor: number;
  /** Creances : facture non encore encaisse. */
  receivableMinor: number;
  /** Taux de recouvrement en centiemes de pourcent. */
  collectionRateCenti: number;
  /** Depenses payees sur la periode. */
  expensePaidMinor: number;
  /** Depenses engagees et approuvees mais non reglees. */
  expenseCommittedMinor: number;
  /** Produits - charges, issu du compte de resultat. */
  resultMinor: number;
  /** Solde de tresorerie (comptes de classe 5). */
  treasuryMinor: number;
  /** Echeances depassees et non soldees. */
  overdueMinor: number;
};

/** Agregats financiers de l'etablissement. */
export async function getFinancialSnapshot(filters: DashboardFilters): Promise<FinancialSnapshot> {
  const { schoolId } = filters;
  const periodFilter =
    filters.from || filters.to
      ? { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) }
      : undefined;

  const [fees, payments, proofs, expenses, income, balances, overdue] = await Promise.all([
    prisma.feeAssignment.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
        ...(periodFilter ? { createdAt: periodFilter } : {}),
        ...(filters.classRoomId
          ? { student: { enrollments: { some: { classRoomId: filters.classRoomId, status: "ACTIVE" } } } }
          : {}),
        ...(filters.levelId
          ? {
              student: {
                enrollments: { some: { classRoom: { levelId: filters.levelId }, status: "ACTIVE" } },
              },
            }
          : {}),
      },
      select: { grossAmountMinor: true, discounts: true },
    }),
    prisma.payment.findMany({
      where: {
        schoolId,
        status: "VALIDATED",
        ...(periodFilter ? { paidAt: periodFilter } : {}),
        ...(filters.classRoomId
          ? { student: { enrollments: { some: { classRoomId: filters.classRoomId, status: "ACTIVE" } } } }
          : {}),
      },
      select: { amountMinor: true },
    }),
    prisma.paymentProof.aggregate({
      where: { schoolId, status: "EN_ATTENTE" },
      _sum: { declaredAmountMinor: true },
    }),
    prisma.expense.findMany({
      where: {
        schoolId,
        status: { in: ["APPROVED", "PAID"] },
        ...(periodFilter ? { createdAt: periodFilter } : {}),
      },
      select: { amountMinor: true, status: true },
    }),
    computeIncomeStatement(schoolId, { from: filters.from, to: filters.to }),
    computeTrialBalance(schoolId, { to: filters.to }),
    getOverdueTotal(schoolId, filters.academicYearId),
  ]);

  const grossBilledMinor = sumBy(fees, (fee) => fee.grossAmountMinor);
  const discountMinor = fees.reduce(
    (total, fee) => total + computeDiscount(fee.grossAmountMinor, fee.discounts),
    0,
  );
  const billedMinor = grossBilledMinor - discountMinor;
  const collectedMinor = sumBy(payments, (payment) => payment.amountMinor);

  const expensePaidMinor = sumBy(
    expenses.filter((expense) => expense.status === "PAID"),
    (expense) => expense.amountMinor,
  );
  const expenseCommittedMinor = sumBy(
    expenses.filter((expense) => expense.status === "APPROVED"),
    (expense) => expense.amountMinor,
  );

  // Tresorerie = soldes des comptes de classe 5 (caisse, banque, mobile money).
  const treasuryMinor = balances
    .filter((balance) => balance.accountClass === 5)
    .reduce((total, balance) => total + balance.balanceMinor, 0);

  return {
    grossBilledMinor,
    discountMinor,
    billedMinor,
    collectedMinor,
    pendingProofMinor: proofs._sum.declaredAmountMinor ?? 0,
    receivableMinor: clampPositive(billedMinor - collectedMinor),
    collectionRateCenti: rateCenti(Math.min(collectedMinor, billedMinor), billedMinor),
    expensePaidMinor,
    expenseCommittedMinor,
    resultMinor: income.resultMinor,
    treasuryMinor,
    overdueMinor: overdue,
  };
}

/** Total des echeances depassees et non soldees. */
async function getOverdueTotal(schoolId: string, academicYearId?: string): Promise<number> {
  const installments = await prisma.installment.findMany({
    where: {
      schoolId,
      dueDate: { lt: new Date() },
      feeAssignment: {
        status: "ACTIVE",
        ...(academicYearId ? { academicYearId } : {}),
      },
    },
    select: {
      id: true,
      amountMinor: true,
      penaltyMinor: true,
      allocations: { select: { amountMinor: true, payment: { select: { status: true } } } },
    },
  });

  return installments.reduce((total, installment) => {
    const paid = installment.allocations
      .filter((allocation) => allocation.payment.status === "VALIDATED")
      .reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    return total + clampPositive(installment.amountMinor + installment.penaltyMinor - paid);
  }, 0);
}

export type EnrollmentSnapshot = {
  activeStudents: number;
  newEnrollments: number;
  reEnrollments: number;
  withdrawals: number;
  byGender: { male: number; female: number; unspecified: number };
  byLevel: { levelId: string; levelName: string; count: number; capacity: number }[];
  staffCount: number;
  teacherCount: number;
};

/** Effectifs et inscriptions. */
export async function getEnrollmentSnapshot(filters: DashboardFilters): Promise<EnrollmentSnapshot> {
  const { schoolId, academicYearId } = filters;

  const [enrollments, students, staff, levels] = await Promise.all([
    prisma.enrollment.findMany({
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      select: {
        kind: true,
        status: true,
        classRoom: { select: { levelId: true, capacity: true, level: { select: { name: true } } } },
      },
    }),
    prisma.student.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        ...(academicYearId ? { enrollments: { some: { academicYearId, status: "ACTIVE" } } } : {}),
      },
      select: { gender: true },
    }),
    prisma.staff.findMany({
      where: { schoolId, status: "ACTIVE" },
      select: { jobTitle: true },
    }),
    prisma.level.findMany({ where: { schoolId }, select: { id: true, name: true, sortOrder: true } }),
  ]);

  const active = enrollments.filter((enrollment) => enrollment.status === "ACTIVE");

  const byLevelMap = new Map<string, { levelName: string; count: number; capacity: number }>();
  for (const level of levels) {
    byLevelMap.set(level.id, { levelName: level.name, count: 0, capacity: 0 });
  }
  const seenClassCapacity = new Set<string>();

  for (const enrollment of active) {
    const entry = byLevelMap.get(enrollment.classRoom.levelId);
    if (entry) entry.count += 1;
  }
  // Capacite agregee par niveau : chaque classe n'est comptee qu'une fois.
  const classRooms = await prisma.classRoom.findMany({
    where: { schoolId, ...(academicYearId ? { academicYearId } : {}), status: "ACTIVE" },
    select: { id: true, levelId: true, capacity: true },
  });
  for (const classRoom of classRooms) {
    if (seenClassCapacity.has(classRoom.id)) continue;
    seenClassCapacity.add(classRoom.id);
    const entry = byLevelMap.get(classRoom.levelId);
    if (entry) entry.capacity += classRoom.capacity;
  }

  return {
    activeStudents: active.length,
    newEnrollments: enrollments.filter((e) => e.kind === "INSCRIPTION").length,
    reEnrollments: enrollments.filter((e) => e.kind === "REINSCRIPTION").length,
    withdrawals: enrollments.filter((e) => e.status === "WITHDRAWN" || e.status === "TRANSFERRED_OUT")
      .length,
    byGender: {
      male: students.filter((student) => student.gender === "M").length,
      female: students.filter((student) => student.gender === "F").length,
      unspecified: students.filter((student) => student.gender === "UNSPECIFIED").length,
    },
    byLevel: Array.from(byLevelMap.entries())
      .map(([levelId, value]) => ({ levelId, ...value }))
      .filter((entry) => entry.count > 0 || entry.capacity > 0),
    staffCount: staff.length,
    teacherCount: staff.filter((member) => member.jobTitle === "ENSEIGNANT").length,
  };
}

export type AcademicSnapshot = {
  evaluationsTotal: number;
  evaluationsDraft: number;
  evaluationsAwaitingValidation: number;
  evaluationsPublished: number;
  gradesEntered: number;
  openPeriods: number;
  lockedPeriods: number;
  absencesThisMonth: number;
  lateThisMonth: number;
  assignmentsOpen: number;
  submissionsAwaitingGrading: number;
};

/** Indicateurs pedagogiques. */
export async function getAcademicSnapshot(filters: DashboardFilters): Promise<AcademicSnapshot> {
  const { schoolId, academicYearId } = filters;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [evaluations, grades, periods, attendances, assignments, submissions] = await Promise.all([
    prisma.evaluation.groupBy({
      by: ["status"],
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      _count: { _all: true },
    }),
    prisma.grade.count({ where: { schoolId } }),
    prisma.gradingPeriod.groupBy({
      by: ["status"],
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { schoolId, date: { gte: monthStart } },
      _count: { _all: true },
    }),
    prisma.assignment.count({ where: { schoolId, status: "PUBLISHED" } }),
    prisma.submission.count({
      where: { status: { in: ["REMIS", "EN_RETARD"] }, assignment: { schoolId } },
    }),
  ]);

  const evaluationCount = (status: string) =>
    evaluations.find((row) => row.status === status)?._count._all ?? 0;
  const periodCount = (status: string) => periods.find((row) => row.status === status)?._count._all ?? 0;
  const attendanceCount = (status: string) =>
    attendances.find((row) => row.status === status)?._count._all ?? 0;

  return {
    evaluationsTotal: evaluations.reduce((total, row) => total + row._count._all, 0),
    evaluationsDraft: evaluationCount("DRAFT"),
    evaluationsAwaitingValidation: evaluationCount("SUBMITTED"),
    evaluationsPublished: evaluationCount("PUBLISHED"),
    gradesEntered: grades,
    openPeriods: periodCount("OPEN"),
    lockedPeriods: periodCount("LOCKED"),
    absencesThisMonth: attendanceCount("ABSENT"),
    lateThisMonth: attendanceCount("RETARD"),
    assignmentsOpen: assignments,
    submissionsAwaitingGrading: submissions,
  };
}

/** Evolution mensuelle facture / encaisse, pour les graphiques. */
export async function getMonthlyTrend(
  schoolId: string,
  options: { months?: number; academicYearId?: string } = {},
): Promise<{ month: string; billedMinor: number; collectedMinor: number; expenseMinor: number }[]> {
  const months = options.months ?? 12;
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - (months - 1));

  const [fees, payments, expenses] = await Promise.all([
    prisma.feeAssignment.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        createdAt: { gte: start },
        ...(options.academicYearId ? { academicYearId: options.academicYearId } : {}),
      },
      select: { createdAt: true, grossAmountMinor: true, discounts: true },
    }),
    prisma.payment.findMany({
      where: { schoolId, status: "VALIDATED", paidAt: { gte: start } },
      select: { paidAt: true, amountMinor: true },
    }),
    prisma.expense.findMany({
      where: { schoolId, status: "PAID", paidAt: { gte: start } },
      select: { paidAt: true, amountMinor: true },
    }),
  ]);

  const buckets = new Map<string, { billedMinor: number; collectedMinor: number; expenseMinor: number }>();

  for (let index = 0; index < months; index += 1) {
    const date = new Date(start);
    date.setMonth(start.getMonth() + index);
    buckets.set(monthKey(date), { billedMinor: 0, collectedMinor: 0, expenseMinor: 0 });
  }

  for (const fee of fees) {
    const bucket = buckets.get(monthKey(fee.createdAt));
    if (bucket) {
      bucket.billedMinor += fee.grossAmountMinor - computeDiscount(fee.grossAmountMinor, fee.discounts);
    }
  }
  for (const payment of payments) {
    const bucket = buckets.get(monthKey(payment.paidAt));
    if (bucket) bucket.collectedMinor += payment.amountMinor;
  }
  for (const expense of expenses) {
    if (!expense.paidAt) continue;
    const bucket = buckets.get(monthKey(expense.paidAt));
    if (bucket) bucket.expenseMinor += expense.amountMinor;
  }

  return Array.from(buckets.entries()).map(([month, values]) => ({ month, ...values }));
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Repartition des encaissements par mode de reglement. */
export async function getPaymentMethodBreakdown(
  schoolId: string,
  options: { from?: Date; to?: Date } = {},
): Promise<{ method: string; count: number; amountMinor: number }[]> {
  const rows = await prisma.payment.groupBy({
    by: ["method"],
    where: {
      schoolId,
      status: "VALIDATED",
      ...(options.from || options.to
        ? { paidAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
        : {}),
    },
    _count: { _all: true },
    _sum: { amountMinor: true },
  });

  return rows
    .map((row) => ({
      method: row.method,
      count: row._count._all,
      amountMinor: row._sum.amountMinor ?? 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** Eleves dont le solde restant du est le plus eleve. */
export async function getTopDebtors(
  schoolId: string,
  options: { academicYearId?: string; limit?: number } = {},
): Promise<
  { studentId: string; matricule: string; name: string; className: string; balanceMinor: number }[]
> {
  const students = await prisma.student.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      ...(options.academicYearId
        ? { enrollments: { some: { academicYearId: options.academicYearId, status: "ACTIVE" } } }
        : {}),
    },
    select: {
      id: true,
      matricule: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { status: "ACTIVE" },
        select: { classRoom: { select: { name: true } } },
        take: 1,
      },
      feeAssignments: {
        where: { status: "ACTIVE", ...(options.academicYearId ? { academicYearId: options.academicYearId } : {}) },
        select: { grossAmountMinor: true, discounts: true },
      },
      payments: { where: { status: "VALIDATED" }, select: { amountMinor: true } },
    },
  });

  return students
    .map((student) => {
      const netDue = student.feeAssignments.reduce(
        (total, fee) => total + (fee.grossAmountMinor - computeDiscount(fee.grossAmountMinor, fee.discounts)),
        0,
      );
      const paid = sumBy(student.payments, (payment) => payment.amountMinor);

      return {
        studentId: student.id,
        matricule: student.matricule,
        name: `${student.lastName} ${student.firstName}`,
        className: student.enrollments[0]?.classRoom.name ?? "—",
        balanceMinor: clampPositive(netDue - paid),
      };
    })
    .filter((entry) => entry.balanceMinor > 0)
    .sort((a, b) => b.balanceMinor - a.balanceMinor)
    .slice(0, options.limit ?? 10);
}

/** Budget vs realise, par categorie de depense. */
export async function getBudgetVsActual(
  schoolId: string,
  academicYearId: string,
): Promise<{ label: string; plannedMinor: number; actualMinor: number; rateCenti: number }[]> {
  const [budgets, expenses] = await Promise.all([
    prisma.budget.findMany({ where: { schoolId, academicYearId } }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: { schoolId, status: "PAID" },
      _sum: { amountMinor: true },
    }),
  ]);

  const categories = await prisma.expenseCategory.findMany({
    where: { schoolId },
    select: { id: true, code: true, name: true },
  });
  const actualByCode = new Map<string, number>();

  for (const row of expenses) {
    const category = categories.find((item) => item.id === row.categoryId);
    if (!category) continue;
    actualByCode.set(category.code, (actualByCode.get(category.code) ?? 0) + (row._sum.amountMinor ?? 0));
  }

  return budgets.map((budget) => {
    const actualMinor = actualByCode.get(budget.category) ?? 0;
    return {
      label: budget.label,
      plannedMinor: budget.plannedMinor,
      actualMinor,
      rateCenti: rateCenti(actualMinor, budget.plannedMinor),
    };
  });
}
