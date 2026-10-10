"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { currencyDecimals, parseAmountToMinor } from "@/lib/money";
import {
  parseFinanceSettings,
  serializeFinanceSettings,
  type LateFeeMode,
} from "@/lib/domain/finance-settings";
import { applyLateFees, applySiblingDiscounts } from "@/lib/domain/fee-automation";

/**
 * Automatisations financieres.
 *
 * Le reglage releve de la configuration financiere ; l'application est un
 * geste separe, volontaire et trace. Enregistrer un taux n'applique rien.
 */

const LATE_FEE_MODES: LateFeeMode[] = ["FIXE", "POURCENTAGE", "POURCENTAGE_PAR_JOUR"];

/** Saisie "2,5" -> 250 centiemes de pourcent. */
function parsePercentToCenti(input: string, field: string): number {
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new ValidationError(`Pourcentage invalide : "${input}".`, {
      [field]: ["Format attendu : 5 ou 2,50."],
    });
  }
  const centi = Math.round(Number.parseFloat(cleaned) * 100);
  if (centi > 10_000) {
    throw new ValidationError("Un pourcentage de remise ou de penalite ne peut depasser 100 %.", {
      [field]: ["Maximum 100 %."],
    });
  }
  return centi;
}

export async function updateFinanceAutomationSettingsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_FINANCE);

    const school = await prisma.school.findUniqueOrThrow({
      where: { id: context.school.id },
      select: { accountingSettings: true },
    });

    const current = parseFinanceSettings(school.accountingSettings);

    const mode = String(formData.get("lateFeeMode") ?? "FIXE") as LateFeeMode;
    if (!LATE_FEE_MODES.includes(mode)) {
      throw new ValidationError("Mode de penalite inconnu.");
    }

    const fixedRaw = String(formData.get("lateFeeFixed") ?? "").trim();
    const capRaw = String(formData.get("lateFeeCap") ?? "").trim();

    const settings = {
      lateFee: {
        enabled: formData.get("lateFeeEnabled") === "on",
        mode,
        graceDays: Math.max(
          0,
          Number.parseInt(String(formData.get("lateFeeGraceDays") ?? "0"), 10) || 0,
        ),
        fixedMinor: fixedRaw
          ? parseAmountToMinor(fixedRaw, currencyDecimals(context.school.currency))
          : 0,
        percentCenti: parsePercentToCenti(
          String(formData.get("lateFeePercent") ?? ""),
          "lateFeePercent",
        ),
        // Vide = pas de plafond. Ne pas confondre avec 0, qui annulerait tout.
        capPercentCenti: capRaw ? parsePercentToCenti(capRaw, "lateFeeCap") : null,
      },
      siblingDiscount: {
        enabled: formData.get("siblingEnabled") === "on",
        tiers: [2, 3, 4]
          .map((minChildren) => ({
            minChildren,
            percentCenti: parsePercentToCenti(
              String(formData.get(`siblingTier${minChildren}`) ?? ""),
              `siblingTier${minChildren}`,
            ),
          }))
          .filter((tier) => tier.percentCenti > 0),
        categories: formData
          .getAll("siblingCategories")
          .map((value) => String(value))
          .filter(Boolean),
      },
    };

    if (settings.lateFee.enabled) {
      if (settings.lateFee.mode === "FIXE" && settings.lateFee.fixedMinor <= 0) {
        throw new ValidationError("Indiquez le montant de la penalite fixe.", {
          lateFeeFixed: ["Montant obligatoire pour une penalite fixe."],
        });
      }
      if (settings.lateFee.mode !== "FIXE" && settings.lateFee.percentCenti <= 0) {
        throw new ValidationError("Indiquez le taux de la penalite.", {
          lateFeePercent: ["Taux obligatoire pour une penalite en pourcentage."],
        });
      }
    }

    if (settings.siblingDiscount.enabled && settings.siblingDiscount.tiers.length === 0) {
      throw new ValidationError("Definissez au moins un palier de remise fratrie.", {
        siblingTier2: ["Au moins un palier est necessaire."],
      });
    }

    await prisma.school.update({
      where: { id: context.school.id },
      data: {
        accountingSettings: serializeFinanceSettings({
          ...current,
          ...settings,
        }),
      },
    });

    revalidatePath("/finance/automatisations");
    return ok(
      undefined,
      "Reglages enregistres. Ils ne sont appliques qu'au declenchement explicite du traitement.",
    );
  } catch (error) {
    return fail(error);
  }
}

/** Applique les penalites de retard calculees pour une annee scolaire. */
export async function applyLateFeesAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ applied: number; totalMinor: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.FEE_MANAGE);

    const academicYearId = String(formData.get("academicYearId") ?? "");
    const year = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, year, "academicYear");

    const result = await applyLateFees({
      schoolId: context.school.id,
      academicYearId,
      userId: context.user.id,
    });

    revalidatePath("/finance/automatisations");
    return ok(
      result,
      result.applied === 0
        ? "Aucune penalite a appliquer : les echeances sont a jour."
        : `${result.applied} echeance(s) mises a jour.`,
    );
  } catch (error) {
    return fail(error);
  }
}

/** Accorde les remises fratrie manquantes pour une annee scolaire. */
export async function applySiblingDiscountsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ granted: number; skipped: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.DISCOUNT_GRANT);

    const academicYearId = String(formData.get("academicYearId") ?? "");
    const year = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, year, "academicYear");

    const result = await applySiblingDiscounts({
      schoolId: context.school.id,
      academicYearId,
      userId: context.user.id,
    });

    revalidatePath("/finance/automatisations");
    return ok(
      result,
      result.granted === 0
        ? "Aucune nouvelle remise a accorder."
        : `${result.granted} remise(s) fratrie accordee(s), ${result.skipped} deja presente(s).`,
    );
  } catch (error) {
    return fail(error);
  }
}
