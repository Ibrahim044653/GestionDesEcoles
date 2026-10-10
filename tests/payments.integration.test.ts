import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase, seedTwoSchools } from "./helpers/db";
import {
  cancelPayment,
  recordPayment,
  requestRefund,
  payRefund,
  reviewPaymentProof,
  submitPaymentProof,
} from "@/lib/domain/payments";
import { assignFeeToStudent } from "@/lib/domain/fees";
import { loadStudentAccount, openDebts } from "@/lib/domain/student-account";
import { computeTrialBalance } from "@/lib/domain/accounting";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Tests d'integration du parcours financier, sur une vraie base.
 *
 * Couvre les exigences des sections 8, 9 et 21 du cahier des charges :
 * imputation, idempotence, justificatifs, annulation, remboursement,
 * comptabilisation et isolation entre etablissements.
 */

type Fixtures = Awaited<ReturnType<typeof seedTwoSchools>>;
let fixtures: Fixtures;

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedTwoSchools();
});

/** Applique a l'eleve A une scolarite de 300 000 en trois tranches. */
async function giveTuitionFee() {
  return assignFeeToStudent({
    schoolId: fixtures.schoolA.id,
    studentId: fixtures.studentA.id,
    academicYearId: fixtures.yearA.id,
    label: "Scolarite annuelle",
    category: "SCOLARITE",
    grossAmountMinor: 300_000,
    installmentPlan: [
      { label: "1ere tranche", percentCenti: 4000, dueDate: "2025-10-15" },
      { label: "2eme tranche", percentCenti: 3000, dueDate: "2026-01-15" },
      { label: "3eme tranche", percentCenti: 3000, dueDate: "2026-04-15" },
    ],
    userId: fixtures.cashier.id,
  });
}

describe("emission des frais", () => {
  it("cree les echeances et constate la creance en comptabilite", async () => {
    await giveTuitionFee();

    const installments = await prisma.installment.findMany({
      where: { schoolId: fixtures.schoolA.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(installments.map((i) => i.amountMinor)).toEqual([120_000, 90_000, 90_000]);

    // Le chiffre d'affaires est constate a l'EMISSION : 411 au debit, 701 au credit.
    const balance = await computeTrialBalance(fixtures.schoolA.id);
    const receivable = balance.find((line) => line.code === "411");
    const revenue = balance.find((line) => line.code === "701");

    expect(receivable?.balanceMinor).toBe(300_000);
    expect(revenue?.balanceMinor).toBe(300_000);
  });

  it("refuse d'appliquer un frais a un eleve d'un autre etablissement", async () => {
    await expect(
      assignFeeToStudent({
        schoolId: fixtures.schoolA.id,
        // Eleve de l'ecole B : doit etre refuse.
        studentId: fixtures.studentB.id,
        academicYearId: fixtures.yearA.id,
        label: "Tentative",
        category: "SCOLARITE",
        grossAmountMinor: 100_000,
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuse un frais sur une annee cloturee", async () => {
    await prisma.academicYear.update({
      where: { id: fixtures.yearA.id },
      data: { status: "CLOSED" },
    });

    await expect(
      assignFeeToStudent({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentA.id,
        academicYearId: fixtures.yearA.id,
        label: "Apres cloture",
        category: "SCOLARITE",
        grossAmountMinor: 100_000,
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("recordPayment", () => {
  it("impute automatiquement sur l'echeance la plus ancienne", async () => {
    await giveTuitionFee();

    const result = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 150_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });

    expect(result.allocatedMinor).toBe(150_000);
    expect(result.unallocatedMinor).toBe(0);

    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    const installments = account.lines[0].installments;
    expect(installments[0].remainingMinor).toBe(0);
    expect(installments[1].remainingMinor).toBe(60_000);
    expect(account.balanceMinor).toBe(150_000);
  });

  it("emet un recu numerote et un instantane fige", async () => {
    await giveTuitionFee();

    const result = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 50_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });

    const receipt = await prisma.receipt.findUnique({ where: { paymentId: result.paymentId } });
    expect(receipt).not.toBeNull();
    expect(receipt!.number).toMatch(/^REC-\d{6}-\d{5}$/);

    const snapshot = JSON.parse(receipt!.snapshot);
    expect(snapshot.amountMinor).toBe(50_000);
    expect(snapshot.matricule).toBe("A-0001");
  });

  it("numerote les recus sequentiellement", async () => {
    await giveTuitionFee();

    const first = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 10_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });
    const second = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 10_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-21"),
      cashierId: fixtures.cashier.id,
    });

    expect(second.receiptNumber).not.toBe(first.receiptNumber);
    expect(Number(second.receiptNumber.slice(-5))).toBe(Number(first.receiptNumber.slice(-5)) + 1);
  });

  // --- EXIGENCE : eviter les doubles encaissements (section 9) ---
  it("est idempotent : une meme cle ne cree jamais deux encaissements", async () => {
    await giveTuitionFee();

    const input = {
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 100_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
      idempotencyKey: "formulaire-abc-123",
    };

    const first = await recordPayment(input);
    const second = await recordPayment(input);

    expect(first.wasDuplicate).toBe(false);
    expect(second.wasDuplicate).toBe(true);
    expect(second.paymentId).toBe(first.paymentId);
    expect(second.receiptNumber).toBe(first.receiptNumber);

    const count = await prisma.payment.count({ where: { schoolId: fixtures.schoolA.id } });
    expect(count).toBe(1);

    // Le solde n'a ete reduit qu'une seule fois.
    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.paidMinor).toBe(100_000);
    expect(account.balanceMinor).toBe(200_000);
  });

  it("trace le blocage du doublon dans le journal d'audit", async () => {
    await giveTuitionFee();
    const input = {
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 100_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
      idempotencyKey: "double-clic",
    };
    await recordPayment(input);
    await recordPayment(input);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "payment.duplicate_blocked" },
    });
    expect(audit).not.toBeNull();
  });

  it("autorise deux encaissements distincts sans cle d'idempotence", async () => {
    await giveTuitionFee();
    const base = {
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 50_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    };

    await recordPayment(base);
    await recordPayment(base);

    expect(await prisma.payment.count({ where: { schoolId: fixtures.schoolA.id } })).toBe(2);
  });

  it("enregistre un trop-percu en avance recue (compte 419)", async () => {
    await giveTuitionFee();

    const result = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 400_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });

    expect(result.allocatedMinor).toBe(300_000);
    expect(result.unallocatedMinor).toBe(100_000);

    const balance = await computeTrialBalance(fixtures.schoolA.id);
    expect(balance.find((line) => line.code === "419")?.balanceMinor).toBe(100_000);

    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.balanceMinor).toBe(0);
    expect(account.overpaidMinor).toBe(100_000);
  });

  it("comptabilise l'encaissement en debitant la tresorerie", async () => {
    await giveTuitionFee();

    await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 120_000,
      method: "MOBILE_MONEY",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });

    const balance = await computeTrialBalance(fixtures.schoolA.id);
    // Mobile Money -> compte 531.
    expect(balance.find((line) => line.code === "531")?.balanceMinor).toBe(120_000);
    // La creance restante est de 300 000 - 120 000.
    expect(balance.find((line) => line.code === "411")?.balanceMinor).toBe(180_000);
  });

  it("refuse un montant nul ou negatif", async () => {
    await giveTuitionFee();
    const base = {
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      method: "ESPECES",
      paidAt: new Date(),
      cashierId: fixtures.cashier.id,
    };

    await expect(recordPayment({ ...base, amountMinor: 0 })).rejects.toThrow(ValidationError);
    await expect(recordPayment({ ...base, amountMinor: -5000 })).rejects.toThrow(ValidationError);
  });

  it("refuse un montant non entier", async () => {
    await giveTuitionFee();
    await expect(
      recordPayment({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentA.id,
        amountMinor: 100.5,
        method: "ESPECES",
        paidAt: new Date(),
        cashierId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  // --- EXIGENCE : isolation stricte entre etablissements (section 17) ---
  it("refuse d'encaisser pour un eleve d'un autre etablissement", async () => {
    await expect(
      recordPayment({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentB.id,
        amountMinor: 50_000,
        method: "ESPECES",
        paidAt: new Date(),
        cashierId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);

    expect(await prisma.payment.count()).toBe(0);
  });

  it("refuse une imputation sur un frais appartenant a un autre eleve", async () => {
    const feeA = await giveTuitionFee();

    await expect(
      recordPayment({
        schoolId: fixtures.schoolB.id,
        studentId: fixtures.studentB.id,
        amountMinor: 10_000,
        method: "ESPECES",
        paidAt: new Date(),
        cashierId: fixtures.cashier.id,
        allocations: [{ feeAssignmentId: feeA.feeAssignmentId, amountMinor: 10_000 }],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuse une repartition superieure au montant encaisse", async () => {
    const fee = await giveTuitionFee();

    await expect(
      recordPayment({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentA.id,
        amountMinor: 50_000,
        method: "ESPECES",
        paidAt: new Date(),
        cashierId: fixtures.cashier.id,
        allocations: [{ feeAssignmentId: fee.feeAssignmentId, amountMinor: 80_000 }],
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("justificatifs de paiement", () => {
  it("un depot NE cree aucun encaissement et ne reduit pas le solde", async () => {
    await giveTuitionFee();

    await submitPaymentProof({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      declaredAmountMinor: 150_000,
      declaredMethod: "MOBILE_MONEY",
      submittedById: fixtures.cashier.id,
    });

    expect(await prisma.payment.count()).toBe(0);

    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.pendingProofMinor).toBe(150_000);
    expect(account.paidMinor).toBe(0);
    expect(account.balanceMinor).toBe(300_000);

    // Aucune ecriture de tresorerie n'a ete passee.
    const balance = await computeTrialBalance(fixtures.schoolA.id);
    expect(balance.find((line) => line.code === "531")?.balanceMinor ?? 0).toBe(0);
  });

  it("l'acceptation cree l'encaissement, le recu et l'ecriture", async () => {
    await giveTuitionFee();

    const proof = await submitPaymentProof({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      declaredAmountMinor: 120_000,
      declaredMethod: "MOBILE_MONEY",
      submittedById: fixtures.cashier.id,
    });

    const review = await reviewPaymentProof({
      schoolId: fixtures.schoolA.id,
      proofId: proof.proofId,
      decision: "ACCEPTE",
      reviewerId: fixtures.cashier.id,
    });

    expect(review.paymentId).toBeDefined();

    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.paidMinor).toBe(120_000);
    expect(account.pendingProofMinor).toBe(0);
    expect(account.balanceMinor).toBe(180_000);

    const balance = await computeTrialBalance(fixtures.schoolA.id);
    expect(balance.find((line) => line.code === "531")?.balanceMinor).toBe(120_000);
  });

  it("le comptable peut confirmer un montant different du montant declare", async () => {
    await giveTuitionFee();

    const proof = await submitPaymentProof({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      declaredAmountMinor: 200_000,
      declaredMethod: "VIREMENT",
      submittedById: fixtures.cashier.id,
    });

    await reviewPaymentProof({
      schoolId: fixtures.schoolA.id,
      proofId: proof.proofId,
      decision: "ACCEPTE",
      reviewerId: fixtures.cashier.id,
      // Seuls 150 000 ont reellement ete recus.
      confirmedAmountMinor: 150_000,
    });

    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.paidMinor).toBe(150_000);
  });

  it("le rejet exige un motif et n'encaisse rien", async () => {
    await giveTuitionFee();

    const proof = await submitPaymentProof({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      declaredAmountMinor: 100_000,
      declaredMethod: "MOBILE_MONEY",
      submittedById: fixtures.cashier.id,
    });

    await expect(
      reviewPaymentProof({
        schoolId: fixtures.schoolA.id,
        proofId: proof.proofId,
        decision: "REJETE",
        reviewerId: fixtures.cashier.id,
        rejectionReason: "",
      }),
    ).rejects.toThrow(ValidationError);

    await reviewPaymentProof({
      schoolId: fixtures.schoolA.id,
      proofId: proof.proofId,
      decision: "REJETE",
      reviewerId: fixtures.cashier.id,
      rejectionReason: "Reference introuvable sur le releve du compte.",
    });

    expect(await prisma.payment.count()).toBe(0);
    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.pendingProofMinor).toBe(0);
    expect(account.balanceMinor).toBe(300_000);
  });

  it("refuse de traiter deux fois le meme justificatif", async () => {
    await giveTuitionFee();

    const proof = await submitPaymentProof({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      declaredAmountMinor: 50_000,
      declaredMethod: "ESPECES",
      submittedById: fixtures.cashier.id,
    });

    await reviewPaymentProof({
      schoolId: fixtures.schoolA.id,
      proofId: proof.proofId,
      decision: "ACCEPTE",
      reviewerId: fixtures.cashier.id,
    });

    await expect(
      reviewPaymentProof({
        schoolId: fixtures.schoolA.id,
        proofId: proof.proofId,
        decision: "ACCEPTE",
        reviewerId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ConflictError);

    expect(await prisma.payment.count()).toBe(1);
  });

  it("refuse le depot d'un justificatif pour un eleve d'un autre etablissement", async () => {
    await expect(
      submitPaymentProof({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentB.id,
        declaredAmountMinor: 50_000,
        declaredMethod: "ESPECES",
        submittedById: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuse d'arbitrer un justificatif d'un autre etablissement", async () => {
    const proof = await submitPaymentProof({
      schoolId: fixtures.schoolB.id,
      studentId: fixtures.studentB.id,
      declaredAmountMinor: 50_000,
      declaredMethod: "ESPECES",
      submittedById: fixtures.cashier.id,
    });

    await expect(
      reviewPaymentProof({
        schoolId: fixtures.schoolA.id,
        proofId: proof.proofId,
        decision: "ACCEPTE",
        reviewerId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuse un montant declare nul ou negatif", async () => {
    await expect(
      submitPaymentProof({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentA.id,
        declaredAmountMinor: 0,
        declaredMethod: "ESPECES",
        submittedById: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("annulation d'un encaissement", () => {
  it("conserve le paiement et contrepasse l'ecriture", async () => {
    await giveTuitionFee();

    const payment = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 120_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });

    await cancelPayment({
      schoolId: fixtures.schoolA.id,
      paymentId: payment.paymentId,
      reason: "Cheque sans provision",
      userId: fixtures.cashier.id,
    });

    // Le paiement existe toujours : aucune suppression silencieuse.
    const stored = await prisma.payment.findUnique({ where: { id: payment.paymentId } });
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe("CANCELLED");
    expect(stored!.cancelReason).toBe("Cheque sans provision");

    // Le solde est revenu a son etat initial.
    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.paidMinor).toBe(0);
    expect(account.balanceMinor).toBe(300_000);

    // L'ecriture d'origine est marquee contrepassee, la miroir existe.
    const entries = await prisma.journalEntry.findMany({
      where: { sourceType: "PAYMENT", sourceId: payment.paymentId },
    });
    expect(entries.some((entry) => entry.status === "REVERSED")).toBe(true);
    expect(entries.some((entry) => entry.reversalOfId !== null)).toBe(true);

    // La tresorerie est revenue a zero.
    const balance = await computeTrialBalance(fixtures.schoolA.id);
    expect(balance.find((line) => line.code === "571")?.balanceMinor ?? 0).toBe(0);
  });

  it("exige un motif", async () => {
    await giveTuitionFee();
    const payment = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 50_000,
      method: "ESPECES",
      paidAt: new Date(),
      cashierId: fixtures.cashier.id,
    });

    await expect(
      cancelPayment({
        schoolId: fixtures.schoolA.id,
        paymentId: payment.paymentId,
        reason: "   ",
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuse une double annulation", async () => {
    await giveTuitionFee();
    const payment = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 50_000,
      method: "ESPECES",
      paidAt: new Date(),
      cashierId: fixtures.cashier.id,
    });

    await cancelPayment({
      schoolId: fixtures.schoolA.id,
      paymentId: payment.paymentId,
      reason: "Erreur de saisie",
      userId: fixtures.cashier.id,
    });

    await expect(
      cancelPayment({
        schoolId: fixtures.schoolA.id,
        paymentId: payment.paymentId,
        reason: "Nouvelle tentative",
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuse d'annuler un paiement d'un autre etablissement", async () => {
    await giveTuitionFee();
    const payment = await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 50_000,
      method: "ESPECES",
      paidAt: new Date(),
      cashierId: fixtures.cashier.id,
    });

    await expect(
      cancelPayment({
        schoolId: fixtures.schoolB.id,
        paymentId: payment.paymentId,
        reason: "Tentative inter-ecoles",
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);

    const stored = await prisma.payment.findUnique({ where: { id: payment.paymentId } });
    expect(stored!.status).toBe("VALIDATED");
  });
});

describe("remboursement d'un trop-percu", () => {
  it("n'affecte la tresorerie qu'au versement effectif", async () => {
    await giveTuitionFee();

    await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 400_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });

    const refund = await requestRefund({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 100_000,
      reason: "Trop-percu sur la scolarite",
      method: "ESPECES",
      userId: fixtures.cashier.id,
    });

    // Demande enregistree : la tresorerie n'a pas bouge.
    let balance = await computeTrialBalance(fixtures.schoolA.id);
    expect(balance.find((line) => line.code === "571")?.balanceMinor).toBe(400_000);

    await payRefund({
      schoolId: fixtures.schoolA.id,
      refundId: refund.refundId,
      userId: fixtures.cashier.id,
    });

    balance = await computeTrialBalance(fixtures.schoolA.id);
    expect(balance.find((line) => line.code === "571")?.balanceMinor).toBe(300_000);
    expect(balance.find((line) => line.code === "419")?.balanceMinor ?? 0).toBe(0);

    const account = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolA.id);
    expect(account.refundedMinor).toBe(100_000);
    expect(account.overpaidMinor).toBe(0);
  });

  it("refuse un double versement", async () => {
    await giveTuitionFee();
    const refund = await requestRefund({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 10_000,
      reason: "Test",
      method: "ESPECES",
      userId: fixtures.cashier.id,
    });

    await payRefund({
      schoolId: fixtures.schoolA.id,
      refundId: refund.refundId,
      userId: fixtures.cashier.id,
    });

    await expect(
      payRefund({
        schoolId: fixtures.schoolA.id,
        refundId: refund.refundId,
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuse un remboursement sans motif ou de montant invalide", async () => {
    await expect(
      requestRefund({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentA.id,
        amountMinor: 10_000,
        reason: "  ",
        method: "ESPECES",
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      requestRefund({
        schoolId: fixtures.schoolA.id,
        studentId: fixtures.studentA.id,
        amountMinor: -500,
        reason: "Motif valide",
        method: "ESPECES",
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("openDebts", () => {
  it("retourne les echeances ouvertes dans l'ordre chronologique", async () => {
    await giveTuitionFee();

    const debts = await openDebts(fixtures.studentA.id, fixtures.schoolA.id);
    expect(debts).toHaveLength(3);
    expect(debts[0].remainingMinor).toBe(120_000);
    expect(debts[0].dueDate!.getTime()).toBeLessThan(debts[1].dueDate!.getTime());
  });

  it("exclut les echeances soldees", async () => {
    await giveTuitionFee();
    await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 120_000,
      method: "ESPECES",
      paidAt: new Date("2025-10-20"),
      cashierId: fixtures.cashier.id,
    });

    const debts = await openDebts(fixtures.studentA.id, fixtures.schoolA.id);
    expect(debts).toHaveLength(2);
  });

  it("ne retourne rien pour un eleve d'un autre etablissement", async () => {
    await giveTuitionFee();
    // Meme identifiant d'eleve, mais filtre sur l'ecole B : aucune dette.
    const debts = await openDebts(fixtures.studentA.id, fixtures.schoolB.id);
    expect(debts).toHaveLength(0);
  });
});

describe("isolation des comptes entre etablissements", () => {
  it("le compte d'un eleve ne fuit jamais vers l'autre ecole", async () => {
    await giveTuitionFee();
    await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 100_000,
      method: "ESPECES",
      paidAt: new Date(),
      cashierId: fixtures.cashier.id,
    });

    // Lu depuis l'ecole B : rien ne remonte.
    const crossed = await loadStudentAccount(fixtures.studentA.id, fixtures.schoolB.id);
    expect(crossed.netDueMinor).toBe(0);
    expect(crossed.paidMinor).toBe(0);
    expect(crossed.lines).toHaveLength(0);
  });

  it("les balances comptables restent cloisonnees", async () => {
    await giveTuitionFee();
    await recordPayment({
      schoolId: fixtures.schoolA.id,
      studentId: fixtures.studentA.id,
      amountMinor: 100_000,
      method: "ESPECES",
      paidAt: new Date(),
      cashierId: fixtures.cashier.id,
    });

    const balanceB = await computeTrialBalance(fixtures.schoolB.id);
    expect(balanceB.every((line) => line.debitMinor === 0 && line.creditMinor === 0)).toBe(true);
  });
});
