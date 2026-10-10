import { prisma, type Db } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

/**
 * Rapprochement bancaire.
 *
 * Le solde COMPTABLE est reconstitue a partir des mouvements reellement
 * enregistres sur le compte financier : solde d'ouverture, encaissements
 * confirmes, depenses payees. Les justificatifs en attente n'y figurent pas —
 * ils ne sont pas des mouvements.
 *
 * L'ecart n'est jamais corrige automatiquement. Un rapprochement constate une
 * difference et oblige a l'expliquer ; il ne « remet pas les compteurs a
 * zero ». Fermer un rapprochement avec un ecart non nul exige une note.
 */

export type ReconciliationBalance = {
  openingBalanceMinor: number;
  /** Encaissements confirmes sur la periode. */
  paymentsMinor: number;
  /** Depenses effectivement payees sur la periode. */
  expensesMinor: number;
  /** Solde comptable a la fin de la periode. */
  bookBalanceMinor: number;
  /** Mouvements anterieurs a la periode, inclus dans le solde d'ouverture retenu. */
  priorBalanceMinor: number;
};

/**
 * Solde comptable d'un compte financier a une date donnee.
 *
 * Les paiements ANNULES sont exclus : un paiement contrepasse n'a pas quitte
 * le compte. Les depenses non payees le sont aussi : un engagement n'est pas
 * un decaissement.
 */
export async function computeAccountBalance(
  schoolId: string,
  financialAccountId: string,
  periodStart: Date,
  periodEnd: Date,
  db: Db = prisma,
): Promise<ReconciliationBalance> {
  const account = await db.financialAccount.findUnique({
    where: { id: financialAccountId },
    select: { id: true, schoolId: true, openingBalanceMinor: true },
  });

  if (!account || account.schoolId !== schoolId) {
    throw new NotFoundError("Compte financier introuvable.");
  }

  const [priorPayments, priorExpenses, payments, expenses] = await Promise.all([
    db.payment.aggregate({
      _sum: { amountMinor: true },
      where: {
        schoolId,
        financialAccountId,
        status: { not: "CANCELLED" },
        paidAt: { lt: periodStart },
      },
    }),
    db.expense.aggregate({
      _sum: { amountMinor: true },
      where: { schoolId, financialAccountId, status: "PAID", paidAt: { lt: periodStart } },
    }),
    db.payment.aggregate({
      _sum: { amountMinor: true },
      where: {
        schoolId,
        financialAccountId,
        status: { not: "CANCELLED" },
        paidAt: { gte: periodStart, lte: periodEnd },
      },
    }),
    db.expense.aggregate({
      _sum: { amountMinor: true },
      where: {
        schoolId,
        financialAccountId,
        status: "PAID",
        paidAt: { gte: periodStart, lte: periodEnd },
      },
    }),
  ]);

  const priorBalanceMinor =
    (priorPayments._sum.amountMinor ?? 0) - (priorExpenses._sum.amountMinor ?? 0);
  const paymentsMinor = payments._sum.amountMinor ?? 0;
  const expensesMinor = expenses._sum.amountMinor ?? 0;

  return {
    openingBalanceMinor: account.openingBalanceMinor,
    priorBalanceMinor,
    paymentsMinor,
    expensesMinor,
    bookBalanceMinor:
      account.openingBalanceMinor + priorBalanceMinor + paymentsMinor - expensesMinor,
  };
}

/** Ouvre un rapprochement sur une periode et fige l'ecart constate. */
export async function createReconciliation(input: {
  schoolId: string;
  financialAccountId: string;
  periodStart: Date;
  periodEnd: Date;
  statementBalanceMinor: number;
  notes?: string;
  userId: string;
}): Promise<{ reconciliationId: string; differenceMinor: number }> {
  if (input.periodEnd < input.periodStart) {
    throw new ValidationError("La fin de periode precede son debut.", {
      periodEnd: ["La date de fin doit suivre la date de debut."],
    });
  }

  if (!Number.isInteger(input.statementBalanceMinor)) {
    throw new ValidationError("Le solde du releve doit etre un montant entier.");
  }

  const balance = await computeAccountBalance(
    input.schoolId,
    input.financialAccountId,
    input.periodStart,
    input.periodEnd,
  );

  // Ecart = releve - comptabilite. Positif : la banque a plus que nos livres.
  const differenceMinor = input.statementBalanceMinor - balance.bookBalanceMinor;

  const reconciliation = await prisma.bankReconciliation.create({
    data: {
      financialAccountId: input.financialAccountId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      statementBalanceMinor: input.statementBalanceMinor,
      bookBalanceMinor: balance.bookBalanceMinor,
      differenceMinor,
      status: "OPEN",
      notes: (input.notes ?? "").slice(0, 2000),
    },
    select: { id: true },
  });

  await recordAudit({
    action: "reconciliation.created",
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "bankReconciliation",
    entityId: reconciliation.id,
    metadata: {
      compte: input.financialAccountId,
      soldeReleveMinor: input.statementBalanceMinor,
      soldeComptableMinor: balance.bookBalanceMinor,
      ecartMinor: differenceMinor,
    },
  });

  return { reconciliationId: reconciliation.id, differenceMinor };
}

/**
 * Cloture un rapprochement.
 *
 * Un ecart non nul doit etre justifie par ecrit. Clore en silence un
 * rapprochement qui ne tombe pas juste reviendrait a effacer le probleme.
 */
export async function closeReconciliation(input: {
  schoolId: string;
  reconciliationId: string;
  notes: string;
  userId: string;
}): Promise<void> {
  const reconciliation = await prisma.bankReconciliation.findUnique({
    where: { id: input.reconciliationId },
    include: { financialAccount: { select: { schoolId: true } } },
  });

  if (!reconciliation || reconciliation.financialAccount.schoolId !== input.schoolId) {
    throw new NotFoundError("Rapprochement introuvable.");
  }

  if (reconciliation.status === "CLOSED") {
    throw new ConflictError("Ce rapprochement est deja cloture.");
  }

  const notes = input.notes.trim().slice(0, 2000);

  if (reconciliation.differenceMinor !== 0 && !notes) {
    throw new ValidationError(
      "L'ecart doit etre explique avant la cloture du rapprochement.",
      { notes: ["Une explication est obligatoire quand l'ecart n'est pas nul."] },
    );
  }

  await prisma.bankReconciliation.update({
    where: { id: input.reconciliationId },
    data: { status: "CLOSED", notes: notes || reconciliation.notes },
  });

  await recordAudit({
    action: "reconciliation.closed",
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "bankReconciliation",
    entityId: input.reconciliationId,
    metadata: { ecartMinor: reconciliation.differenceMinor },
  });
}
