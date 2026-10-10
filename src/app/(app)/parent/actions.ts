"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertGuardianOwnsStudent } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { parseFormData, proofSchema } from "@/lib/validation";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { storeUploadedFile } from "@/lib/storage";
import { submitPaymentProof } from "@/lib/domain/payments";
import { notifyUsers } from "@/lib/domain/notifications";

/**
 * Actions de l'espace parent.
 *
 * Chaque action verifie DEUX choses : la permission du role parent, et le
 * rattachement effectif du parent a l'eleve vise (assertGuardianOwnsStudent).
 * Un identifiant d'eleve forge renvoie une 404, jamais les donnees d'autrui.
 */

/**
 * Depot d'un justificatif de paiement.
 *
 * Ne cree AUCUN encaissement : le justificatif part au statut EN_ATTENTE et
 * n'affecte ni le solde de la famille ni les recettes de l'etablissement tant
 * qu'un comptable ne l'a pas accepte.
 */
export async function submitProofAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ proofId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.PROOF_SUBMIT);
    await consumeRateLimit(`proof:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const input = parseFormData(proofSchema(context.school.currency), formData);

    // Verrou central : ce parent est-il bien rattache a cet enfant ?
    await assertGuardianOwnsStudent(context, input.studentId, { requireFinance: true });

    const file = formData.get("file");
    let documentId: string | null = null;

    if (file instanceof File && file.size > 0) {
      const stored = await storeUploadedFile({
        file,
        schoolId: context.school.id,
        kind: "JUSTIFICATIF",
        visibility: "GUARDIAN",
        uploadedById: context.user.id,
        studentId: input.studentId,
      });
      documentId = stored.documentId;
    } else {
      throw new ValidationError("Joignez une photo ou un PDF de votre justificatif.", {
        file: ["Le justificatif est obligatoire."],
      });
    }

    const result = await submitPaymentProof({
      schoolId: context.school.id,
      studentId: input.studentId,
      declaredAmountMinor: input.declaredAmount,
      declaredMethod: input.declaredMethod,
      declaredReference: input.declaredReference,
      declaredPaidAt: input.declaredPaidAt ? new Date(input.declaredPaidAt) : null,
      documentId,
      submittedById: context.user.id,
    });

    revalidatePath("/parent/paiements");

    return ok(
      { proofId: result.proofId },
      "Justificatif transmis. Il sera verifie par la comptabilite. " +
        "Tant qu'il n'est pas confirme, il n'est pas deduit de votre solde.",
    );
  } catch (error) {
    return fail(error);
  }
}

/** Demande d'un document officiel (certificat, releve, attestation). */
export async function requestDocumentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.DOCUMENT_REQUEST);
    const studentId = String(formData.get("studentId") ?? "");
    const kind = String(formData.get("kind") ?? "CERTIFICAT_SCOLARITE");
    const note = String(formData.get("note") ?? "").slice(0, 500);

    await assertGuardianOwnsStudent(context, studentId);

    await prisma.documentRequest.create({
      data: {
        schoolId: context.school.id,
        studentId,
        requestedById: context.user.id,
        kind,
        note,
        status: "PENDING",
      },
    });

    // L'administration est prevenue de la demande.
    const staff = await prisma.membership.findMany({
      where: {
        schoolId: context.school.id,
        status: "ACTIVE",
        role: { code: { in: ["DIRECTOR", "ACADEMIC_HEAD", "OWNER"] } },
      },
      select: { userId: true },
    });

    if (staff.length > 0) {
      await notifyUsers({
        schoolId: context.school.id,
        userIds: staff.map((member) => member.userId),
        studentId,
        kind: "AUTRE",
        title: "Nouvelle demande de document",
        body: "Une famille demande un document officiel.",
        link: "/demandes",
      });
    }

    revalidatePath("/parent/documents");
    return ok(undefined, "Demande enregistree. L'etablissement vous informera lorsque le document sera pret.");
  } catch (error) {
    return fail(error);
  }
}

/** Demande de rendez-vous avec l'etablissement. */
export async function requestAppointmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.APPOINTMENT_REQUEST);
    const studentId = String(formData.get("studentId") ?? "");
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").slice(0, 1000);
    const preferredAt = String(formData.get("preferredAt") ?? "");

    if (!subject) {
      throw new ValidationError("Indiquez l'objet du rendez-vous.", {
        subject: ["L'objet est obligatoire."],
      });
    }

    await assertGuardianOwnsStudent(context, studentId);

    await prisma.appointmentRequest.create({
      data: {
        schoolId: context.school.id,
        studentId,
        requestedById: context.user.id,
        subject,
        message,
        preferredAt: preferredAt ? new Date(preferredAt) : null,
        status: "PENDING",
      },
    });

    revalidatePath("/parent/rendez-vous");
    return ok(undefined, "Demande de rendez-vous transmise a l'etablissement.");
  } catch (error) {
    return fail(error);
  }
}
