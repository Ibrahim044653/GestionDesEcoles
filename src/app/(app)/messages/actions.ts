"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { replyToThread, startThread } from "@/lib/domain/messaging";

/**
 * Messagerie interne.
 *
 * Les deux actions s'appuient sur le meme module metier, qui verifie la
 * participation au fil. Une permission `message.send` ne donne pas acces aux
 * fils d'autrui.
 */

export async function startThreadAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ threadId: string }>> {
  let threadId: string | null = null;

  try {
    const context = await requirePermission(PERMISSIONS.MESSAGE_SEND);
    await consumeRateLimit(`message:${context.user.id}`, RATE_LIMITS.MESSAGE);

    const participantIds = formData
      .getAll("participantIds")
      .map((value) => String(value))
      .filter(Boolean);

    const studentId = String(formData.get("studentId") ?? "").trim();

    const result = await startThread({
      schoolId: context.school.id,
      authorId: context.user.id,
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
      participantIds,
      studentId: studentId || null,
    });

    threadId = result.threadId;
    revalidatePath("/messages");
  } catch (error) {
    return fail(error);
  }

  // `redirect` leve une exception interne a Next : il doit rester HORS du
  // bloc try, sinon il serait capture comme une erreur metier.
  redirect(`/messages/${threadId}`);
}

export async function replyToThreadAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ messageId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.MESSAGE_SEND);
    await consumeRateLimit(`message:${context.user.id}`, RATE_LIMITS.MESSAGE);

    const threadId = String(formData.get("threadId") ?? "");

    const result = await replyToThread({
      schoolId: context.school.id,
      threadId,
      authorId: context.user.id,
      body: String(formData.get("body") ?? ""),
    });

    revalidatePath(`/messages/${threadId}`);
    revalidatePath("/messages");
    return ok(result, "Message envoye.");
  } catch (error) {
    return fail(error);
  }
}
