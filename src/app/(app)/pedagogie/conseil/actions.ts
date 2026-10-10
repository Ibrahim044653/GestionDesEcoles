"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ConflictError, ValidationError, type ActionResult } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { ENROLLMENT_DECISIONS } from "@/lib/constants";

/**
 * Conseil de classe.
 *
 * Deux gestes distincts :
 *  - l'APPRECIATION et la DECISION portees sur le bulletin d'un eleve ;
 *  - l'enregistrement global des decisions de fin d'annee sur l'inscription.
 *
 * La decision de fin d'annee est portee par `Enrollment.decision` : elle
 * concerne l'annee entiere, pas une periode. L'appreciation, elle, est propre
 * au bulletin d'une periode donnee.
 */

/** Appreciation generale et decision figurant sur un bulletin. */
export async function updateReportCardAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.REPORTCARD_GENERATE);

    const reportCardId = String(formData.get("reportCardId") ?? "");
    const appreciation = String(formData.get("appreciation") ?? "").slice(0, 1000);
    const decision = String(formData.get("decision") ?? "").slice(0, 100);

    const reportCard = await prisma.reportCard.findUnique({
      where: { id: reportCardId },
      select: {
        id: true,
        studentId: true,
        gradingPeriod: { select: { schoolId: true } },
      },
    });
    if (!reportCard) throw new ValidationError("Bulletin introuvable.");
    await assertSameSchool(
      context,
      { schoolId: reportCard.gradingPeriod.schoolId },
      "reportCard",
    );

    await prisma.reportCard.update({
      where: { id: reportCardId },
      data: { appreciation, decision },
    });

    revalidatePath("/pedagogie/conseil");
    revalidatePath(`/eleves/${reportCard.studentId}`);
    return ok(undefined, "Bulletin mis a jour.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Decisions de fin d'annee pour toute une classe.
 *
 * Enregistrees en une seule transaction : un conseil de classe interrompu a
 * mi-parcours laisserait des eleves sans decision, ce qui est pire qu'un echec
 * franc.
 */
export async function recordClassDecisionsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.ENROLLMENT_MANAGE);

    const classRoomId = String(formData.get("classRoomId") ?? "");
    const academicYearId = String(formData.get("academicYearId") ?? "");

    const [classRoom, year] = await Promise.all([
      prisma.classRoom.findUnique({
        where: { id: classRoomId },
        select: { id: true, schoolId: true, name: true },
      }),
      prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { id: true, schoolId: true, status: true, name: true },
      }),
    ]);

    await assertSameSchool(context, classRoom, "classRoom");
    await assertSameSchool(context, year, "academicYear");

    if (year!.status === "CLOSED") {
      throw new ConflictError(
        `L'annee ${year!.name} est cloturee : les decisions ne peuvent plus etre modifiees.`,
      );
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { classRoomId, academicYearId, status: "ACTIVE" },
      select: { id: true, studentId: true },
    });

    const valides = Object.values(ENROLLMENT_DECISIONS) as string[];
    const operations: { id: string; decision: string; decisionNote: string }[] = [];

    for (const enrollment of enrollments) {
      const decision = String(formData.get(`decision_${enrollment.studentId}`) ?? "");
      if (!decision) continue;

      if (!valides.includes(decision)) {
        throw new ValidationError(`Decision inconnue : ${decision}.`);
      }

      operations.push({
        id: enrollment.id,
        decision,
        decisionNote: String(formData.get(`note_${enrollment.studentId}`) ?? "").slice(0, 500),
      });
    }

    if (operations.length === 0) {
      throw new ValidationError("Aucune decision a enregistrer.");
    }

    await prisma.$transaction(
      operations.map((operation) =>
        prisma.enrollment.update({
          where: { id: operation.id },
          data: { decision: operation.decision, decisionNote: operation.decisionNote },
        }),
      ),
    );

    await recordAudit({
      action: "enrollment.decisions_recorded",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "classRoom",
      entityId: classRoomId,
      metadata: { classe: classRoom!.name, annee: year!.name, decisions: operations.length },
    });

    revalidatePath("/pedagogie/conseil");
    return ok(
      { saved: operations.length },
      `${operations.length} decision(s) enregistree(s) pour la classe ${classRoom!.name}.`,
    );
  } catch (error) {
    return fail(error);
  }
}
