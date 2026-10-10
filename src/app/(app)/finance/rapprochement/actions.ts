"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { currencyDecimals, parseAmountToMinor } from "@/lib/money";
import { closeReconciliation, createReconciliation } from "@/lib/domain/reconciliation";

/** Rapprochement bancaire : ouverture et cloture. */

export async function createReconciliationAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ reconciliationId: string; differenceMinor: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.RECONCILIATION_MANAGE);

    const financialAccountId = String(formData.get("financialAccountId") ?? "");
    const account = await prisma.financialAccount.findUnique({
      where: { id: financialAccountId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, account, "financialAccount");

    const periodStart = new Date(String(formData.get("periodStart") ?? ""));
    const periodEnd = new Date(String(formData.get("periodEnd") ?? ""));

    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new ValidationError("Indiquez une periode valide.", {
        periodStart: ["Date invalide."],
      });
    }

    // Fin de journee : un releve arrete au 31 inclut les mouvements du 31.
    periodEnd.setHours(23, 59, 59, 999);

    // Un solde de releve peut etre negatif (decouvert) : parseAmountToMinor
    // accepte le signe, il n'y a rien a brider ici.
    const statementBalanceMinor = parseAmountToMinor(
      String(formData.get("statementBalance") ?? ""),
      currencyDecimals(context.school.currency),
    );

    const result = await createReconciliation({
      schoolId: context.school.id,
      financialAccountId,
      periodStart,
      periodEnd,
      statementBalanceMinor,
      notes: String(formData.get("notes") ?? ""),
      userId: context.user.id,
    });

    revalidatePath("/finance/rapprochement");
    return ok(
      result,
      result.differenceMinor === 0
        ? "Rapprochement ouvert : le releve correspond a la comptabilite."
        : "Rapprochement ouvert. Un ecart est constate : il doit etre explique avant la cloture.",
    );
  } catch (error) {
    return fail(error);
  }
}

export async function closeReconciliationAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.RECONCILIATION_MANAGE);

    await closeReconciliation({
      schoolId: context.school.id,
      reconciliationId: String(formData.get("reconciliationId") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      userId: context.user.id,
    });

    revalidatePath("/finance/rapprochement");
    return ok(undefined, "Rapprochement cloture.");
  } catch (error) {
    return fail(error);
  }
}
