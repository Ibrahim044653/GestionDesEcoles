import { prisma, type Db } from "@/lib/prisma";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notifyUsers } from "./notifications";
import {
  computeClassAverage,
  computeGeneralAverage,
  computeRanking,
  computeSubjectAverageWithResit,
  parseGradingSettings,
  suggestAppreciation,
  type GradeEntry,
  type SubjectAverage,
} from "./grades";

/**
 * Production des bulletins et publication des resultats.
 *
 * Deux garde-fous repris du cahier des charges (section 6) :
 *  - la publication VERROUILLE la periode : plus aucune note n'y est modifiable
 *    sans passer par une revision tracee ;
 *  - le bulletin est FIGE au moment de sa generation (champ `detail`), de sorte
 *    qu'un changement ulterieur de coefficient ne reecrive pas l'historique.
 */

export type StudentPeriodResult = {
  studentId: string;
  matricule: string;
  firstName: string;
  lastName: string;
  subjects: (SubjectAverage & {
    credits: number;
    /** Moyenne de la session normale, avant eventuelle substitution. */
    sessionAverageCenti: number | null;
    resitAverageCenti: number | null;
    resitApplied: boolean;
  })[];
  averageCenti: number | null;
  totalCoefficient: number;
};

/**
 * Calcule les resultats de tous les eleves d'une classe sur une periode.
 * Ne persiste rien : sert aussi bien a l'apercu qu'a la generation.
 */
export async function computeClassResults(
  schoolId: string,
  classRoomId: string,
  gradingPeriodId: string,
  options: { db?: Db; onlyPublished?: boolean } = {},
): Promise<{
  results: StudentPeriodResult[];
  ranks: Map<string, number>;
  classAverageCenti: number | null;
}> {
  const db = options.db ?? prisma;

  const [school, classRoom] = await Promise.all([
    db.school.findUnique({ where: { id: schoolId }, select: { gradingSettings: true } }),
    db.classRoom.findUnique({
      where: { id: classRoomId },
      select: {
        id: true,
        schoolId: true,
        classSubjects: {
          include: { subject: { select: { id: true, name: true, credits: true } } },
        },
        enrollments: {
          where: { status: "ACTIVE" },
          include: {
            student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);

  if (!classRoom || classRoom.schoolId !== schoolId) throw new NotFoundError("Classe introuvable.");

  const settings = parseGradingSettings(school?.gradingSettings);

  const evaluations = await db.evaluation.findMany({
    where: {
      schoolId,
      classRoomId,
      gradingPeriodId,
      // Un bulletin ne retient que les evaluations validees ou publiees :
      // un brouillon ne doit jamais influencer une moyenne officielle.
      status: options.onlyPublished === false ? undefined : { in: ["VALIDATED", "PUBLISHED"] },
    },
    include: { grades: true },
  });

  const results: StudentPeriodResult[] = classRoom.enrollments.map((enrollment) => {
    const student = enrollment.student;

    const subjects: StudentPeriodResult["subjects"] = classRoom.classSubjects.map(
      (classSubject) => {
        const toEntry = (evaluation: (typeof evaluations)[number]): GradeEntry => {
          const grade = evaluation.grades.find((g) => g.studentId === student.id);
          return {
            scoreCenti: grade?.scoreCenti ?? null,
            isAbsent: grade?.isAbsent ?? false,
            isExcused: grade?.isExcused ?? false,
            maxScore: evaluation.maxScore,
            coefficient: evaluation.coefficient,
          };
        };

        const forSubject = evaluations.filter(
          (evaluation) => evaluation.subjectId === classSubject.subjectId,
        );

        // Les deux sessions sont calculees separement : la substitution porte
        // sur la moyenne de matiere, jamais sur une note isolee.
        const computed = computeSubjectAverageWithResit(
          forSubject.filter((e) => e.examSession !== "RATTRAPAGE").map(toEntry),
          forSubject.filter((e) => e.examSession === "RATTRAPAGE").map(toEntry),
          settings,
        );

        return {
          subjectId: classSubject.subjectId,
          subjectName: classSubject.subject.name,
          coefficient: classSubject.coefficient,
          credits: classSubject.subject.credits,
          averageCenti: computed.averageCenti,
          countedGrades: computed.countedGrades,
          skippedGrades: computed.skippedGrades,
          sessionAverageCenti: computed.sessionAverageCenti,
          resitAverageCenti: computed.resitAverageCenti,
          resitApplied: computed.resitApplied,
        };
      },
    );

    const general = computeGeneralAverage(subjects);

    return {
      studentId: student.id,
      matricule: student.matricule,
      firstName: student.firstName,
      lastName: student.lastName,
      subjects,
      averageCenti: general.averageCenti,
      totalCoefficient: general.totalCoefficient,
    };
  });

  return {
    results,
    ranks: settings.rankingEnabled
      ? computeRanking(results.map((r) => ({ studentId: r.studentId, averageCenti: r.averageCenti })))
      : new Map(),
    classAverageCenti: computeClassAverage(results.map((r) => r.averageCenti)),
  };
}

/**
 * Genere (ou regenere) les bulletins d'une classe pour une periode.
 * La regeneration ecrase le bulletin precedent : c'est un acte explicite,
 * trace dans le journal d'audit.
 */
export async function generateReportCards(input: {
  schoolId: string;
  classRoomId: string;
  gradingPeriodId: string;
  userId: string;
}): Promise<{ generated: number; classAverageCenti: number | null }> {
  const period = await prisma.gradingPeriod.findUnique({
    where: { id: input.gradingPeriodId },
    select: { id: true, schoolId: true, name: true },
  });
  if (!period || period.schoolId !== input.schoolId) throw new NotFoundError("Periode introuvable.");

  const { results, ranks, classAverageCenti } = await computeClassResults(
    input.schoolId,
    input.classRoomId,
    input.gradingPeriodId,
  );

  const school = await prisma.school.findUnique({
    where: { id: input.schoolId },
    select: { gradingSettings: true },
  });
  const settings = parseGradingSettings(school?.gradingSettings);

  // Appreciations de matiere saisies par les enseignants : elles sont FIGEES
  // dans le bulletin, comme les moyennes. Une reecriture ulterieure par un
  // enseignant ne modifie pas un bulletin deja remis a la famille.
  const appreciations = await prisma.subjectAppreciation.findMany({
    where: {
      schoolId: input.schoolId,
      gradingPeriodId: input.gradingPeriodId,
      studentId: { in: results.map((result) => result.studentId) },
    },
    select: { studentId: true, subjectId: true, text: true },
  });

  const appreciationByKey = new Map(
    appreciations.map((item) => [`${item.studentId}:${item.subjectId}`, item.text]),
  );

  const buildDetail = (result: (typeof results)[number]) =>
    JSON.stringify(
      result.subjects.map((subject) => ({
        subjectName: subject.subjectName,
        coefficient: subject.coefficient,
        averageCenti: subject.averageCenti,
        credits: subject.credits,
        appreciation: appreciationByKey.get(`${result.studentId}:${subject.subjectId}`) ?? "",
        resitApplied: subject.resitApplied,
        sessionAverageCenti: subject.sessionAverageCenti,
        resitAverageCenti: subject.resitAverageCenti,
      })),
    );

  for (const result of results) {
    const rank = ranks.get(result.studentId) ?? null;

    await prisma.reportCard.upsert({
      where: {
        studentId_gradingPeriodId: {
          studentId: result.studentId,
          gradingPeriodId: input.gradingPeriodId,
        },
      },
      create: {
        studentId: result.studentId,
        gradingPeriodId: input.gradingPeriodId,
        averageCenti: result.averageCenti ?? 0,
        rank,
        classSize: results.length,
        classAverageCenti,
        appreciation: suggestAppreciation(result.averageCenti, settings.maxScore),
        decision: "",
        detail: buildDetail(result),
      },
      update: {
        averageCenti: result.averageCenti ?? 0,
        rank,
        classSize: results.length,
        classAverageCenti,
        detail: buildDetail(result),
      },
    });
  }

  await recordAudit({
    action: AUDIT_ACTIONS.REPORTCARD_GENERATED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "gradingPeriod",
    entityId: input.gradingPeriodId,
    metadata: { classRoomId: input.classRoomId, generated: results.length },
  });

  return { generated: results.length, classAverageCenti };
}

/**
 * Publie les resultats d'une periode : les evaluations validees passent a
 * PUBLISHED, la periode est verrouillee et les familles sont notifiees.
 *
 * Apres publication, toute correction de note exige un motif et cree une
 * entree dans GradeRevision (voir reviseGrade).
 */
export async function publishPeriodResults(input: {
  schoolId: string;
  gradingPeriodId: string;
  userId: string;
}): Promise<{ publishedEvaluations: number; notifiedUsers: number }> {
  const period = await prisma.gradingPeriod.findUnique({
    where: { id: input.gradingPeriodId },
    select: { id: true, schoolId: true, name: true, status: true, academicYearId: true },
  });

  if (!period || period.schoolId !== input.schoolId) throw new NotFoundError("Periode introuvable.");
  if (period.status === "LOCKED") {
    throw new ConflictError("Les resultats de cette periode sont deja publies.");
  }

  const published = await prisma.$transaction(async (tx) => {
    const count = await tx.evaluation.updateMany({
      where: { schoolId: input.schoolId, gradingPeriodId: input.gradingPeriodId, status: "VALIDATED" },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });

    await tx.gradingPeriod.update({
      where: { id: input.gradingPeriodId },
      data: { status: "LOCKED", resultsPublishedAt: new Date() },
    });

    return count.count;
  });

  // Notification des parents et des eleves concernes par cette periode.
  const students = await prisma.student.findMany({
    where: {
      schoolId: input.schoolId,
      enrollments: { some: { academicYearId: period.academicYearId, status: "ACTIVE" } },
    },
    select: {
      id: true,
      userId: true,
      guardians: { where: { canViewGrades: true }, select: { guardian: { select: { userId: true } } } },
    },
  });

  let notifiedUsers = 0;

  for (const student of students) {
    const userIds = [
      student.userId,
      ...student.guardians.map((link) => link.guardian.userId),
    ].filter((id): id is string => Boolean(id));

    if (userIds.length === 0) continue;

    notifiedUsers += await notifyUsers({
      schoolId: input.schoolId,
      userIds,
      studentId: student.id,
      kind: "NOTES_PUBLIEES",
      title: `Resultats publies - ${period.name}`,
      body: `Les notes de la periode ${period.name} sont desormais consultables.`,
      link: "/parent/notes",
    });
  }

  await recordAudit({
    action: AUDIT_ACTIONS.GRADES_PUBLISHED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "gradingPeriod",
    entityId: input.gradingPeriodId,
    metadata: { publishedEvaluations: published, notifiedUsers },
  });

  return { publishedEvaluations: published, notifiedUsers };
}

/**
 * Corrige une note apres publication.
 * Impossible sans motif : chaque correction laisse une trace consultable
 * (qui, quand, ancienne valeur, nouvelle valeur, raison).
 */
export async function reviseGrade(input: {
  schoolId: string;
  gradeId: string;
  newScoreCenti: number | null;
  newIsAbsent: boolean;
  reason: string;
  userId: string;
}): Promise<void> {
  if (!input.reason.trim()) {
    throw new ConflictError("Un motif est obligatoire pour corriger une note publiee.");
  }

  await prisma.$transaction(async (tx) => {
    const grade = await tx.grade.findUnique({
      where: { id: input.gradeId },
      select: { id: true, schoolId: true, scoreCenti: true, isAbsent: true },
    });
    if (!grade || grade.schoolId !== input.schoolId) throw new NotFoundError("Note introuvable.");

    await tx.gradeRevision.create({
      data: {
        gradeId: grade.id,
        previousScoreCenti: grade.scoreCenti,
        newScoreCenti: input.newScoreCenti,
        previousIsAbsent: grade.isAbsent,
        newIsAbsent: input.newIsAbsent,
        reason: input.reason,
        changedById: input.userId,
      },
    });

    await tx.grade.update({
      where: { id: grade.id },
      data: { scoreCenti: input.newScoreCenti, isAbsent: input.newIsAbsent },
    });
  });

  await recordAudit({
    action: AUDIT_ACTIONS.GRADE_REVISED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "grade",
    entityId: input.gradeId,
    metadata: { reason: input.reason, newScoreCenti: input.newScoreCenti },
  });
}
