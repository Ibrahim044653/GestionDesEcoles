import { describe, expect, it } from "vitest";
import {
  computeDiscount,
  computeStudentAccount,
  type FeeAssignmentInput,
  type PaymentInput,
} from "@/lib/domain/student-account";

/**
 * Compte eleve : ce qui est du, remise, encaisse, declare, solde.
 *
 * Le test central du cahier des charges est ici : un justificatif EN_ATTENTE
 * ne doit JAMAIS reduire le solde ni augmenter les encaissements valides.
 */

const makeFee = (overrides: Partial<FeeAssignmentInput> = {}): FeeAssignmentInput => ({
  id: "fee-scolarite",
  label: "Scolarite annuelle",
  category: "SCOLARITE",
  grossAmountMinor: 300_000,
  status: "ACTIVE",
  discounts: [],
  installments: [],
  ...overrides,
});

const makePayment = (overrides: Partial<PaymentInput> = {}): PaymentInput => ({
  id: "pay-1",
  reference: "PAY-202510-00001",
  amountMinor: 100_000,
  method: "ESPECES",
  status: "VALIDATED",
  paidAt: new Date("2025-10-10"),
  allocations: [{ feeAssignmentId: "fee-scolarite", installmentId: null, amountMinor: 100_000 }],
  ...overrides,
});

describe("computeDiscount", () => {
  it("retourne zero sans remise", () => {
    expect(computeDiscount(300_000, [])).toBe(0);
  });

  it("additionne montant fixe et pourcentage", () => {
    const total = computeDiscount(300_000, [
      { id: "d1", kind: "BOURSE", label: "Bourse", amountMinor: 50_000, percentCenti: null },
      { id: "d2", kind: "FRATRIE", label: "Fratrie", amountMinor: null, percentCenti: 1000 },
    ]);
    // 50 000 + 10 % de 300 000 = 80 000
    expect(total).toBe(80_000);
  });

  it("plafonne la remise au montant brut : jamais de dette negative", () => {
    const total = computeDiscount(100_000, [
      { id: "d1", kind: "EXONERATION", label: "Exoneration", amountMinor: 500_000, percentCenti: null },
    ]);
    expect(total).toBe(100_000);
  });

  it("ignore une remise negative", () => {
    const total = computeDiscount(100_000, [
      { id: "d1", kind: "AUTRE", label: "Erreur", amountMinor: -50_000, percentCenti: null },
    ]);
    expect(total).toBe(0);
  });
});

describe("computeStudentAccount", () => {
  it("calcule un compte vierge sans erreur", () => {
    const account = computeStudentAccount({
      feeAssignments: [],
      payments: [],
      proofs: [],
      refunds: [],
    });

    expect(account.netDueMinor).toBe(0);
    expect(account.balanceMinor).toBe(0);
    expect(account.settlementRateCenti).toBe(0);
  });

  it("calcule le solde restant du apres un paiement partiel", () => {
    const account = computeStudentAccount({
      feeAssignments: [makeFee()],
      payments: [makePayment()],
      proofs: [],
      refunds: [],
    });

    expect(account.netDueMinor).toBe(300_000);
    expect(account.paidMinor).toBe(100_000);
    expect(account.balanceMinor).toBe(200_000);
    expect(account.overpaidMinor).toBe(0);
    // 100 000 / 300 000 = 33,33 %
    expect(account.settlementRateCenti).toBe(3333);
  });

  it("deduit les remises du montant du", () => {
    const account = computeStudentAccount({
      feeAssignments: [
        makeFee({
          discounts: [
            { id: "d1", kind: "BOURSE", label: "Bourse", amountMinor: null, percentCenti: 5000 },
          ],
        }),
      ],
      payments: [],
      proofs: [],
      refunds: [],
    });

    expect(account.grossMinor).toBe(300_000);
    expect(account.discountMinor).toBe(150_000);
    expect(account.netDueMinor).toBe(150_000);
    expect(account.balanceMinor).toBe(150_000);
  });

  // --- EXIGENCE CENTRALE DU CAHIER DES CHARGES (sections 8 et 9) ---
  it("n'integre PAS un justificatif en attente dans les encaissements ni dans le solde", () => {
    const account = computeStudentAccount({
      feeAssignments: [makeFee()],
      payments: [],
      proofs: [
        {
          id: "proof-1",
          declaredAmountMinor: 150_000,
          status: "EN_ATTENTE",
          createdAt: new Date("2025-10-12"),
        },
      ],
      refunds: [],
    });

    expect(account.pendingProofMinor).toBe(150_000);
    // Rien n'est encaisse...
    expect(account.paidMinor).toBe(0);
    // ...et le solde reste inchange.
    expect(account.balanceMinor).toBe(300_000);
    expect(account.settlementRateCenti).toBe(0);
  });

  it("n'integre pas davantage un justificatif rejete", () => {
    const account = computeStudentAccount({
      feeAssignments: [makeFee()],
      payments: [],
      proofs: [
        { id: "p1", declaredAmountMinor: 100_000, status: "REJETE", createdAt: new Date() },
      ],
      refunds: [],
    });

    expect(account.pendingProofMinor).toBe(0);
    expect(account.paidMinor).toBe(0);
    expect(account.balanceMinor).toBe(300_000);
  });

  it("compte le paiement issu d'un justificatif accepte, sans double comptage", () => {
    // Apres acceptation : le proof passe ACCEPTE et un Payment est cree.
    const account = computeStudentAccount({
      feeAssignments: [makeFee()],
      payments: [makePayment({ amountMinor: 150_000, allocations: [
        { feeAssignmentId: "fee-scolarite", installmentId: null, amountMinor: 150_000 },
      ] })],
      proofs: [
        { id: "p1", declaredAmountMinor: 150_000, status: "ACCEPTE", createdAt: new Date() },
      ],
      refunds: [],
    });

    expect(account.paidMinor).toBe(150_000);
    expect(account.pendingProofMinor).toBe(0);
    expect(account.balanceMinor).toBe(150_000);
  });

  it("ignore un paiement annule", () => {
    const account = computeStudentAccount({
      feeAssignments: [makeFee()],
      payments: [
        makePayment({ id: "ok", amountMinor: 100_000 }),
        makePayment({ id: "annule", amountMinor: 200_000, status: "CANCELLED" }),
      ],
      proofs: [],
      refunds: [],
    });

    expect(account.paidMinor).toBe(100_000);
    expect(account.balanceMinor).toBe(200_000);
  });

  it("ignore un frais annule", () => {
    const account = computeStudentAccount({
      feeAssignments: [
        makeFee(),
        makeFee({ id: "fee-annule", grossAmountMinor: 90_000, status: "CANCELLED" }),
      ],
      payments: [],
      proofs: [],
      refunds: [],
    });

    expect(account.netDueMinor).toBe(300_000);
    expect(account.lines).toHaveLength(1);
  });

  it("detecte un trop-percu sans jamais afficher un solde negatif", () => {
    const account = computeStudentAccount({
      feeAssignments: [makeFee({ grossAmountMinor: 100_000 })],
      payments: [makePayment({ amountMinor: 150_000, allocations: [] })],
      proofs: [],
      refunds: [],
    });

    expect(account.balanceMinor).toBe(0);
    expect(account.overpaidMinor).toBe(50_000);
  });

  it("reaugmente la dette apres un remboursement verse", () => {
    const account = computeStudentAccount({
      feeAssignments: [makeFee()],
      payments: [makePayment({ amountMinor: 300_000, allocations: [
        { feeAssignmentId: "fee-scolarite", installmentId: null, amountMinor: 300_000 },
      ] })],
      proofs: [],
      refunds: [{ id: "r1", amountMinor: 50_000, status: "PAID" }],
    });

    expect(account.refundedMinor).toBe(50_000);
    expect(account.balanceMinor).toBe(50_000);
  });

  it("ignore un remboursement non encore verse", () => {
    const account = computeStudentAccount({
      feeAssignments: [makeFee()],
      payments: [makePayment({ amountMinor: 300_000, allocations: [
        { feeAssignmentId: "fee-scolarite", installmentId: null, amountMinor: 300_000 },
      ] })],
      proofs: [],
      refunds: [{ id: "r1", amountMinor: 50_000, status: "PENDING" }],
    });

    expect(account.refundedMinor).toBe(0);
    expect(account.balanceMinor).toBe(0);
  });

  describe("echeanciers", () => {
    const withInstallments = makeFee({
      installments: [
        {
          id: "t1",
          label: "1ere tranche",
          amountMinor: 120_000,
          penaltyMinor: 0,
          dueDate: new Date("2025-10-15"),
          sortOrder: 0,
        },
        {
          id: "t2",
          label: "2eme tranche",
          amountMinor: 90_000,
          penaltyMinor: 0,
          dueDate: new Date("2026-01-15"),
          sortOrder: 1,
        },
        {
          id: "t3",
          label: "3eme tranche",
          amountMinor: 90_000,
          penaltyMinor: 0,
          dueDate: new Date("2026-04-15"),
          sortOrder: 2,
        },
      ],
    });

    it("ventile un paiement sur les echeances", () => {
      const account = computeStudentAccount({
        feeAssignments: [withInstallments],
        payments: [
          makePayment({
            amountMinor: 150_000,
            allocations: [
              { feeAssignmentId: "fee-scolarite", installmentId: "t1", amountMinor: 120_000 },
              { feeAssignmentId: "fee-scolarite", installmentId: "t2", amountMinor: 30_000 },
            ],
          }),
        ],
        proofs: [],
        refunds: [],
        now: new Date("2025-11-01"),
      });

      const line = account.lines[0];
      expect(line.installments[0].remainingMinor).toBe(0);
      expect(line.installments[1].remainingMinor).toBe(60_000);
      expect(line.installments[2].remainingMinor).toBe(90_000);
    });

    it("signale les echeances depassees", () => {
      const account = computeStudentAccount({
        feeAssignments: [withInstallments],
        payments: [],
        proofs: [],
        refunds: [],
        // Date posterieure a la 1ere et 2eme echeance.
        now: new Date("2026-02-01"),
      });

      const line = account.lines[0];
      expect(line.installments[0].isOverdue).toBe(true);
      expect(line.installments[1].isOverdue).toBe(true);
      expect(line.installments[2].isOverdue).toBe(false);
      expect(account.overdueMinor).toBe(210_000);
    });

    it("ne considere pas depassee une echeance soldee", () => {
      const account = computeStudentAccount({
        feeAssignments: [withInstallments],
        payments: [
          makePayment({
            amountMinor: 120_000,
            allocations: [
              { feeAssignmentId: "fee-scolarite", installmentId: "t1", amountMinor: 120_000 },
            ],
          }),
        ],
        proofs: [],
        refunds: [],
        now: new Date("2025-12-01"),
      });

      expect(account.lines[0].installments[0].isOverdue).toBe(false);
      expect(account.overdueMinor).toBe(0);
    });

    it("ajoute la penalite au montant du de l'echeance", () => {
      const account = computeStudentAccount({
        feeAssignments: [
          makeFee({
            installments: [
              {
                id: "t1",
                label: "Tranche avec penalite",
                amountMinor: 100_000,
                penaltyMinor: 5_000,
                dueDate: new Date("2025-10-15"),
                sortOrder: 0,
              },
            ],
          }),
        ],
        payments: [],
        proofs: [],
        refunds: [],
        now: new Date("2025-12-01"),
      });

      expect(account.lines[0].installments[0].remainingMinor).toBe(105_000);
    });
  });

  it("cumule plusieurs frais et plusieurs paiements", () => {
    const account = computeStudentAccount({
      feeAssignments: [
        makeFee({ id: "inscription", label: "Inscription", grossAmountMinor: 50_000 }),
        makeFee({ id: "scolarite", grossAmountMinor: 300_000 }),
        makeFee({ id: "cantine", label: "Cantine", grossAmountMinor: 90_000 }),
      ],
      payments: [
        makePayment({
          id: "p1",
          amountMinor: 50_000,
          allocations: [{ feeAssignmentId: "inscription", installmentId: null, amountMinor: 50_000 }],
        }),
        makePayment({
          id: "p2",
          amountMinor: 200_000,
          allocations: [{ feeAssignmentId: "scolarite", installmentId: null, amountMinor: 200_000 }],
        }),
      ],
      proofs: [],
      refunds: [],
    });

    expect(account.netDueMinor).toBe(440_000);
    expect(account.paidMinor).toBe(250_000);
    expect(account.balanceMinor).toBe(190_000);
    expect(account.lines).toHaveLength(3);
  });
});
