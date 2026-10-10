"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { fail, ok, NotFoundError, ValidationError, type ActionResult } from "@/lib/errors";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

/**
 * Administration des abonnements.
 *
 * REGLE : la suspension coupe l'acces applicatif mais ne supprime jamais les
 * donnees de l'etablissement (cahier des charges 16). La resiliation n'efface
 * rien non plus : elle ouvre une procedure d'export puis de suppression,
 * decidee explicitement.
 */
export async function updateSubscriptionStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requireSuperAdmin();
    const subscriptionId = String(formData.get("subscriptionId") ?? "");
    const status = String(formData.get("status") ?? "");

    const allowed = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"];
    if (!allowed.includes(status)) throw new ValidationError("Statut d'abonnement invalide.");

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!subscription) throw new NotFoundError("Abonnement introuvable.");

    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status,
          suspendedAt: status === "SUSPENDED" ? new Date() : null,
          cancelledAt: status === "CANCELLED" ? new Date() : null,
        },
      });

      // L'organisation suit l'etat de l'abonnement : les ecoles sont rendues
      // INACTIVE (acces bloque) mais JAMAIS supprimees ni archivees de force.
      const organizationStatus =
        status === "SUSPENDED" ? "SUSPENDED" : status === "CANCELLED" ? "CANCELLED" : "ACTIVE";

      await tx.organization.update({
        where: { id: subscription.organizationId },
        data: { status: organizationStatus },
      });

      await tx.school.updateMany({
        where: { organizationId: subscription.organizationId, status: { not: "ARCHIVED" } },
        data: { status: organizationStatus === "ACTIVE" ? "ACTIVE" : "INACTIVE" },
      });
    });

    await recordAudit({
      action: AUDIT_ACTIONS.SUBSCRIPTION_CHANGED,
      userId: context.user.id,
      entityType: "subscription",
      entityId: subscriptionId,
      metadata: { from: subscription.status, to: status },
    });

    revalidatePath("/admin-saas");

    return ok(
      undefined,
      status === "SUSPENDED"
        ? "Abonnement suspendu. L'acces est bloque mais AUCUNE donnee n'a ete supprimee."
        : status === "CANCELLED"
          ? "Abonnement resilie. Proposez un export complet des donnees avant toute suppression."
          : "Abonnement mis a jour.",
    );
  } catch (error) {
    return fail(error);
  }
}
