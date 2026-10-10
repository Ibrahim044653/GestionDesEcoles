import { prisma, type Db } from "@/lib/prisma";
import { addMinor, clampPositive, percentOf, sumBy, rateCenti } from "@/lib/money";

/**
 * Compte eleve : ce qui est du, ce qui a ete remise, ce qui est encaisse et
 * valide, ce qui est seulement declare, et le solde restant.
 *
 * REGLE CENTRALE (cahier des charges 8 et 9) :
 * un justificatif televerse par une famille est une DECLARATION. Il figure
 * dans `pendingProofMinor` et n'entre JAMAIS dans `paidMinor` ni dans le solde
 * tant que le comptable ne l'a pas accepte.
 *
 * Le coeur de calcul est volontairement pur (aucun acces base) : il est teste
 * directement dans tests/student-account.test.ts.
 */

export type DiscountInput = {
  id: string;
  kind: string;
  label: string;
  amountMinor: number | null;
  percentCenti: number | null;
};

export type FeeAssignmentInput = {
  id: string;
  label: string;
  category: string;
  grossAmountMinor: number;
  status: string;
  discounts: DiscountInput[];
  installments: InstallmentInput[];
};

export type InstallmentInput = {
  id: string;
  label: string;
  amountMinor: number;
  penaltyMinor: number;
  dueDate: Date;
  sortOrder: number;
};

export type AllocationInput = {
  feeAssignmentId: string;
  installmentId: string | null;
  amountMinor: number;
};

export type PaymentInput = {
  id: string;
  reference: string;
  amountMinor: number;
  method: string;
  status: string;
  paidAt: Date;
  allocations: AllocationInput[];
};

export type ProofInput = {
  id: string;
  declaredAmountMinor: number;
  status: string;
  createdAt: Date;
};

export type RefundInput = {
  id: string;
  amountMinor: number;
  status: string;
};

export type FeeLineSummary = {
  id: string;
  label: string;
  category: string;
  grossMinor: number;
  discountMinor: number;
  netDueMinor: number;
  paidMinor: number;
  remainingMinor: number;
  installments: {
    id: string;
    label: string;
    dueDate: Date;
    amountMinor: number;
    penaltyMinor: number;
    paidMinor: number;
    remainingMinor: number;
    isOverdue: boolean;
  }[];
};

export type StudentAccountSummary = {
  /** Total brut avant remises. */
  grossMinor: number;
  /** Total des remises accordees (bourses, exonerations, fratrie...). */
  discountMinor: number;
  /** Total reellement du apres remises. */
  netDueMinor: number;
  /** Encaisse ET valide. Seule valeur qui reduit le solde. */
  paidMinor: number;
  /** Declare par la famille, en attente de confirmation du comptable. */
  pendingProofMinor: number;
  /** Rembourse effectivement (reaugmente la dette). */
  refundedMinor: number;
  /** Excedent verse au-dela du du. */
  overpaidMinor: number;
  /** Reste a payer. Jamais negatif : un excedent va dans overpaidMinor. */
  balanceMinor: number;
  /** Part reglee, en centiemes de pourcent (10000 = 100 %). */
  settlementRateCenti: number;
  /** Echeances depassees et non soldees. */
  overdueMinor: number;
  lines: FeeLineSummary[];
};

/**
 * Remise effective d'un frais : somme des montants fixes et des pourcentages,
 * plafonnee au montant brut (une remise ne cree jamais une dette negative).
 */
export function computeDiscount(grossMinor: number, discounts: readonly DiscountInput[]): number {
  const total = discounts.reduce((accumulated, discount) => {
    const fixed = discount.amountMinor ?? 0;
    const relative = discount.percentCenti ? percentOf(grossMinor, discount.percentCenti) : 0;
    return accumulated + fixed + relative;
  }, 0);

  return Math.min(clampPositive(total), clampPositive(grossMinor));
}

/** Coeur de calcul, pur et deterministe. */
export function computeStudentAccount(input: {
  feeAssignments: readonly FeeAssignmentInput[];
  payments: readonly PaymentInput[];
  proofs: readonly ProofInput[];
  refunds: readonly RefundInput[];
  now?: Date;
}): StudentAccountSummary {
  const now = input.now ?? new Date();

  // Les frais annules ne sont plus dus.
  const activeFees = input.feeAssignments.filter((fee) => fee.status === "ACTIVE");
  // Seuls les paiements valides comptent ; un paiement annule est neutralise.
  const validPayments = input.payments.filter((payment) => payment.status === "VALIDATED");

  // Imputations effectivement encaissees, par frais et par echeance.
  const paidByFee = new Map<string, number>();
  const paidByInstallment = new Map<string, number>();

  for (const payment of validPayments) {
    for (const allocation of payment.allocations) {
      paidByFee.set(
        allocation.feeAssignmentId,
        (paidByFee.get(allocation.feeAssignmentId) ?? 0) + allocation.amountMinor,
      );
      if (allocation.installmentId) {
        paidByInstallment.set(
          allocation.installmentId,
          (paidByInstallment.get(allocation.installmentId) ?? 0) + allocation.amountMinor,
        );
      }
    }
  }

  const lines: FeeLineSummary[] = activeFees.map((fee) => {
    const discountMinor = computeDiscount(fee.grossAmountMinor, fee.discounts);
    const netDueMinor = clampPositive(fee.grossAmountMinor - discountMinor);
    const paidMinor = paidByFee.get(fee.id) ?? 0;

    const installments = [...fee.installments]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.dueDate.getTime() - b.dueDate.getTime())
      .map((installment) => {
        const installmentPaid = paidByInstallment.get(installment.id) ?? 0;
        const installmentDue = installment.amountMinor + installment.penaltyMinor;
        const remainingMinor = clampPositive(installmentDue - installmentPaid);
        return {
          id: installment.id,
          label: installment.label,
          dueDate: installment.dueDate,
          amountMinor: installment.amountMinor,
          penaltyMinor: installment.penaltyMinor,
          paidMinor: installmentPaid,
          remainingMinor,
          isOverdue: remainingMinor > 0 && installment.dueDate.getTime() < now.getTime(),
        };
      });

    return {
      id: fee.id,
      label: fee.label,
      category: fee.category,
      grossMinor: fee.grossAmountMinor,
      discountMinor,
      netDueMinor,
      paidMinor,
      remainingMinor: clampPositive(netDueMinor - paidMinor),
      installments,
    };
  });

  const grossMinor = sumBy(lines, (line) => line.grossMinor);
  const discountMinor = sumBy(lines, (line) => line.discountMinor);
  const netDueMinor = sumBy(lines, (line) => line.netDueMinor);

  // Les paiements comptent en totalite, y compris la part non imputee
  // (acompte verse avant l'emission des frais).
  const paidMinor = sumBy(validPayments, (payment) => payment.amountMinor);
  const refundedMinor = sumBy(
    input.refunds.filter((refund) => refund.status === "PAID"),
    (refund) => refund.amountMinor,
  );
  const pendingProofMinor = sumBy(
    input.proofs.filter((proof) => proof.status === "EN_ATTENTE"),
    (proof) => proof.declaredAmountMinor,
  );

  const netSettled = paidMinor - refundedMinor;
  const rawBalance = netDueMinor - netSettled;

  return {
    grossMinor,
    discountMinor,
    netDueMinor,
    paidMinor,
    pendingProofMinor,
    refundedMinor,
    overpaidMinor: clampPositive(-rawBalance),
    balanceMinor: clampPositive(rawBalance),
    settlementRateCenti: rateCenti(Math.min(netSettled, netDueMinor), netDueMinor),
    overdueMinor: addMinor(
      ...lines.flatMap((line) =>
        line.installments.filter((i) => i.isOverdue).map((i) => i.remainingMinor),
      ),
    ),
    lines,
  };
}

/** Charge les donnees du compte d'un eleve et applique le calcul ci-dessus. */
export async function loadStudentAccount(
  studentId: string,
  schoolId: string,
  options: { academicYearId?: string; db?: Db } = {},
): Promise<StudentAccountSummary> {
  const db = options.db ?? prisma;

  // Le filtre schoolId est applique a chaque requete : meme si un identifiant
  // d'eleve d'une autre ecole etait fourni, aucune donnee ne remonterait.
  const [feeAssignments, payments, proofs, refunds] = await Promise.all([
    db.feeAssignment.findMany({
      where: {
        studentId,
        schoolId,
        ...(options.academicYearId ? { academicYearId: options.academicYearId } : {}),
      },
      include: {
        discounts: true,
        installments: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.payment.findMany({
      where: {
        studentId,
        schoolId,
      },
      include: { allocations: true },
      orderBy: { paidAt: "desc" },
    }),
    db.paymentProof.findMany({ where: { studentId, schoolId } }),
    db.refund.findMany({ where: { studentId, schoolId } }),
  ]);

  return computeStudentAccount({
    feeAssignments: feeAssignments.map((fee) => ({
      id: fee.id,
      label: fee.label,
      category: fee.category,
      grossAmountMinor: fee.grossAmountMinor,
      status: fee.status,
      discounts: fee.discounts.map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        amountMinor: d.amountMinor,
        percentCenti: d.percentCenti,
      })),
      installments: fee.installments.map((i) => ({
        id: i.id,
        label: i.label,
        amountMinor: i.amountMinor,
        penaltyMinor: i.penaltyMinor,
        dueDate: i.dueDate,
        sortOrder: i.sortOrder,
      })),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      amountMinor: p.amountMinor,
      method: p.method,
      status: p.status,
      paidAt: p.paidAt,
      allocations: p.allocations.map((a) => ({
        feeAssignmentId: a.feeAssignmentId,
        installmentId: a.installmentId,
        amountMinor: a.amountMinor,
      })),
    })),
    proofs: proofs.map((p) => ({
      id: p.id,
      declaredAmountMinor: p.declaredAmountMinor,
      status: p.status,
      createdAt: p.createdAt,
    })),
    refunds: refunds.map((r) => ({ id: r.id, amountMinor: r.amountMinor, status: r.status })),
  });
}

/**
 * Dettes ouvertes d'un eleve, ordonnees par date d'echeance : c'est l'ordre
 * d'imputation par defaut d'un encaissement (le plus ancien d'abord).
 */
export async function openDebts(
  studentId: string,
  schoolId: string,
  options: { academicYearId?: string; db?: Db } = {},
): Promise<
  {
    feeAssignmentId: string;
    installmentId: string | null;
    label: string;
    dueDate: Date | null;
    remainingMinor: number;
  }[]
> {
  const summary = await loadStudentAccount(studentId, schoolId, options);
  const debts: {
    feeAssignmentId: string;
    installmentId: string | null;
    label: string;
    dueDate: Date | null;
    remainingMinor: number;
  }[] = [];

  for (const line of summary.lines) {
    if (line.installments.length === 0) {
      if (line.remainingMinor > 0) {
        debts.push({
          feeAssignmentId: line.id,
          installmentId: null,
          label: line.label,
          dueDate: null,
          remainingMinor: line.remainingMinor,
        });
      }
      continue;
    }

    for (const installment of line.installments) {
      if (installment.remainingMinor > 0) {
        debts.push({
          feeAssignmentId: line.id,
          installmentId: installment.id,
          label: `${line.label} - ${installment.label}`,
          dueDate: installment.dueDate,
          remainingMinor: installment.remainingMinor,
        });
      }
    }
  }

  return debts.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}
