import { prisma } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { allocateToDebts, clampPositive } from "@/lib/money";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { nextPaymentReference, nextReceiptNumber } from "./sequences";
import { openDebts } from "./student-account";
import {
  postJournalEntry,
  reverseJournalEntry,
  journalForMethod,
  treasuryAccountForMethod,
} from "./accounting";
import { notifyUsers } from "./notifications";

/**
 * Encaissements, justificatifs et recus.
 *
 * GARANTIES (cahier des charges 9) :
 *  1. IDEMPOTENCE - une meme cle d'idempotence ne cree jamais deux
 *     encaissements. Un double clic ou un rejeu reseau renvoie le paiement
 *     deja enregistre.
 *  2. ATOMICITE - paiement, imputations, recu et ecriture comptable sont
 *     ecrits dans une seule transaction, ou pas du tout.
 *  3. SEPARATION DECLARATION / ENCAISSEMENT - un justificatif televerse par
 *     une famille ne cree un Payment qu'au moment de son acceptation.
 */

export type RecordPaymentInput = {
  schoolId: string;
  studentId: string;
  amountMinor: number;
  method: string;
  paidAt: Date;
  cashierId: string;
  financialAccountId?: string | null;
  externalReference?: string;
  note?: string;
  /** Cle fournie par le formulaire : rend l'operation rejouable sans risque. */
  idempotencyKey?: string | null;
  /** Imputation manuelle. Si absente, imputation automatique par anciennete. */
  allocations?: { feeAssignmentId: string; installmentId?: string | null; amountMinor: number }[];
  /** Justificatif a l'origine du paiement (cas d'une acceptation). */
  proofId?: string | null;
  academicYearId?: string;
};

export type RecordPaymentResult = {
  paymentId: string;
  reference: string;
  receiptNumber: string;
  amountMinor: number;
  allocatedMinor: number;
  /** Montant verse au-dela des dettes ouvertes (avance sur frais a venir). */
  unallocatedMinor: number;
  /** true si la cle d'idempotence a renvoye un paiement deja existant. */
  wasDuplicate: boolean;
};

/**
 * Enregistre un encaissement reel et emet son recu.
 * A n'appeler qu'apres verification de la permission PAYMENT_CREATE et du tenant.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  if (!Number.isInteger(input.amountMinor)) {
    throw new ValidationError("Le montant doit etre un entier en unites mineures.");
  }
  if (input.amountMinor <= 0) {
    throw new ValidationError("Le montant d'un encaissement doit etre strictement positif.");
  }

  // Court-circuit hors transaction : evite d'ouvrir une transaction pour rien
  // lorsqu'un formulaire est resoumis.
  if (input.idempotencyKey) {
    const existing = await prisma.payment.findFirst({
      where: { schoolId: input.schoolId, idempotencyKey: input.idempotencyKey },
      include: { receipt: true, allocations: true },
    });

    if (existing) {
      await recordAudit({
        action: AUDIT_ACTIONS.PAYMENT_DUPLICATE_BLOCKED,
        schoolId: input.schoolId,
        userId: input.cashierId,
        entityType: "payment",
        entityId: existing.id,
        metadata: { idempotencyKey: input.idempotencyKey, reference: existing.reference },
      });

      const allocated = existing.allocations.reduce((total, a) => total + a.amountMinor, 0);
      return {
        paymentId: existing.id,
        reference: existing.reference,
        receiptNumber: existing.receipt?.number ?? "",
        amountMinor: existing.amountMinor,
        allocatedMinor: allocated,
        unallocatedMinor: existing.amountMinor - allocated,
        wasDuplicate: true,
      };
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, schoolId: true, firstName: true, lastName: true, matricule: true },
    });
    // Verification de tenant au plus pres de l'ecriture, pas seulement en amont.
    if (!student || student.schoolId !== input.schoolId) {
      throw new NotFoundError("Eleve introuvable dans cet etablissement.");
    }

    const school = await tx.school.findUnique({
      where: { id: input.schoolId },
      select: { currency: true, name: true, locale: true },
    });
    if (!school) throw new NotFoundError("Etablissement introuvable.");

    // Imputation : manuelle si fournie, sinon la plus ancienne echeance d'abord.
    let allocations: { feeAssignmentId: string; installmentId: string | null; amountMinor: number }[];

    if (input.allocations && input.allocations.length > 0) {
      allocations = input.allocations.map((allocation) => ({
        feeAssignmentId: allocation.feeAssignmentId,
        installmentId: allocation.installmentId ?? null,
        amountMinor: allocation.amountMinor,
      }));

      const total = allocations.reduce((sum, a) => sum + a.amountMinor, 0);
      if (total > input.amountMinor) {
        throw new ValidationError(
          "La repartition depasse le montant encaisse. Corrigez les montants imputes.",
        );
      }
      if (allocations.some((a) => a.amountMinor <= 0)) {
        throw new ValidationError("Chaque ligne d'imputation doit porter un montant positif.");
      }

      // Les frais vises doivent appartenir a cet eleve et a cet etablissement.
      const feeIds = Array.from(new Set(allocations.map((a) => a.feeAssignmentId)));
      const fees = await tx.feeAssignment.findMany({
        where: { id: { in: feeIds }, schoolId: input.schoolId, studentId: input.studentId },
        select: { id: true },
      });
      if (fees.length !== feeIds.length) {
        throw new ValidationError("Un des frais vises n'appartient pas a cet eleve.");
      }
    } else {
      const debts = await openDebts(input.studentId, input.schoolId, {
        academicYearId: input.academicYearId,
        db: tx,
      });

      const automatic = allocateToDebts(
        input.amountMinor,
        debts.map((debt) => ({
          id: `${debt.feeAssignmentId}::${debt.installmentId ?? ""}`,
          remainingMinor: debt.remainingMinor,
        })),
      );

      allocations = automatic.allocations.map((allocation) => {
        const [feeAssignmentId, installmentId] = allocation.id.split("::");
        return {
          feeAssignmentId,
          installmentId: installmentId || null,
          amountMinor: allocation.amountMinor,
        };
      });
    }

    const reference = await nextPaymentReference(tx, input.schoolId, input.paidAt);
    const receiptNumber = await nextReceiptNumber(tx, input.schoolId, input.paidAt);

    const payment = await tx.payment.create({
      data: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        reference,
        amountMinor: input.amountMinor,
        currency: school.currency,
        method: input.method,
        status: "VALIDATED",
        paidAt: input.paidAt,
        externalReference: input.externalReference ?? "",
        financialAccountId: input.financialAccountId ?? null,
        cashierId: input.cashierId,
        proofId: input.proofId ?? null,
        note: input.note ?? "",
        idempotencyKey: input.idempotencyKey ?? null,
        allocations: { create: allocations },
      },
      select: { id: true, reference: true, amountMinor: true },
    });

    const allocatedMinor = allocations.reduce((total, a) => total + a.amountMinor, 0);

    await tx.receipt.create({
      data: {
        schoolId: input.schoolId,
        paymentId: payment.id,
        number: receiptNumber,
        issuedAt: input.paidAt,
        // Instantane fige : le recu reste reimprimable a l'identique meme si
        // le nom de l'eleve ou le libelle d'un frais change plus tard.
        snapshot: JSON.stringify({
          schoolName: school.name,
          studentName: `${student.firstName} ${student.lastName}`,
          matricule: student.matricule,
          amountMinor: input.amountMinor,
          currency: school.currency,
          method: input.method,
          paidAt: input.paidAt.toISOString(),
          reference,
          allocations,
        }),
      },
    });

    // Comptabilisation : debit tresorerie / credit creance eleve.
    // Le produit a ete constate a l'emission des frais (compte 411),
    // l'encaissement solde la creance et n'est donc PAS un produit de plus.
    await postJournalEntry(tx, {
      schoolId: input.schoolId,
      journalCode: journalForMethod(input.method),
      date: input.paidAt,
      label: `Encaissement ${reference} - ${student.lastName} ${student.firstName}`,
      sourceType: "PAYMENT",
      sourceId: payment.id,
      postedById: input.cashierId,
      lines: [
        { accountCode: treasuryAccountForMethod(input.method), debitMinor: input.amountMinor },
        { accountCode: "411", creditMinor: allocatedMinor },
        // Part non imputee : avance recue de la famille (dette de l'ecole).
        ...(input.amountMinor - allocatedMinor > 0
          ? [{ accountCode: "419", creditMinor: input.amountMinor - allocatedMinor }]
          : []),
      ],
    });

    return {
      paymentId: payment.id,
      reference: payment.reference,
      receiptNumber,
      amountMinor: payment.amountMinor,
      allocatedMinor,
      unallocatedMinor: payment.amountMinor - allocatedMinor,
      wasDuplicate: false,
      studentName: `${student.firstName} ${student.lastName}`,
    };
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYMENT_CREATED,
    schoolId: input.schoolId,
    userId: input.cashierId,
    entityType: "payment",
    entityId: result.paymentId,
    metadata: {
      reference: result.reference,
      amountMinor: result.amountMinor,
      method: input.method,
      studentId: input.studentId,
    },
  });

  await notifyGuardiansOfPayment(input.schoolId, input.studentId, result.reference, result.amountMinor);

  return result;
}

/** Previent les parents rattaches qu'un paiement a ete valide. */
async function notifyGuardiansOfPayment(
  schoolId: string,
  studentId: string,
  reference: string,
  amountMinor: number,
): Promise<void> {
  const links = await prisma.studentGuardian.findMany({
    where: { studentId, canViewFinance: true },
    select: { guardian: { select: { userId: true } } },
  });

  const userIds = links
    .map((link) => link.guardian.userId)
    .filter((id): id is string => Boolean(id));

  if (userIds.length === 0) return;

  await notifyUsers({
    schoolId,
    userIds,
    studentId,
    kind: "PAIEMENT_VALIDE",
    title: "Paiement enregistre",
    body: `Le paiement ${reference} a ete valide par l'etablissement.`,
    link: "/parent/paiements",
    metadata: { amountMinor },
  });
}

/**
 * Annule un encaissement. Le paiement reste en base au statut CANCELLED et
 * l'ecriture comptable correspondante est contrepassee : aucune suppression
 * silencieuse.
 */
export async function cancelPayment(input: {
  schoolId: string;
  paymentId: string;
  reason: string;
  userId: string;
}): Promise<void> {
  if (!input.reason.trim()) {
    throw new ValidationError("Un motif d'annulation est obligatoire.");
  }

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: input.paymentId },
      select: { id: true, schoolId: true, status: true, reference: true },
    });

    if (!payment || payment.schoolId !== input.schoolId) throw new NotFoundError("Paiement introuvable.");
    if (payment.status === "CANCELLED") throw new ConflictError("Ce paiement est deja annule.");

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
    });

    const entry = await tx.journalEntry.findFirst({
      where: { schoolId: input.schoolId, sourceType: "PAYMENT", sourceId: payment.id, status: "POSTED" },
      select: { id: true },
    });

    if (entry) {
      await reverseJournalEntry(tx, {
        schoolId: input.schoolId,
        entryId: entry.id,
        reason: input.reason,
        postedById: input.userId,
      });
    }
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PAYMENT_CANCELLED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "payment",
    entityId: input.paymentId,
    metadata: { reason: input.reason },
  });
}

// ---------------------------------------------------------------------------
// Justificatifs televerses par les familles
// ---------------------------------------------------------------------------

/**
 * Depot d'un justificatif par un parent.
 * Cree UNIQUEMENT un PaymentProof au statut EN_ATTENTE : aucun encaissement,
 * aucune ecriture comptable, aucun impact sur le solde.
 */
export async function submitPaymentProof(input: {
  schoolId: string;
  studentId: string;
  declaredAmountMinor: number;
  declaredMethod: string;
  declaredReference?: string;
  declaredPaidAt?: Date | null;
  documentId?: string | null;
  submittedById: string;
}): Promise<{ proofId: string }> {
  if (!Number.isInteger(input.declaredAmountMinor) || input.declaredAmountMinor <= 0) {
    throw new ValidationError("Le montant declare doit etre strictement positif.");
  }

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { schoolId: true },
  });
  if (!student || student.schoolId !== input.schoolId) {
    throw new NotFoundError("Eleve introuvable dans cet etablissement.");
  }

  const proof = await prisma.paymentProof.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      declaredAmountMinor: input.declaredAmountMinor,
      declaredMethod: input.declaredMethod,
      declaredReference: input.declaredReference ?? "",
      declaredPaidAt: input.declaredPaidAt ?? null,
      documentId: input.documentId ?? null,
      status: "EN_ATTENTE",
      submittedById: input.submittedById,
    },
    select: { id: true },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PROOF_SUBMITTED,
    schoolId: input.schoolId,
    userId: input.submittedById,
    entityType: "paymentProof",
    entityId: proof.id,
    metadata: { declaredAmountMinor: input.declaredAmountMinor, studentId: input.studentId },
  });

  // Alerte des comptables et caissiers : un justificatif attend un arbitrage.
  const reviewers = await prisma.membership.findMany({
    where: {
      schoolId: input.schoolId,
      status: "ACTIVE",
      role: { code: { in: ["ACCOUNTANT", "DIRECTOR", "OWNER"] } },
    },
    select: { userId: true },
  });

  if (reviewers.length > 0) {
    await notifyUsers({
      schoolId: input.schoolId,
      userIds: reviewers.map((reviewer) => reviewer.userId),
      studentId: input.studentId,
      kind: "AUTRE",
      title: "Nouveau justificatif a verifier",
      body: "Une famille a depose un justificatif de paiement en attente de confirmation.",
      link: "/finance/justificatifs",
    });
  }

  return { proofId: proof.id };
}

/**
 * Arbitrage d'un justificatif par le comptable.
 *
 * ACCEPTE -> cree un encaissement reel (via recordPayment) et emet un recu.
 * REJETE  -> conserve la trace avec un motif obligatoire ; rien n'est encaisse.
 *
 * Le montant retenu est celui VERIFIE par le comptable (`confirmedAmountMinor`),
 * pas necessairement celui declare par la famille : une extraction OCR ou une
 * declaration ne vaut jamais validation.
 */
export async function reviewPaymentProof(input: {
  schoolId: string;
  proofId: string;
  decision: "ACCEPTE" | "REJETE";
  reviewerId: string;
  rejectionReason?: string;
  confirmedAmountMinor?: number;
  financialAccountId?: string | null;
  academicYearId?: string;
}): Promise<{ paymentId?: string; reference?: string }> {
  const proof = await prisma.paymentProof.findUnique({
    where: { id: input.proofId },
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      status: true,
      declaredAmountMinor: true,
      declaredMethod: true,
      declaredReference: true,
      declaredPaidAt: true,
    },
  });

  if (!proof || proof.schoolId !== input.schoolId) throw new NotFoundError("Justificatif introuvable.");
  if (proof.status !== "EN_ATTENTE") {
    throw new ConflictError("Ce justificatif a deja ete traite.");
  }

  if (input.decision === "REJETE") {
    if (!input.rejectionReason?.trim()) {
      throw new ValidationError("Un motif de rejet est obligatoire : la famille doit savoir pourquoi.");
    }

    await prisma.paymentProof.update({
      where: { id: proof.id },
      data: {
        status: "REJETE",
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
        rejectionReason: input.rejectionReason,
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.PROOF_REJECTED,
      schoolId: input.schoolId,
      userId: input.reviewerId,
      entityType: "paymentProof",
      entityId: proof.id,
      metadata: { reason: input.rejectionReason },
    });

    await notifyProofSubmitter(
      input.schoolId,
      proof.studentId,
      "Justificatif refuse",
      `Votre justificatif n'a pas pu etre valide : ${input.rejectionReason}`,
      "JUSTIFICATIF_REJETE",
    );

    return {};
  }

  const amountMinor = input.confirmedAmountMinor ?? proof.declaredAmountMinor;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new ValidationError("Le montant confirme doit etre strictement positif.");
  }

  const payment = await recordPayment({
    schoolId: input.schoolId,
    studentId: proof.studentId,
    amountMinor,
    method: proof.declaredMethod,
    paidAt: proof.declaredPaidAt ?? new Date(),
    cashierId: input.reviewerId,
    financialAccountId: input.financialAccountId ?? null,
    externalReference: proof.declaredReference,
    note: `Issu du justificatif ${proof.id}`,
    // La cle derive de l'identifiant du justificatif : une double validation
    // (double clic, rejeu) ne peut pas creer deux encaissements.
    idempotencyKey: `proof:${proof.id}`,
    proofId: proof.id,
    academicYearId: input.academicYearId,
  });

  await prisma.paymentProof.update({
    where: { id: proof.id },
    data: { status: "ACCEPTE", reviewedById: input.reviewerId, reviewedAt: new Date() },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PROOF_ACCEPTED,
    schoolId: input.schoolId,
    userId: input.reviewerId,
    entityType: "paymentProof",
    entityId: proof.id,
    metadata: { paymentId: payment.paymentId, amountMinor },
  });

  return { paymentId: payment.paymentId, reference: payment.reference };
}

async function notifyProofSubmitter(
  schoolId: string,
  studentId: string,
  title: string,
  body: string,
  kind: string,
): Promise<void> {
  const links = await prisma.studentGuardian.findMany({
    where: { studentId, canViewFinance: true },
    select: { guardian: { select: { userId: true } } },
  });

  const userIds = links
    .map((link) => link.guardian.userId)
    .filter((id): id is string => Boolean(id));

  if (userIds.length === 0) return;

  await notifyUsers({
    schoolId,
    userIds,
    studentId,
    kind,
    title,
    body,
    link: "/parent/paiements",
  });
}

/**
 * Remboursement d'un trop-percu.
 * Enregistre la demande ; le decaissement effectif est une seconde etape
 * (statut PAID) afin que la tresorerie ne bouge qu'au moment du versement reel.
 */
export async function requestRefund(input: {
  schoolId: string;
  studentId: string;
  amountMinor: number;
  reason: string;
  method: string;
  paymentId?: string | null;
  userId: string;
}): Promise<{ refundId: string }> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new ValidationError("Le montant du remboursement doit etre strictement positif.");
  }
  if (!input.reason.trim()) throw new ValidationError("Un motif de remboursement est obligatoire.");

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { schoolId: true },
  });
  if (!student || student.schoolId !== input.schoolId) throw new NotFoundError("Eleve introuvable.");

  const refund = await prisma.refund.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      paymentId: input.paymentId ?? null,
      amountMinor: input.amountMinor,
      reason: input.reason,
      method: input.method,
      status: "PENDING",
    },
    select: { id: true },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.REFUND_REQUESTED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "refund",
    entityId: refund.id,
    metadata: { amountMinor: input.amountMinor, studentId: input.studentId },
  });

  return { refundId: refund.id };
}

/** Versement effectif du remboursement : sortie de tresorerie comptabilisee. */
export async function payRefund(input: {
  schoolId: string;
  refundId: string;
  userId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({
      where: { id: input.refundId },
      select: { id: true, schoolId: true, status: true, amountMinor: true, method: true, studentId: true },
    });

    if (!refund || refund.schoolId !== input.schoolId) throw new NotFoundError("Remboursement introuvable.");
    if (refund.status === "PAID") throw new ConflictError("Ce remboursement a deja ete verse.");
    if (refund.status === "REJECTED") throw new ConflictError("Ce remboursement a ete rejete.");

    await tx.refund.update({
      where: { id: refund.id },
      data: { status: "PAID", paidAt: new Date(), approvedById: input.userId },
    });

    await postJournalEntry(tx, {
      schoolId: input.schoolId,
      journalCode: journalForMethod(refund.method),
      date: new Date(),
      label: `Remboursement trop-percu - eleve ${refund.studentId}`,
      sourceType: "REFUND",
      sourceId: refund.id,
      postedById: input.userId,
      lines: [
        // On solde l'avance recue et on sort la tresorerie.
        { accountCode: "419", debitMinor: refund.amountMinor },
        { accountCode: treasuryAccountForMethod(refund.method), creditMinor: refund.amountMinor },
      ],
    });
  });

  await recordAudit({
    action: AUDIT_ACTIONS.REFUND_APPROVED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "refund",
    entityId: input.refundId,
  });
}

/** Montant encore imputable d'un encaissement (pour l'ecran d'imputation). */
export function unallocatedAmount(payment: {
  amountMinor: number;
  allocations: { amountMinor: number }[];
}): number {
  return clampPositive(
    payment.amountMinor - payment.allocations.reduce((total, a) => total + a.amountMinor, 0),
  );
}
