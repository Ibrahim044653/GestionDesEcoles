"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guard";
import { markAllNotificationsRead } from "@/lib/domain/notifications";
import { fail, ok, type ActionResult } from "@/lib/errors";

/**
 * Marque toutes les notifications de l'utilisateur comme lues.
 * L'identifiant provient de la session, jamais du formulaire : impossible de
 * manipuler les notifications d'un autre compte.
 */
export async function markAllReadAction(
  _state: ActionResult<unknown> | null,
  _formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  try {
    const context = await requireAuth();
    const count = await markAllNotificationsRead(context.user.id);

    revalidatePath("/notifications");
    return ok({ count }, `${count} notification(s) marquee(s) comme lue(s).`);
  } catch (error) {
    return fail(error);
  }
}
