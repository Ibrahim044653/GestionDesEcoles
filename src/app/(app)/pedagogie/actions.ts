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
import {
  parseFormData,
  evaluationSchema,
  assignmentSchema,
} from "@/lib/validation";
import { fail, ok, ConflictError, NotFoundError, ValidationError, type ActionResult } from "@/lib/errors";
import { parseScoreToCenti } from "@/lib/domain/grades";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { generateReportCards, publishPeriodResults, reviseGrade } from "@/lib/domain/report-cards";
import { notifyUsers } from "@/lib/domain/notifications";

/**
 * Actions pedagogiques.
 *
 * Au-dela de la permission, un ENSEIGNANT est borne a ses propres couples
 * classe/matiere (assertTeacherCanTouch). Les roles de pilotage ne le sont pas.
 */

export async function createEvaluationAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ evaluationId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.EVALUATION_MANAGE);
    const input = parseFormData(evaluationSchema, formData);

    const [classRoom, subject, period] = await Promise.all([
      prisma.classRoom.findUnique({
        where: { id: input.classRoomId },
        select: { id: true, schoolId: true, academicYearId: true },
      }),
      prisma.subject.findUnique({
        where: { id: input.subjectId },
        select: { id: true, schoolId: true },
      }),
      prisma.gradingPeriod.findUnique({
        where: { id: input.gradingPeriodId },
        select: { id: true, schoolId: true, status: true, name: true },
      }),
    ]);

    await assertSameSchool(context, classRoom, "classRoom");
    await assertSameSchool(context, subject, "subject");
    await assertSameSchool(context, period, "gradingPeriod");

    if (period!.status === "LOCKED") {
      throw new ConflictError(
        `Les resultats de la periode "${period!.name}" sont publies et verrouilles. ` +
          "Aucune nouvelle evaluation ne peut y etre ajoutee.",
      );
    }

    await assertTeacherCanTouch(context, input.classRoomId, input.subjectId);
    const teacherId = await currentStaffId(context);

    const evaluation = await prisma.evaluation.create({
      data: {
        schoolId: context.school.id,
        academicYearId: classRoom!.academicYearId,
        gradingPeriodId: input.gradingPeriodId,
        classRoomId: input.classRoomId,
        subjectId: input.subjectId,
        teacherId,
        title: input.title,
        kind: input.kind,
        date: new Date(input.date),
        maxScore: input.maxScore,
        coefficient: input.coefficient,
        examSession: input.examSession,
        status: "DRAFT",
      },
      select: { id: true },
    });

    revalidatePath("/pedagogie/evaluations");
    return ok({ evaluationId: evaluation.id }, "Evaluation creee. Vous pouvez saisir les notes.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Saisie ou mise a jour des notes d'une evaluation.
 *
 * Les notes sont enregistrees en bloc pour toute la classe. Apres publication,
 * la saisie directe est refusee : il faut passer par une revision tracee.
 */
export async function saveGradesAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: number; skipped: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.GRADE_ENTER);
    const evaluationId = String(formData.get("evaluationId") ?? "");

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      select: {
        id: true,
        schoolId: true,
        classRoomId: true,
        subjectId: true,
        maxScore: true,
        status: true,
        gradingPeriod: { select: { status: true, name: true } },
      },
    });
    await assertSameSchool(context, evaluation, "evaluation");

    if (evaluation!.status === "PUBLISHED") {
      throw new ConflictError(
        "Cette evaluation est publiee. Utilisez la correction tracee pour modifier une note.",
      );
    }
    if (evaluation!.gradingPeriod.status === "LOCKED") {
      throw new ConflictError(
        `La periode "${evaluation!.gradingPeriod.name}" est verrouillee : la saisie est close.`,
      );
    }

    await assertTeacherCanTouch(context, evaluation!.classRoomId, evaluation!.subjectId);

    // Les eleves eligibles sont ceux reellement inscrits dans la classe.
    const enrolled = await prisma.enrollment.findMany({
      where: { classRoomId: evaluation!.classRoomId, status: "ACTIVE" },
      select: { studentId: true },
    });
    const eligible = new Set(enrolled.map((enrollment) => enrollment.studentId));

    const fieldErrors: Record<string, string[]> = {};
    const operations: { studentId: string; scoreCenti: number | null; isAbsent: boolean; isExcused: boolean }[] = [];

    for (const [key, raw] of formData.entries()) {
      if (!key.startsWith("note_")) continue;
      const studentId = key.slice(5);
      if (!eligible.has(studentId)) continue; // ligne forgee : ignoree en silence

      const value = String(raw).trim();
      const absent = formData.get(`absent_${studentId}`) === "on";
      const excused = formData.get(`excuse_${studentId}`) === "on";

      if (absent) {
        operations.push({ studentId, scoreCenti: null, isAbsent: true, isExcused: excused });
        continue;
      }
      if (value === "") {
        // Champ vide : la note n'est pas saisie, on n'ecrase rien.
        continue;
      }

      try {
        operations.push({
          studentId,
          scoreCenti: parseScoreToCenti(value, evaluation!.maxScore),
          isAbsent: false,
          isExcused: false,
        });
      } catch (error) {
        (fieldErrors[key] ??= []).push(
          error instanceof Error ? error.message : "Note invalide.",
        );
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError(
        `${Object.keys(fieldErrors).length} note(s) invalide(s). Aucune note n'a ete enregistree.`,
        fieldErrors,
      );
    }

    // Tout ou rien : une saisie partielle serait pire qu'un echec franc.
    await prisma.$transaction(
      operations.map((operation) =>
        prisma.grade.upsert({
          where: { evaluationId_studentId: { evaluationId, studentId: operation.studentId } },
          create: {
            schoolId: context.school.id,
            evaluationId,
            studentId: operation.studentId,
            scoreCenti: operation.scoreCenti,
            isAbsent: operation.isAbsent,
            isExcused: operation.isExcused,
          },
          update: {
            scoreCenti: operation.scoreCenti,
            isAbsent: operation.isAbsent,
            isExcused: operation.isExcused,
          },
        }),
      ),
    );

    await recordAudit({
      action: AUDIT_ACTIONS.GRADE_ENTERED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "evaluation",
      entityId: evaluationId,
      metadata: { saved: operations.length },
    });

    revalidatePath(`/pedagogie/evaluations/${evaluationId}`);
    return ok(
      { saved: operations.length, skipped: eligible.size - operations.length },
      `${operations.length} note(s) enregistree(s).`,
    );
  } catch (error) {
    return fail(error);
  }
}

/** Soumet une evaluation a validation, ou la valide (selon la permission). */
export async function setEvaluationStatusAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const evaluationId = String(formData.get("evaluationId") ?? "");
    const target = String(formData.get("status") ?? "");

    const context =
      target === "VALIDATED"
        ? await requirePermission(PERMISSIONS.GRADE_VALIDATE)
        : await requirePermission(PERMISSIONS.EVALUATION_MANAGE);

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: evaluationId },
      select: { id: true, schoolId: true, status: true, classRoomId: true, subjectId: true },
    });
    await assertSameSchool(context, evaluation, "evaluation");

    if (evaluation!.status === "PUBLISHED") {
      throw new ConflictError("Une evaluation publiee ne peut plus changer d'etat.");
    }
    if (!["DRAFT", "SUBMITTED", "VALIDATED"].includes(target)) {
      throw new ValidationError("Etat demande invalide.");
    }

    if (target === "SUBMITTED") {
      await assertTeacherCanTouch(context, evaluation!.classRoomId, evaluation!.subjectId);
    }

    await prisma.evaluation.update({ where: { id: evaluationId }, data: { status: target } });

    revalidatePath("/pedagogie/evaluations");
    return ok(
      undefined,
      target === "VALIDATED"
        ? "Evaluation validee. Elle sera prise en compte dans les bulletins."
        : target === "SUBMITTED"
          ? "Evaluation soumise a la validation du responsable pedagogique."
          : "Evaluation remise en brouillon.",
    );
  } catch (error) {
    return fail(error);
  }
}

/** Correction tracee d'une note deja publiee. */
export async function reviseGradeAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.GRADE_VALIDATE);
    const gradeId = String(formData.get("gradeId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    const rawScore = String(formData.get("score") ?? "").trim();
    const isAbsent = formData.get("isAbsent") === "on";

    const grade = await prisma.grade.findUnique({
      where: { id: gradeId },
      select: { id: true, schoolId: true, evaluation: { select: { maxScore: true } } },
    });
    await assertSameSchool(context, grade, "grade");

    const newScoreCenti =
      isAbsent || rawScore === "" ? null : parseScoreToCenti(rawScore, grade!.evaluation.maxScore);

    await reviseGrade({
      schoolId: context.school.id,
      gradeId,
      newScoreCenti,
      newIsAbsent: isAbsent,
      reason,
      userId: context.user.id,
    });

    revalidatePath("/pedagogie/evaluations");
    return ok(undefined, "Note corrigee. La modification est tracee dans le journal des corrections.");
  } catch (error) {
    return fail(error);
  }
}

/** Generation des bulletins d'une classe sur une periode. */
export async function generateReportCardsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ generated: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.REPORTCARD_GENERATE);
    const classRoomId = String(formData.get("classRoomId") ?? "");
    const gradingPeriodId = String(formData.get("gradingPeriodId") ?? "");

    if (!classRoomId || !gradingPeriodId) {
      throw new ValidationError("Choisissez une classe et une periode.");
    }

    const result = await generateReportCards({
      schoolId: context.school.id,
      classRoomId,
      gradingPeriodId,
      userId: context.user.id,
    });

    revalidatePath("/pedagogie/bulletins");
    return ok(
      { generated: result.generated },
      `${result.generated} bulletin(s) genere(s). Les moyennes sont figees a cet instant.`,
    );
  } catch (error) {
    return fail(error);
  }
}

/**
 * Publication des resultats d'une periode.
 * Verrouille la periode et notifie les familles : geste volontairement
 * distinct de la simple generation des bulletins.
 */
export async function publishResultsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.GRADE_PUBLISH);
    const gradingPeriodId = String(formData.get("gradingPeriodId") ?? "");

    const result = await publishPeriodResults({
      schoolId: context.school.id,
      gradingPeriodId,
      userId: context.user.id,
    });

    revalidatePath("/pedagogie/bulletins");
    revalidatePath("/pedagogie/evaluations");

    return ok(
      undefined,
      `${result.publishedEvaluations} evaluation(s) publiee(s). ` +
        `${result.notifiedUsers} notification(s) envoyee(s). La periode est desormais verrouillee.`,
    );
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Absences
// ---------------------------------------------------------------------------

export async function saveAttendanceAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.ATTENDANCE_RECORD);
    const classRoomId = String(formData.get("classRoomId") ?? "");
    const dateRaw = String(formData.get("date") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "") || null;

    if (!dateRaw) throw new ValidationError("La date est obligatoire.");
    const date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) throw new ValidationError("Date invalide.");
    if (date.getTime() > Date.now() + 86_400_000) {
      throw new ValidationError("Impossible d'enregistrer des presences pour une date future.");
    }

    const classRoom = await prisma.classRoom.findUnique({
      where: { id: classRoomId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, classRoom, "classRoom");

    const enrolled = await prisma.enrollment.findMany({
      where: { classRoomId, status: "ACTIVE" },
      select: { studentId: true },
    });

    const recordedById = await currentStaffId(context);
    const absentStudents: string[] = [];

    const entries = enrolled.map((enrollment) => {
      const status = String(formData.get(`statut_${enrollment.studentId}`) ?? "PRESENT");
      const minutesLate = Number.parseInt(String(formData.get(`retard_${enrollment.studentId}`) ?? "0"), 10) || 0;
      if (status === "ABSENT") absentStudents.push(enrollment.studentId);
      return { studentId: enrollment.studentId, status, minutesLate };
    });

    // `upsert` n'est pas utilisable ici : la contrainte unique porte sur
    // subjectId qui peut etre NULL (appel de la journee, hors matiere), et une
    // contrainte SQL ne rapproche pas deux NULL. On resout donc la ligne
    // existante explicitement, le tout dans une seule transaction.
    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        const existing = await tx.attendance.findFirst({
          where: { studentId: entry.studentId, date, subjectId },
          select: { id: true },
        });

        if (existing) {
          await tx.attendance.update({
            where: { id: existing.id },
            data: { status: entry.status, minutesLate: entry.minutesLate, recordedById },
          });
        } else {
          await tx.attendance.create({
            data: {
              schoolId: context.school.id,
              studentId: entry.studentId,
              classRoomId,
              subjectId,
              date,
              status: entry.status,
              minutesLate: entry.minutesLate,
              recordedById,
            },
          });
        }
      }
    });

    // Les familles sont prevenues des absences du jour.
    if (absentStudents.length > 0) {
      const links = await prisma.studentGuardian.findMany({
        where: { studentId: { in: absentStudents } },
        select: { studentId: true, guardian: { select: { userId: true } } },
      });

      for (const link of links) {
        if (!link.guardian.userId) continue;
        await notifyUsers({
          schoolId: context.school.id,
          userIds: [link.guardian.userId],
          studentId: link.studentId,
          kind: "ABSENCE",
          title: "Absence signalee",
          body: `Une absence a ete enregistree le ${date.toLocaleDateString("fr-FR")}.`,
          link: "/parent/absences",
        });
      }
    }

    revalidatePath("/pedagogie/absences");
    return ok(
      { saved: enrolled.length },
      `Appel enregistre pour ${enrolled.length} eleve(s). ${absentStudents.length} absence(s) signalee(s) aux familles.`,
    );
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Devoirs
// ---------------------------------------------------------------------------

export async function createAssignmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ assignmentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.ASSIGNMENT_MANAGE);
    const input = parseFormData(assignmentSchema, formData);
    const publishNow = formData.get("publish") === "on";

    const [classRoom, subject] = await Promise.all([
      prisma.classRoom.findUnique({
        where: { id: input.classRoomId },
        select: { id: true, schoolId: true },
      }),
      prisma.subject.findUnique({ where: { id: input.subjectId }, select: { id: true, schoolId: true } }),
    ]);

    await assertSameSchool(context, classRoom, "classRoom");
    await assertSameSchool(context, subject, "subject");
    await assertTeacherCanTouch(context, input.classRoomId, input.subjectId);

    const teacherId = await currentStaffId(context);

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          schoolId: context.school.id,
          classRoomId: input.classRoomId,
          subjectId: input.subjectId,
          teacherId,
          title: input.title,
          description: input.description,
          dueAt: new Date(input.dueAt),
          maxScore: input.maxScore,
          status: publishNow ? "PUBLISHED" : "DRAFT",
        },
        select: { id: true },
      });

      // A la publication, chaque eleve recoit une ligne de remise "a faire".
      if (publishNow) {
        const enrolled = await tx.enrollment.findMany({
          where: { classRoomId: input.classRoomId, status: "ACTIVE" },
          select: { studentId: true },
        });

        if (enrolled.length > 0) {
          await tx.submission.createMany({
            data: enrolled.map((enrollment) => ({
              assignmentId: created.id,
              studentId: enrollment.studentId,
              status: "A_FAIRE",
            })),
          });
        }
      }

      return created;
    });

    revalidatePath("/pedagogie/devoirs");
    return ok(
      { assignmentId: assignment.id },
      publishNow ? "Devoir publie aupres de la classe." : "Devoir enregistre en brouillon.",
    );
  } catch (error) {
    return fail(error);
  }
}

/** Notation d'une remise de devoir. */
export async function gradeSubmissionAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ASSIGNMENT_GRADE);
    const submissionId = String(formData.get("submissionId") ?? "");
    const rawScore = String(formData.get("score") ?? "").trim();
    const feedback = String(formData.get("feedback") ?? "");

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        assignment: { select: { schoolId: true, maxScore: true, classRoomId: true, subjectId: true } },
      },
    });
    if (!submission) throw new NotFoundError("Remise introuvable.");
    await assertSameSchool(context, { schoolId: submission.assignment.schoolId }, "submission");
    await assertTeacherCanTouch(
      context,
      submission.assignment.classRoomId,
      submission.assignment.subjectId,
    );

    const scoreCenti = rawScore === "" ? null : parseScoreToCenti(rawScore, submission.assignment.maxScore);

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        scoreCenti,
        feedback,
        status: "CORRIGE",
        gradedAt: new Date(),
      },
    });

    revalidatePath("/pedagogie/devoirs");
    return ok(undefined, "Remise corrigee.");
  } catch (error) {
    return fail(error);
  }
}

/** Depot d'un travail par un eleve. */
export async function submitAssignmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ASSIGNMENT_SUBMIT);
    const assignmentId = String(formData.get("assignmentId") ?? "");
    const content = String(formData.get("content") ?? "").trim();

    const student = await prisma.student.findFirst({
      where: { userId: context.user.id, schoolId: context.school.id },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Profil eleve introuvable.");

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, schoolId: true, status: true, dueAt: true, classRoomId: true },
    });
    await assertSameSchool(context, assignment, "assignment");

    if (assignment!.status !== "PUBLISHED") {
      throw new ConflictError("Ce devoir n'est pas ouvert aux remises.");
    }

    // L'eleve doit etre inscrit dans la classe cible.
    const enrolled = await prisma.enrollment.findFirst({
      where: { studentId: student.id, classRoomId: assignment!.classRoomId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!enrolled) throw new NotFoundError("Ce devoir ne concerne pas votre classe.");

    const late = Date.now() > assignment!.dueAt.getTime();

    await prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
      create: {
        assignmentId,
        studentId: student.id,
        content,
        status: late ? "EN_RETARD" : "REMIS",
        submittedAt: new Date(),
      },
      update: {
        content,
        status: late ? "EN_RETARD" : "REMIS",
        submittedAt: new Date(),
      },
    });

    revalidatePath("/eleve/devoirs");
    return ok(
      undefined,
      late
        ? "Travail remis apres la date limite : il est marque « en retard »."
        : "Travail remis. Votre enseignant en est informe.",
    );
  } catch (error) {
    return fail(error);
  }
}
