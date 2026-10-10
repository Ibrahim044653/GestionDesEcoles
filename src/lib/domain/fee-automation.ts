import { prisma, type Db } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import {
  computeLatePenaltyMinor,
  parseFinanceSettings,
  resolveSiblingPercentCenti,
} from "./finance-settings";
import { countSiblings } from "./fees";

/**
 * Automatisations financieres : penalites de retard et remise fratrie.
 *
 * Ces traitements sont DECLENCHES MANUELLEMENT par un responsable habilite,
 * pas par une tache de fond invisible. Une penalite qui apparait toute seule
 * sur le compte d'une famille, sans que personne ne l'ait decidee ni datee,
 * est indefendable face a une reclamation.
 *
 * Les deux fonctions proposent un mode `dryRun` : on montre d'abord ce qui
 * serait applique, on applique ensuite.
 */

export type LateFeeLine = {
  installmentId: string;
  studentId: string;
  studentName: string;
  matricule: string;
  label: string;
  dueDate: Date;
  amountMinor: number;
  paidMinor: number;
  currentPenaltyMinor: number;
  newPenaltyMinor: number;
};

/**
 * Calcule les penalites de retard dues pour une annee scolaire.
 *
 * La penalite est RECALCULEE, pas cumulee : rejouer le traitement deux fois le
 * meme jour ne double pas la penalite. Le champ `penaltyMinor` de l'echeance
 * porte toujours le montant total du, jamais un increment.
 */
export async function computeLateFees(input: {
  schoolId: string;
  academicYearId: string;
  asOf?: Date;
  db?: Db;
}): Promise<{ lines: LateFeeLine[]; totalNewMinor: number; enabled: boolean }> {
  const db = input.db ?? prisma;
  const asOf = input.asOf ?? new Date();

  const school = await db.school.findUniqueOrThrow({
    where: { id: input.schoolId },
    select: { accountingSettings: true },
  });

  const settings = parseFinanceSettings(school.accountingSettings).lateFee;
  if (!settings.enabled) return { lines: [], totalNewMinor: 0, enabled: false };

  const installments = await db.installment.findMany({
    where: {
      schoolId: input.schoolId,
      dueDate: { lt: asOf },
      feeAssignment: { academicYearId: input.academicYearId, status: "ACTIVE" },
    },
    include: {
      allocations: { select: { amountMinor: true } },
      feeAssignment: {
        select: {
          studentId: true,
          student: { select: { matricule: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  const lines: LateFeeLine[] = [];

  for (const installment of installments) {
    const paidMinor = installment.allocations.reduce(
      (total, allocation) => total + allocation.amountMinor,
      0,
    );

    const newPenaltyMinor = computeLatePenaltyMinor(
      { amountMinor: installment.amountMinor, dueDate: installment.dueDate, paidMinor },
      asOf,
      settings,
    );

    if (newPenaltyMinor === installment.penaltyMinor) continue;

    lines.push({
      installmentId: installment.id,
      studentId: installment.feeAssignment.studentId,
      studentName: `${installment.feeAssignment.student.lastName} ${installment.feeAssignment.student.firstName}`,
      matricule: installment.feeAssignment.student.matricule,
      label: installment.label,
      dueDate: installment.dueDate,
      amountMinor: installment.amountMinor,
      paidMinor,
      currentPenaltyMinor: installment.penaltyMinor,
      newPenaltyMinor,
    });
  }

  return {
    lines,
    totalNewMinor: lines.reduce(
      (total, line) => total + (line.newPenaltyMinor - line.currentPenaltyMinor),
      0,
    ),
    enabled: true,
  };
}

/** Applique les penalites calculees. Trace l'operation dans le journal d'audit. */
export async function applyLateFees(input: {
  schoolId: string;
  academicYearId: string;
  userId: string;
  asOf?: Date;
}): Promise<{ applied: number; totalMinor: number }> {
  const asOf = input.asOf ?? new Date();
  const { lines, enabled } = await computeLateFees({
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,
    asOf,
  });

  if (!enabled || lines.length === 0) return { applied: 0, totalMinor: 0 };

  // Une seule transaction : un lot de penalites applique a moitie laisserait
  // des familles penalisees et d'autres non, sans moyen de savoir lesquelles.
  // Forme « callback » : la forme tableau n'accepte pas de delai, et un lot de
  // plusieurs centaines d'echeances depasse les 5 s par defaut de Prisma.
  await prisma.$transaction(
    async (tx) => {
      for (const line of lines) {
        await tx.installment.update({
          where: { id: line.installmentId },
          data: { penaltyMinor: line.newPenaltyMinor },
        });
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  const totalMinor = lines.reduce(
    (total, line) => total + (line.newPenaltyMinor - line.currentPenaltyMinor),
    0,
  );

  await recordAudit({
    action: "fee.late_penalties_applied",
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "academicYear",
    entityId: input.academicYearId,
    metadata: {
      echeances: lines.length,
      variationMinor: totalMinor,
      calculeAu: asOf.toISOString(),
    },
  });

  return { applied: lines.length, totalMinor };
}

export type SiblingDiscountLine = {
  feeAssignmentId: string;
  studentId: string;
  studentName: string;
  matricule: string;
  label: string;
  grossAmountMinor: number;
  childCount: number;
  percentCenti: number;
  /** Une remise fratrie existe-t-elle deja sur ce frais ? */
  alreadyGranted: boolean;
};

/**
 * Determine les remises fratrie a accorder sur une annee scolaire.
 *
 * Un frais qui porte DEJA une remise fratrie est signale mais jamais modifie :
 * l'etablissement a pu accorder un taux negocie, le traitement automatique ne
 * doit pas l'ecraser.
 */
export async function computeSiblingDiscounts(input: {
  schoolId: string;
  academicYearId: string;
  db?: Db;
}): Promise<{ lines: SiblingDiscountLine[]; enabled: boolean }> {
  const db = input.db ?? prisma;

  const school = await db.school.findUniqueOrThrow({
    where: { id: input.schoolId },
    select: { accountingSettings: true },
  });

  const settings = parseFinanceSettings(school.accountingSettings).siblingDiscount;
  if (!settings.enabled || settings.tiers.length === 0) return { lines: [], enabled: false };

  const assignments = await db.feeAssignment.findMany({
    where: {
      schoolId: input.schoolId,
      academicYearId: input.academicYearId,
      status: "ACTIVE",
      ...(settings.categories.length > 0 ? { category: { in: settings.categories } } : {}),
    },
    include: {
      student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
      discounts: { select: { kind: true } },
    },
  });

  // Le nombre de freres et soeurs est identique pour tous les frais d'un meme
  // eleve : on le calcule une fois par eleve, pas une fois par ligne.
  const childCountByStudent = new Map<string, number>();
  const lines: SiblingDiscountLine[] = [];

  for (const assignment of assignments) {
    let childCount = childCountByStudent.get(assignment.studentId);
    if (childCount === undefined) {
      childCount = await countSiblings(
        input.schoolId,
        assignment.studentId,
        input.academicYearId,
      );
      childCountByStudent.set(assignment.studentId, childCount);
    }

    const percentCenti = resolveSiblingPercentCenti(childCount, settings);
    if (percentCenti === 0) continue;

    lines.push({
      feeAssignmentId: assignment.id,
      studentId: assignment.studentId,
      studentName: `${assignment.student.lastName} ${assignment.student.firstName}`,
      matricule: assignment.student.matricule,
      label: assignment.label,
      grossAmountMinor: assignment.grossAmountMinor,
      childCount,
      percentCenti,
      alreadyGranted: assignment.discounts.some((discount) => discount.kind === "FRATRIE"),
    });
  }

  return { lines, enabled: true };
}

/** Accorde les remises fratrie manquantes. Les remises existantes sont laissees telles quelles. */
export async function applySiblingDiscounts(input: {
  schoolId: string;
  academicYearId: string;
  userId: string;
}): Promise<{ granted: number; skipped: number }> {
  const { lines, enabled } = await computeSiblingDiscounts({
    schoolId: input.schoolId,
    academicYearId: input.academicYearId,
  });

  if (!enabled) return { granted: 0, skipped: 0 };

  const toGrant = lines.filter((line) => !line.alreadyGranted);
  const skipped = lines.length - toGrant.length;

  if (toGrant.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        for (const line of toGrant) {
          await tx.discount.create({
            data: {
              feeAssignmentId: line.feeAssignmentId,
              kind: "FRATRIE",
              label: `Remise fratrie (${line.childCount} enfants scolarises)`,
              percentCenti: line.percentCenti,
              grantedById: input.userId,
              reason: "Appliquee automatiquement selon les paliers de l'etablissement.",
            },
          });
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  await recordAudit({
    action: "fee.sibling_discounts_applied",
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "academicYear",
    entityId: input.academicYearId,
    metadata: { accordees: toGrant.length, deja_presentes: skipped },
  });

  return { granted: toGrant.length, skipped };
}
