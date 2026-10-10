"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import {
  parseFormData,
  paymentSchema,
  proofReviewSchema,
  discountSchema,
  feeItemSchema,
  expenseSchema,
} from "@/lib/validation";
import { fail, ok, ConflictError, NotFoundError, ValidationError, type ActionResult } from "@/lib/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { parseAmountToMinor, currencyDecimals } from "@/lib/money";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  recordPayment,
  cancelPayment,
  reviewPaymentProof,
  requestRefund,
  payRefund,
} from "@/lib/domain/payments";
import { assignFeeToStudent, grantDiscount, parseInstallmentPlan } from "@/lib/domain/fees";
import { nextExpenseReference } from "@/lib/domain/sequences";
import {
  postJournalEntry,
  reverseJournalEntry,
  treasuryAccountForMethod,
} from "@/lib/domain/accounting";
import { getCurrentAcademicYear } from "@/lib/domain/school-context";

/**
 * Actions financieres.
 *
 * Toutes passent par requirePermission puis verifient le tenant de chaque
 * ressource manipulee. Les operations d'encaissement sont idempotentes.
 */

// ---------------------------------------------------------------------------
// Encaissements
// ---------------------------------------------------------------------------

export async function recordPaymentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ paymentId: string; receiptNumber: string; wasDuplicate: boolean }>> {
  try {
    const context = await requirePermission(PERMISSIONS.PAYMENT_CREATE);
    await consumeRateLimit(`payment:${context.user.id}`, RATE_LIMITS.PAYMENT);

    const input = parseFormData(paymentSchema(context.school.currency), formData);

    const student = await prisma.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, schoolId: true, status: true, lastName: true, firstName: true },
    });
    await assertSameSchool(context, student, "student");

    if (student!.status !== "ACTIVE") {
      throw new ConflictError(
        "Cet eleve n'est plus actif. Reactivez son dossier avant d'enregistrer un encaissement.",
      );
    }

    const academicYear = await getCurrentAcademicYear(context.school.id);

    const result = await recordPayment({
      schoolId: context.school.id,
      studentId: input.studentId,
      amountMinor: input.amount,
      method: input.method,
      paidAt: new Date(input.paidAt),
      cashierId: context.user.id,
      financialAccountId: input.financialAccountId || null,
      externalReference: input.externalReference,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      academicYearId: academicYear?.id,
    });

    revalidatePath("/finance/paiements");
    revalidatePath(`/eleves/${input.studentId}`);

    return ok(
      {
        paymentId: result.paymentId,
        receiptNumber: result.receiptNumber,
        wasDuplicate: result.wasDuplicate,
      },
      result.wasDuplicate
        ? `Ce reglement avait deja ete enregistre (recu ${result.receiptNumber}). Aucun double encaissement n'a ete cree.`
        : `Encaissement enregistre. Recu ${result.receiptNumber}.` +
            (result.unallocatedMinor > 0
              ? ` ${result.unallocatedMinor} non impute (avance sur frais a venir).`
              : ""),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function cancelPaymentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.PAYMENT_CANCEL);
    const paymentId = String(formData.get("paymentId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();

    if (reason.length < 5) {
      throw new ValidationError("Motif d'annulation trop court.", {
        reason: ["Indiquez un motif d'au moins 5 caracteres."],
      });
    }

    await cancelPayment({
      schoolId: context.school.id,
      paymentId,
      reason,
      userId: context.user.id,
    });

    revalidatePath("/finance/paiements");
    return ok(
      undefined,
      "Paiement annule. L'ecriture comptable a ete contrepassee ; rien n'a ete supprime.",
    );
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Justificatifs
// ---------------------------------------------------------------------------

/**
 * Arbitrage d'un justificatif par le comptable.
 * Seul ce geste transforme une declaration en encaissement reel.
 */
export async function reviewProofAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ paymentId?: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.PROOF_REVIEW);
    const input = parseFormData(proofReviewSchema, formData);

    let confirmedAmountMinor: number | undefined;
    if (input.decision === "ACCEPTE" && input.confirmedAmount.trim()) {
      confirmedAmountMinor = parseAmountToMinor(
        input.confirmedAmount,
        currencyDecimals(context.school.currency),
      );
    }

    const academicYear = await getCurrentAcademicYear(context.school.id);

    const result = await reviewPaymentProof({
      schoolId: context.school.id,
      proofId: input.proofId,
      decision: input.decision,
      reviewerId: context.user.id,
      rejectionReason: input.rejectionReason,
      confirmedAmountMinor,
      financialAccountId: input.financialAccountId || null,
      academicYearId: academicYear?.id,
    });

    revalidatePath("/finance/justificatifs");
    revalidatePath("/finance/paiements");

    return ok(
      { paymentId: result.paymentId },
      input.decision === "ACCEPTE"
        ? `Justificatif accepte. Encaissement ${result.reference} cree et recu emis.`
        : "Justificatif rejete. La famille est notifiee du motif.",
    );
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Frais et remises
// ---------------------------------------------------------------------------

export async function createFeeItemAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ feeItemId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.FEE_MANAGE);
    const input = parseFormData(feeItemSchema(context.school.currency), formData);

    const year = await prisma.academicYear.findUnique({
      where: { id: input.academicYearId },
      select: { id: true, schoolId: true, status: true },
    });
    await assertSameSchool(context, year, "academicYear");
    if (year!.status === "CLOSED") throw new ConflictError("Cette annee scolaire est cloturee.");

    // Echeancier facultatif, transmis en JSON par le formulaire.
    const rawPlan = String(formData.get("installmentPlan") ?? "[]");
    const plan = parseInstallmentPlan(rawPlan);

    const feeItem = await prisma.feeItem.create({
      data: {
        schoolId: context.school.id,
        academicYearId: input.academicYearId,
        code: input.code.toUpperCase(),
        name: input.name,
        category: input.category,
        amountMinor: input.amount,
        currency: context.school.currency,
        levelId: input.levelId || null,
        trackId: input.trackId || null,
        classRoomId: input.classRoomId || null,
        isMandatory: input.isMandatory,
        autoAssign: input.autoAssign,
        installmentPlan: JSON.stringify(plan),
      },
      select: { id: true },
    });

    revalidatePath("/finance/frais");
    return ok({ feeItemId: feeItem.id }, "Frais ajoute au catalogue.");
  } catch (error) {
    return fail(error);
  }
}

/** Applique un frais du catalogue a un eleve precis. */
export async function assignFeeAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.FEE_ASSIGN);
    const studentId = String(formData.get("studentId") ?? "");
    const feeItemId = String(formData.get("feeItemId") ?? "");

    const [student, feeItem] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { id: true, schoolId: true } }),
      prisma.feeItem.findUnique({ where: { id: feeItemId } }),
    ]);

    await assertSameSchool(context, student, "student");
    await assertSameSchool(context, feeItem, "feeItem");

    const alreadyAssigned = await prisma.feeAssignment.findFirst({
      where: {
        studentId,
        feeItemId,
        academicYearId: feeItem!.academicYearId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (alreadyAssigned) {
      throw new ConflictError("Ce frais est deja applique a cet eleve pour cette annee.");
    }

    await assignFeeToStudent({
      schoolId: context.school.id,
      studentId,
      academicYearId: feeItem!.academicYearId,
      feeItemId: feeItem!.id,
      label: feeItem!.name,
      category: feeItem!.category,
      grossAmountMinor: feeItem!.amountMinor,
      installmentPlan: parseInstallmentPlan(feeItem!.installmentPlan),
      userId: context.user.id,
    });

    revalidatePath(`/eleves/${studentId}`);
    return ok(undefined, `Frais "${feeItem!.name}" applique a l'eleve.`);
  } catch (error) {
    return fail(error);
  }
}

export async function grantDiscountAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.DISCOUNT_GRANT);
    const input = parseFormData(discountSchema(context.school.currency), formData);

    const fee = await prisma.feeAssignment.findUnique({
      where: { id: input.feeAssignmentId },
      select: { id: true, schoolId: true, studentId: true },
    });
    await assertSameSchool(context, fee, "feeAssignment");

    const amountMinor =
      input.mode === "MONTANT"
        ? parseAmountToMinor(input.amount, currencyDecimals(context.school.currency))
        : null;
    const percentCenti =
      input.mode === "POURCENTAGE"
        ? Math.round(Number.parseFloat(input.percent.replace(",", ".")) * 100)
        : null;

    await grantDiscount({
      schoolId: context.school.id,
      feeAssignmentId: input.feeAssignmentId,
      kind: input.kind,
      label: input.label,
      amountMinor,
      percentCenti,
      reason: input.reason,
      userId: context.user.id,
    });

    revalidatePath(`/eleves/${fee!.studentId}`);
    return ok(undefined, "Remise accordee et tracee.");
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Remboursements
// ---------------------------------------------------------------------------

export async function requestRefundAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.REFUND_REQUEST);
    const studentId = String(formData.get("studentId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    const method = String(formData.get("method") ?? "ESPECES");
    const amountMinor = parseAmountToMinor(
      String(formData.get("amount") ?? ""),
      currencyDecimals(context.school.currency),
    );

    await requestRefund({
      schoolId: context.school.id,
      studentId,
      amountMinor,
      reason,
      method,
      userId: context.user.id,
    });

    revalidatePath("/finance/paiements");
    return ok(undefined, "Demande de remboursement enregistree, en attente de versement.");
  } catch (error) {
    return fail(error);
  }
}

export async function payRefundAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.REFUND_APPROVE);
    const refundId = String(formData.get("refundId") ?? "");

    await payRefund({ schoolId: context.school.id, refundId, userId: context.user.id });

    revalidatePath("/finance/paiements");
    return ok(undefined, "Remboursement verse et comptabilise.");
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Depenses
// ---------------------------------------------------------------------------

export async function createExpenseAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ expenseId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
    const input = parseFormData(expenseSchema(context.school.currency), formData);

    const category = await prisma.expenseCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, category, "expenseCategory");

    const expense = await prisma.$transaction(async (tx) => {
      const reference = await nextExpenseReference(tx, context.school.id);

      return tx.expense.create({
        data: {
          schoolId: context.school.id,
          categoryId: input.categoryId,
          supplierId: input.supplierId || null,
          financialAccountId: input.financialAccountId || null,
          reference,
          label: input.label,
          description: input.description,
          amountMinor: input.amount,
          currency: context.school.currency,
          // Une depense nait en demande : elle ne touche la tresorerie
          // qu'apres approbation puis reglement effectif.
          status: "REQUESTED",
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          paymentMethod: input.paymentMethod,
        },
        select: { id: true, reference: true },
      });
    });

    await recordAudit({
      action: AUDIT_ACTIONS.EXPENSE_CREATED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "expense",
      entityId: expense.id,
      metadata: { reference: expense.reference, amountMinor: input.amount },
    });

    revalidatePath("/finance/depenses");
    return ok({ expenseId: expense.id }, `Demande de depense ${expense.reference} enregistree.`);
  } catch (error) {
    return fail(error);
  }
}

export async function approveExpenseAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.EXPENSE_APPROVE);
    const expenseId = String(formData.get("expenseId") ?? "");
    const decision = String(formData.get("decision") ?? "APPROVED");
    const reason = String(formData.get("rejectionReason") ?? "").trim();

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, schoolId: true, status: true },
    });
    await assertSameSchool(context, expense, "expense");

    if (expense!.status !== "REQUESTED" && expense!.status !== "DRAFT") {
      throw new ConflictError("Cette depense a deja ete traitee.");
    }
    if (decision === "REJECTED" && !reason) {
      throw new ValidationError("Un motif de rejet est obligatoire.", {
        rejectionReason: ["Indiquez pourquoi la depense est refusee."],
      });
    }

    await prisma.expense.update({
      where: { id: expenseId },
      data: {
        status: decision,
        approvedById: context.user.id,
        approvedAt: new Date(),
        rejectionReason: decision === "REJECTED" ? reason : "",
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.EXPENSE_APPROVED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "expense",
      entityId: expenseId,
      metadata: { decision, reason },
    });

    revalidatePath("/finance/depenses");
    return ok(undefined, decision === "APPROVED" ? "Depense approuvee." : "Depense refusee.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Reglement effectif d'une depense : c'est ce geste qui genere l'ecriture
 * comptable (charge au debit, tresorerie au credit).
 */
export async function payExpenseAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.EXPENSE_PAY);
    const expenseId = String(formData.get("expenseId") ?? "");

    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        include: { category: { select: { defaultAccountCode: true, name: true } } },
      });

      if (!expense || expense.schoolId !== context.school.id) {
        throw new NotFoundError("Depense introuvable.");
      }
      if (expense.status === "PAID") throw new ConflictError("Cette depense est deja reglee.");
      if (expense.status !== "APPROVED") {
        throw new ConflictError("Seule une depense approuvee peut etre reglee.");
      }

      const chargeAccount = expense.category.defaultAccountCode || "628";

      await tx.expense.update({
        where: { id: expenseId },
        data: { status: "PAID", paidAt: new Date() },
      });

      await postJournalEntry(tx, {
        schoolId: context.school.id,
        journalCode: "AC",
        date: new Date(),
        label: `${expense.reference} - ${expense.label}`,
        sourceType: "EXPENSE",
        sourceId: expense.id,
        postedById: context.user.id,
        lines: [
          { accountCode: chargeAccount, debitMinor: expense.amountMinor },
          {
            accountCode: treasuryAccountForMethod(expense.paymentMethod),
            creditMinor: expense.amountMinor,
          },
        ],
      });
    });

    await recordAudit({
      action: AUDIT_ACTIONS.EXPENSE_PAID,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "expense",
      entityId: expenseId,
    });

    revalidatePath("/finance/depenses");
    revalidatePath("/finance/comptabilite");
    return ok(undefined, "Depense reglee et comptabilisee.");
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Comptabilite
// ---------------------------------------------------------------------------

export async function reverseEntryAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.JOURNAL_REVERSE);
    const entryId = String(formData.get("entryId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();

    if (reason.length < 5) {
      throw new ValidationError("Motif obligatoire.", {
        reason: ["Indiquez le motif de la contrepassation (5 caracteres minimum)."],
      });
    }

    await prisma.$transaction(async (tx) => {
      await reverseJournalEntry(tx, {
        schoolId: context.school.id,
        entryId,
        reason,
        postedById: context.user.id,
      });
    });

    await recordAudit({
      action: AUDIT_ACTIONS.JOURNAL_REVERSED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "journalEntry",
      entityId: entryId,
      metadata: { reason },
    });

    revalidatePath("/finance/comptabilite");
    return ok(undefined, "Ecriture contrepassee. L'ecriture d'origine reste consultable.");
  } catch (error) {
    return fail(error);
  }
}

/** Cloture d'une periode comptable : plus aucune ecriture n'y est acceptee. */
export async function closePeriodAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.PERIOD_CLOSE);
    const periodId = String(formData.get("periodId") ?? "");

    const period = await prisma.accountingPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, schoolId: true, status: true, name: true },
    });
    await assertSameSchool(context, period, "accountingPeriod");

    if (period!.status === "CLOSED") throw new ConflictError("Cette periode est deja cloturee.");

    // Une ecriture restee en brouillon bloque la cloture : elle serait
    // silencieusement perdue des comptes.
    const drafts = await prisma.journalEntry.count({
      where: { schoolId: context.school.id, periodId, status: "DRAFT" },
    });
    if (drafts > 0) {
      throw new ConflictError(
        `${drafts} ecriture(s) sont encore en brouillon sur cette periode. Validez-les ou supprimez-les avant la cloture.`,
      );
    }

    await prisma.accountingPeriod.update({
      where: { id: periodId },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.PERIOD_CLOSED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "accountingPeriod",
      entityId: periodId,
      metadata: { name: period!.name },
    });

    revalidatePath("/finance/comptabilite");
    return ok(undefined, `Periode "${period!.name}" cloturee.`);
  } catch (error) {
    return fail(error);
  }
}
