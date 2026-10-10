import { prisma, type Db } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { allocate, percentOf } from "@/lib/money";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { postJournalEntry, revenueAccountForCategory } from "./accounting";

/**
 * Frais scolaires : catalogue, affectation aux eleves et echeanciers.
 *
 * Le catalogue (FeeItem) decrit ce qui est du "en general" ; FeeAssignment
 * materialise ce qu'un eleve precis doit reellement. Separer les deux permet
 * de modifier un tarif l'annee suivante sans reecrire l'historique.
 */

export type InstallmentPlanEntry = {
  label: string;
  /** Part de l'echeance, en centiemes de pourcent (4000 = 40,00 %). */
  percentCenti?: number;
  /** Montant fixe, prioritaire sur percentCenti s'il est fourni. */
  amountMinor?: number;
  dueDate: string; // ISO yyyy-mm-dd
};

export function parseInstallmentPlan(raw: string | null | undefined): InstallmentPlanEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InstallmentPlanEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Transforme un modele d'echeancier en echeances concretes.
 *
 * Garantie : la somme des echeances est EXACTEMENT egale au montant du.
 * Le reliquat d'arrondi est absorbe par la repartition au plus fort reste
 * (voir allocate), jamais perdu ni invente.
 */
export function buildInstallments(
  netAmountMinor: number,
  plan: readonly InstallmentPlanEntry[],
): { label: string; amountMinor: number; dueDate: Date; sortOrder: number }[] {
  if (plan.length === 0) return [];

  const fixedTotal = plan.reduce((total, entry) => total + (entry.amountMinor ?? 0), 0);
  if (fixedTotal > netAmountMinor) {
    throw new ValidationError(
      "Le total des echeances a montant fixe depasse le montant du frais.",
    );
  }

  const variable = plan.filter((entry) => entry.amountMinor === undefined);
  const remaining = netAmountMinor - fixedTotal;

  // Repartition du reliquat selon les pourcentages, sans perte d'unite.
  const weights = variable.map((entry) => entry.percentCenti ?? 0);
  const shares =
    variable.length > 0
      ? allocate(remaining, weights.every((w) => w === 0) ? variable.map(() => 1) : weights)
      : [];

  let variableIndex = 0;

  return plan.map((entry, index) => {
    const amountMinor =
      entry.amountMinor !== undefined ? entry.amountMinor : shares[variableIndex++] ?? 0;

    const dueDate = new Date(entry.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new ValidationError(`Date d'echeance invalide pour "${entry.label}".`);
    }

    return { label: entry.label, amountMinor, dueDate, sortOrder: index };
  });
}

/** Remise totale accordee sur un montant brut (identique a student-account). */
export function discountTotal(
  grossMinor: number,
  discounts: readonly { amountMinor: number | null; percentCenti: number | null }[],
): number {
  const total = discounts.reduce(
    (sum, discount) =>
      sum + (discount.amountMinor ?? 0) + (discount.percentCenti ? percentOf(grossMinor, discount.percentCenti) : 0),
    0,
  );
  return Math.min(Math.max(total, 0), Math.max(grossMinor, 0));
}

/**
 * Affecte un frais du catalogue a un eleve et genere son echeancier.
 *
 * Constate egalement le produit en comptabilite (creance 411 / produit 7xx) :
 * c'est l'EMISSION du frais qui cree le chiffre d'affaires, pas l'encaissement.
 */
export async function assignFeeToStudent(input: {
  schoolId: string;
  studentId: string;
  academicYearId: string;
  feeItemId?: string | null;
  label: string;
  category: string;
  grossAmountMinor: number;
  installmentPlan?: InstallmentPlanEntry[];
  note?: string;
  userId: string;
  db?: Db;
  /** Comptabiliser la creance. Desactive pour les imports en masse differes. */
  postAccounting?: boolean;
}): Promise<{ feeAssignmentId: string }> {
  if (!Number.isInteger(input.grossAmountMinor) || input.grossAmountMinor < 0) {
    throw new ValidationError("Le montant d'un frais doit etre un entier positif ou nul.");
  }

  const run = async (tx: Db) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: { schoolId: true, lastName: true, firstName: true },
    });
    if (!student || student.schoolId !== input.schoolId) {
      throw new NotFoundError("Eleve introuvable dans cet etablissement.");
    }

    const year = await tx.academicYear.findUnique({
      where: { id: input.academicYearId },
      select: { schoolId: true, status: true, name: true },
    });
    if (!year || year.schoolId !== input.schoolId) throw new NotFoundError("Annee scolaire introuvable.");
    if (year.status === "CLOSED") {
      throw new ConflictError(`L'annee ${year.name} est cloturee : aucun frais ne peut y etre ajoute.`);
    }

    const school = await tx.school.findUnique({
      where: { id: input.schoolId },
      select: { currency: true },
    });

    const assignment = await tx.feeAssignment.create({
      data: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        academicYearId: input.academicYearId,
        feeItemId: input.feeItemId ?? null,
        label: input.label,
        category: input.category,
        grossAmountMinor: input.grossAmountMinor,
        currency: school?.currency ?? "XOF",
        note: input.note ?? "",
      },
      select: { id: true },
    });

    const installments = buildInstallments(input.grossAmountMinor, input.installmentPlan ?? []);
    if (installments.length > 0) {
      await tx.installment.createMany({
        data: installments.map((installment) => ({
          schoolId: input.schoolId,
          feeAssignmentId: assignment.id,
          label: installment.label,
          amountMinor: installment.amountMinor,
          dueDate: installment.dueDate,
          sortOrder: installment.sortOrder,
        })),
      });
    }

    if (input.postAccounting !== false && input.grossAmountMinor > 0) {
      await postJournalEntry(tx, {
        schoolId: input.schoolId,
        journalCode: "VE",
        date: new Date(),
        label: `Frais ${input.label} - ${student.lastName} ${student.firstName}`,
        sourceType: "FEE",
        sourceId: assignment.id,
        postedById: input.userId,
        lines: [
          { accountCode: "411", debitMinor: input.grossAmountMinor },
          {
            accountCode: revenueAccountForCategory(input.category),
            creditMinor: input.grossAmountMinor,
          },
        ],
      });
    }

    return assignment.id;
  };

  const feeAssignmentId = input.db ? await run(input.db) : await prisma.$transaction(run);

  // L'audit emprunte la MEME connexion que l'operation lorsqu'une transaction
  // est en cours : utiliser le client global ouvrirait une seconde connexion,
  // bloquee par le verrou d'ecriture, et l'evenement serait perdu.
  await recordAudit(
    {
      action: AUDIT_ACTIONS.FEE_ASSIGNED,
      schoolId: input.schoolId,
      userId: input.userId,
      entityType: "feeAssignment",
      entityId: feeAssignmentId,
      metadata: {
        studentId: input.studentId,
        label: input.label,
        grossAmountMinor: input.grossAmountMinor,
      },
    },
    input.db ?? prisma,
  );

  return { feeAssignmentId };
}

/**
 * Applique automatiquement tous les frais obligatoires correspondant a une
 * inscription (niveau, filiere, classe). Un frais deja affecte n'est pas
 * duplique : la fonction est rejouable sans effet de bord.
 */
export async function applyAutomaticFees(input: {
  schoolId: string;
  studentId: string;
  academicYearId: string;
  classRoomId: string;
  userId: string;
  db?: Db;
}): Promise<{ applied: number; skipped: number }> {
  const db = input.db ?? prisma;

  const classRoom = await db.classRoom.findUnique({
    where: { id: input.classRoomId },
    select: { id: true, schoolId: true, levelId: true, trackId: true },
  });
  if (!classRoom || classRoom.schoolId !== input.schoolId) throw new NotFoundError("Classe introuvable.");

  const candidates = await db.feeItem.findMany({
    where: {
      schoolId: input.schoolId,
      academicYearId: input.academicYearId,
      isActive: true,
      autoAssign: true,
      OR: [
        { classRoomId: classRoom.id },
        { classRoomId: null, levelId: classRoom.levelId },
        { classRoomId: null, levelId: null, trackId: classRoom.trackId },
        { classRoomId: null, levelId: null, trackId: null },
      ],
    },
  });

  const existing = await db.feeAssignment.findMany({
    where: { schoolId: input.schoolId, studentId: input.studentId, academicYearId: input.academicYearId },
    select: { feeItemId: true },
  });
  const alreadyAssigned = new Set(existing.map((fee) => fee.feeItemId).filter(Boolean));

  let applied = 0;
  let skipped = 0;

  for (const item of candidates) {
    if (alreadyAssigned.has(item.id)) {
      skipped += 1;
      continue;
    }

    await assignFeeToStudent({
      schoolId: input.schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      feeItemId: item.id,
      label: item.name,
      category: item.category,
      grossAmountMinor: item.amountMinor,
      installmentPlan: parseInstallmentPlan(item.installmentPlan),
      userId: input.userId,
      db,
    });
    applied += 1;
  }

  return { applied, skipped };
}

/**
 * Accorde une remise sur un frais.
 * Une remise ne modifie jamais le montant brut : elle est enregistree a part,
 * ce qui preserve la tracabilite (qui a accorde quoi, pourquoi).
 */
export async function grantDiscount(input: {
  schoolId: string;
  feeAssignmentId: string;
  kind: string;
  label: string;
  amountMinor?: number | null;
  percentCenti?: number | null;
  reason?: string;
  userId: string;
}): Promise<{ discountId: string }> {
  if (input.amountMinor == null && input.percentCenti == null) {
    throw new ValidationError("Indiquez soit un montant, soit un pourcentage de remise.");
  }
  if (input.amountMinor != null && input.amountMinor <= 0) {
    throw new ValidationError("Le montant de la remise doit etre strictement positif.");
  }
  if (input.percentCenti != null && (input.percentCenti <= 0 || input.percentCenti > 10_000)) {
    throw new ValidationError("Le pourcentage de remise doit etre compris entre 0 et 100 %.");
  }

  const fee = await prisma.feeAssignment.findUnique({
    where: { id: input.feeAssignmentId },
    select: { id: true, schoolId: true, grossAmountMinor: true, discounts: true },
  });
  if (!fee || fee.schoolId !== input.schoolId) throw new NotFoundError("Frais introuvable.");

  // Garde-fou : le cumul des remises ne peut pas depasser le montant du.
  const projected = discountTotal(fee.grossAmountMinor, [
    ...fee.discounts.map((d) => ({ amountMinor: d.amountMinor, percentCenti: d.percentCenti })),
    { amountMinor: input.amountMinor ?? null, percentCenti: input.percentCenti ?? null },
  ]);
  const raw = fee.discounts.reduce(
    (sum, d) => sum + (d.amountMinor ?? 0) + (d.percentCenti ? percentOf(fee.grossAmountMinor, d.percentCenti) : 0),
    (input.amountMinor ?? 0) + (input.percentCenti ? percentOf(fee.grossAmountMinor, input.percentCenti) : 0),
  );
  if (raw > fee.grossAmountMinor) {
    throw new ValidationError(
      `Le cumul des remises (${raw}) depasserait le montant du frais (${fee.grossAmountMinor}). ` +
        `Remise maximale encore possible : ${fee.grossAmountMinor - projected + (raw - projected)}.`,
    );
  }

  const discount = await prisma.discount.create({
    data: {
      feeAssignmentId: input.feeAssignmentId,
      kind: input.kind,
      label: input.label,
      amountMinor: input.amountMinor ?? null,
      percentCenti: input.percentCenti ?? null,
      grantedById: input.userId,
      reason: input.reason ?? "",
    },
    select: { id: true },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.DISCOUNT_GRANTED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "discount",
    entityId: discount.id,
    metadata: {
      feeAssignmentId: input.feeAssignmentId,
      kind: input.kind,
      amountMinor: input.amountMinor,
      percentCenti: input.percentCenti,
    },
  });

  return { discountId: discount.id };
}

/**
 * Remise fratrie : calcule le nombre d'enfants d'un meme responsable legal
 * inscrits et actifs. Le taux applique reste decide par l'etablissement.
 */
export async function countSiblings(
  schoolId: string,
  studentId: string,
  academicYearId: string,
): Promise<number> {
  const links = await prisma.studentGuardian.findMany({
    where: { studentId },
    select: { guardianId: true },
  });
  if (links.length === 0) return 1;

  const siblings = await prisma.studentGuardian.findMany({
    where: {
      guardianId: { in: links.map((link) => link.guardianId) },
      student: {
        schoolId,
        status: "ACTIVE",
        enrollments: { some: { academicYearId, status: "ACTIVE" } },
      },
    },
    select: { studentId: true },
  });

  return new Set(siblings.map((sibling) => sibling.studentId)).size;
}
