"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  assertSameSchool,
  assertTeacherCanTouch,
  currentStaffId,
} from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

/** Longueur retenue pour tenir sur un bulletin sans deborder. */
const MAX_LENGTH = 400;

/**
 * Appreciations par matiere, saisies par l'enseignant de la matiere.
 *
 * Un enseignant ne peut ecrire que sur le couple classe/matiere qui lui est
 * affecte : `assertTeacherCanTouch` le verifie cote serveur, independamment de
 * ce que l'interface propose.
 *
 * Une appreciation vide SUPPRIME l'enregistrement plutot que de stocker une
 * chaine vide : un bulletin ne doit pas afficher de ligne d'appreciation
 * fantome.
 */
export async function saveSubjectAppreciationsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: number; cleared: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.GRADE_ENTER);

    const classRoomId = String(formData.get("classRoomId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const gradingPeriodId = String(formData.get("gradingPeriodId") ?? "");

    const [classRoom, subject, period] = await Promise.all([
      prisma.classRoom.findUnique({
        where: { id: classRoomId },
        select: { id: true, schoolId: true, name: true, academicYearId: true },
      }),
      prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, schoolId: true, name: true },
      }),
      prisma.gradingPeriod.findUnique({
        where: { id: gradingPeriodId },
        select: { id: true, schoolId: true, name: true, academicYearId: true },
      }),
    ]);

    await assertSameSchool(context, classRoom, "classRoom");
    await assertSameSchool(context, subject, "subject");
    await assertSameSchool(context, period, "gradingPeriod");

    if (period!.academicYearId !== classRoom!.academicYearId) {
      throw new ValidationError("Cette periode n'appartient pas a l'annee de la classe.");
    }

    await assertTeacherCanTouch(context, classRoomId, subjectId);

    const teacherId = await currentStaffId(context);

    const enrollments = await prisma.enrollment.findMany({
      where: { classRoomId, academicYearId: classRoom!.academicYearId, status: "ACTIVE" },
      select: { studentId: true },
    });

    let saved = 0;
    let cleared = 0;

    // Une seule transaction : la saisie d'une classe entiere est un geste
    // unique pour l'enseignant, elle doit l'etre aussi en base.
    await prisma.$transaction(async (tx) => {
      for (const enrollment of enrollments) {
        const raw = formData.get(`appreciation_${enrollment.studentId}`);
        // Champ absent du formulaire : l'eleve n'etait pas affiche, on n'y touche pas.
        if (raw === null) continue;

        const text = String(raw).trim().slice(0, MAX_LENGTH);

        const existing = await tx.subjectAppreciation.findUnique({
          where: {
            studentId_gradingPeriodId_subjectId: {
              studentId: enrollment.studentId,
              gradingPeriodId,
              subjectId,
            },
          },
          select: { id: true },
        });

        if (!text) {
          if (existing) {
            await tx.subjectAppreciation.delete({ where: { id: existing.id } });
            cleared += 1;
          }
          continue;
        }

        if (existing) {
          await tx.subjectAppreciation.update({
            where: { id: existing.id },
            data: { text, teacherId },
          });
        } else {
          await tx.subjectAppreciation.create({
            data: {
              schoolId: context.school.id,
              studentId: enrollment.studentId,
              gradingPeriodId,
              subjectId,
              teacherId,
              text,
            },
          });
        }
        saved += 1;
      }
    });

    await recordAudit({
      action: "appreciation.saved",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "subject",
      entityId: subjectId,
      metadata: {
        classe: classRoom!.name,
        matiere: subject!.name,
        periode: period!.name,
        enregistrees: saved,
        effacees: cleared,
      },
    });

    revalidatePath("/pedagogie/appreciations");
    return ok(
      { saved, cleared },
      cleared > 0
        ? `${saved} appreciation(s) enregistree(s), ${cleared} effacee(s).`
        : `${saved} appreciation(s) enregistree(s).`,
    );
  } catch (error) {
    return fail(error);
  }
}
