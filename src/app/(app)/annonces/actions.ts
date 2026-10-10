"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { ROLES } from "@/lib/constants";
import { notifyUsers } from "@/lib/domain/notifications";

/** Publication d'une annonce, ciblee par audience et eventuellement par classe. */
export async function createAnnouncementAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ANNOUNCEMENT_MANAGE);

    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const classRoomId = String(formData.get("classRoomId") ?? "") || null;
    const expiresAt = String(formData.get("expiresAt") ?? "");
    const isPinned = formData.get("isPinned") === "on";
    const notify = formData.get("notify") === "on";

    if (!title) {
      throw new ValidationError("Le titre est obligatoire.", { title: ["Indiquez un titre."] });
    }
    if (body.length < 10) {
      throw new ValidationError("Le contenu est trop court.", {
        body: ["Redigez au moins 10 caracteres."],
      });
    }

    // Audiences cochees dans le formulaire.
    const audiences = [ROLES.GUARDIAN, ROLES.STUDENT, ROLES.TEACHER].filter(
      (role) => formData.get(`audience_${role}`) === "on",
    );
    if (audiences.length === 0) {
      throw new ValidationError("Choisissez au moins une audience.", {
        audiences: ["Selectionnez les destinataires."],
      });
    }

    if (classRoomId) {
      const classRoom = await prisma.classRoom.findUnique({
        where: { id: classRoomId },
        select: { id: true, schoolId: true },
      });
      await assertSameSchool(context, classRoom, "classRoom");
    }

    const announcement = await prisma.announcement.create({
      data: {
        schoolId: context.school.id,
        classRoomId,
        authorId: context.user.id,
        title,
        body,
        audiences: JSON.stringify(audiences),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isPinned,
      },
      select: { id: true },
    });

    let notified = 0;

    if (notify) {
      // Destinataires : membres actifs de l'etablissement portant un role cible.
      const recipients = await prisma.membership.findMany({
        where: {
          schoolId: context.school.id,
          status: "ACTIVE",
          role: { code: { in: audiences } },
        },
        select: { userId: true },
      });

      notified = await notifyUsers({
        schoolId: context.school.id,
        userIds: recipients.map((recipient) => recipient.userId),
        kind: "ANNONCE",
        title,
        body: body.slice(0, 200),
        link: "/annonces",
      });
    }

    revalidatePath("/annonces");

    return ok(
      undefined,
      notify
        ? `Annonce publiee et ${notified} notification(s) envoyee(s) dans l'application.`
        : "Annonce publiee.",
    );
  } catch (error) {
    return fail(error);
  }
}
