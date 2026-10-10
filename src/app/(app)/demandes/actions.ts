"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/domain/notifications";

/**
 * Traitement cote etablissement des demandes des familles.
 *
 * Un changement de statut n'est jamais silencieux : la famille a l'origine de
 * la demande est notifiee, et le geste est trace. Rien n'est supprime : une
 * demande refusee reste consultable avec son motif.
 */

const DOCUMENT_STATUSES = ["PENDING", "READY", "DELIVERED", "REJECTED"] as const;
const APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED", "DECLINED", "DONE"] as const;

const DOCUMENT_STATUS_MESSAGES: Record<string, string> = {
  READY: "Votre document est pret. Il peut etre retire a l'etablissement.",
  DELIVERED: "Votre document vous a ete remis.",
  REJECTED: "Votre demande de document n'a pas pu etre satisfaite.",
  PENDING: "Votre demande de document est de nouveau en cours de traitement.",
};

/** Avancement d'une demande de document. */
export async function updateDocumentRequestAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.DOCUMENT_FULFILL);

    const requestId = String(formData.get("requestId") ?? "");
    const status = String(formData.get("status") ?? "");
    const note = String(formData.get("note") ?? "").slice(0, 500);

    if (!DOCUMENT_STATUSES.includes(status as (typeof DOCUMENT_STATUSES)[number])) {
      throw new ValidationError(`Statut inconnu : ${status}.`);
    }

    const request = await prisma.documentRequest.findUnique({
      where: { id: requestId },
      select: { id: true, schoolId: true, studentId: true, requestedById: true, kind: true },
    });

    await assertSameSchool(context, request, "documentRequest");

    // Un refus doit etre motive : une famille a droit a une explication.
    if (status === "REJECTED" && !note.trim()) {
      throw new ValidationError("Indiquez le motif du refus.", {
        note: ["Le motif est obligatoire pour refuser une demande."],
      });
    }

    await prisma.documentRequest.update({
      where: { id: requestId },
      data: { status, ...(note ? { note } : {}) },
    });

    if (request!.requestedById) {
      await notifyUsers({
        schoolId: context.school.id,
        userIds: [request!.requestedById],
        studentId: request!.studentId,
        kind: "AUTRE",
        title: "Demande de document mise a jour",
        body: note || DOCUMENT_STATUS_MESSAGES[status] || "Le statut de votre demande a change.",
        link: "/parent/documents",
      });
    }

    await recordAudit({
      action: "document_request.updated",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "documentRequest",
      entityId: requestId,
      metadata: { statut: status, type: request!.kind },
    });

    revalidatePath("/demandes");
    return ok({ status }, "Demande mise a jour. La famille a ete notifiee.");
  } catch (error) {
    return fail(error);
  }
}

/** Reponse a une demande de rendez-vous. */
export async function updateAppointmentRequestAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.APPOINTMENT_MANAGE);

    const requestId = String(formData.get("requestId") ?? "");
    const status = String(formData.get("status") ?? "");
    const confirmedAtRaw = String(formData.get("confirmedAt") ?? "").trim();
    const reply = String(formData.get("reply") ?? "").slice(0, 1000);

    if (!APPOINTMENT_STATUSES.includes(status as (typeof APPOINTMENT_STATUSES)[number])) {
      throw new ValidationError(`Statut inconnu : ${status}.`);
    }

    const request = await prisma.appointmentRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        schoolId: true,
        studentId: true,
        requestedById: true,
        subject: true,
        message: true,
      },
    });

    await assertSameSchool(context, request, "appointmentRequest");

    // Confirmer un rendez-vous sans date n'a aucun sens pour la famille.
    let confirmedAt: Date | null = null;
    if (status === "CONFIRMED") {
      if (!confirmedAtRaw) {
        throw new ValidationError("Indiquez la date et l'heure du rendez-vous.", {
          confirmedAt: ["La date confirmee est obligatoire."],
        });
      }
      confirmedAt = new Date(confirmedAtRaw);
      if (Number.isNaN(confirmedAt.getTime())) {
        throw new ValidationError("Date de rendez-vous invalide.", {
          confirmedAt: ["Format de date non reconnu."],
        });
      }
    }

    if (status === "DECLINED" && !reply.trim()) {
      throw new ValidationError("Indiquez le motif du refus.", {
        reply: ["Le motif est obligatoire pour decliner un rendez-vous."],
      });
    }

    await prisma.appointmentRequest.update({
      where: { id: requestId },
      data: {
        status,
        confirmedAt: status === "CONFIRMED" ? confirmedAt : null,
        // La reponse est ajoutee au fil de la demande, sans effacer le message
        // initial de la famille.
        ...(reply
          ? { message: `${request!.message}\n\n--- Reponse de l'etablissement ---\n${reply}` }
          : {}),
      },
    });

    if (request!.requestedById) {
      await notifyUsers({
        schoolId: context.school.id,
        userIds: [request!.requestedById],
        studentId: request!.studentId ?? undefined,
        kind: "AUTRE",
        title:
          status === "CONFIRMED"
            ? "Rendez-vous confirme"
            : status === "DECLINED"
              ? "Rendez-vous decline"
              : "Rendez-vous mis a jour",
        body:
          status === "CONFIRMED" && confirmedAt
            ? `Rendez-vous le ${confirmedAt.toLocaleString("fr-FR")} : ${request!.subject}.`
            : reply || `Votre demande « ${request!.subject} » a ete mise a jour.`,
        link: "/parent/rendez-vous",
      });
    }

    await recordAudit({
      action: "appointment_request.updated",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "appointmentRequest",
      entityId: requestId,
      metadata: { statut: status, objet: request!.subject },
    });

    revalidatePath("/demandes");
    return ok({ status }, "Demande de rendez-vous mise a jour. La famille a ete notifiee.");
  } catch (error) {
    return fail(error);
  }
}
