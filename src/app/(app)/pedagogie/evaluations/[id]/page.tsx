import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  requirePagePermission,
  hasPermission,
  assertSameSchoolOrNotFound,
  teacherScope,
} from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, EVALUATION_KIND_LABELS, EVALUATION_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { computeSubjectAverage, formatScore, parseGradingSettings } from "@/lib/domain/grades";
import { Alert, Badge, Card, Field, FieldGrid, PageHeader } from "@/components/ui";
import { GradeEntryTable } from "./grade-entry";

export const metadata: Metadata = { title: "Saisie des notes" };

/**
 * Saisie des notes d'une evaluation.
 *
 * Une fois l'evaluation publiee, le tableau passe en lecture seule : toute
 * correction doit alors emprunter le circuit de revision tracee.
 */
export default async function EvaluationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission(PERMISSIONS.EVALUATION_VIEW);
  const { id } = await params;
  const { school } = context;

  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: {
      classRoom: {
        select: {
          id: true,
          name: true,
          enrollments: {
            where: { status: "ACTIVE" },
            select: {
              student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
            },
            orderBy: { student: { lastName: "asc" } },
          },
        },
      },
      subject: { select: { id: true, name: true } },
      gradingPeriod: { select: { id: true, name: true, status: true } },
      teacher: { select: { firstName: true, lastName: true } },
      grades: {
        include: {
          revisions: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
    },
  });

  if (!evaluation) notFound();
  await assertSameSchoolOrNotFound(context, evaluation, "evaluation");

  // Un enseignant ne peut ouvrir que ses propres couples classe/matiere.
  if (context.membership?.roleCode === ROLES.TEACHER) {
    const scope = await teacherScope(context);
    const allowed = scope.classSubjectPairs.some(
      (pair) => pair.classRoomId === evaluation.classRoomId && pair.subjectId === evaluation.subjectId,
    );
    if (!allowed) notFound();
  }

  const settings = parseGradingSettings(
    (await prisma.school.findUnique({ where: { id: school.id }, select: { gradingSettings: true } }))
      ?.gradingSettings,
  );

  const gradeByStudent = new Map(evaluation.grades.map((grade) => [grade.studentId, grade]));

  const students = evaluation.classRoom.enrollments.map((enrollment) => {
    const grade = gradeByStudent.get(enrollment.student.id);
    return {
      id: enrollment.student.id,
      matricule: enrollment.student.matricule,
      name: `${enrollment.student.lastName} ${enrollment.student.firstName}`,
      gradeId: grade?.id ?? null,
      scoreCenti: grade?.scoreCenti ?? null,
      isAbsent: grade?.isAbsent ?? false,
      isExcused: grade?.isExcused ?? false,
      revisions: (grade?.revisions ?? []).map((revision) => ({
        id: revision.id,
        reason: revision.reason,
        previous: revision.previousScoreCenti,
        next: revision.newScoreCenti,
        createdAt: revision.createdAt.toISOString(),
      })),
    };
  });

  // Statistiques de l'evaluation, calculees sur les notes reellement saisies.
  const entered = students.filter((student) => student.scoreCenti !== null || student.isAbsent);
  const stats = computeSubjectAverage(
    students.map((student) => ({
      scoreCenti: student.scoreCenti,
      isAbsent: student.isAbsent,
      isExcused: student.isExcused,
      maxScore: evaluation.maxScore,
      coefficient: 1,
    })),
    settings,
  );

  const scores = students
    .filter((student) => student.scoreCenti !== null && !student.isAbsent)
    .map((student) => student.scoreCenti!);

  const canEnter = hasPermission(context, PERMISSIONS.GRADE_ENTER);
  const canRevise = hasPermission(context, PERMISSIONS.GRADE_VALIDATE);
  const locked = evaluation.status === "PUBLISHED" || evaluation.gradingPeriod.status === "LOCKED";

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Evaluations", href: "/pedagogie/evaluations" },
          { label: evaluation.title },
        ]}
        title={evaluation.title}
        description={`${evaluation.classRoom.name} — ${evaluation.subject.name} — ${evaluation.gradingPeriod.name}`}
      />

      {locked && (
        <div className="mb-5">
          <Alert tone="warning" title="Saisie verrouillee">
            {evaluation.status === "PUBLISHED"
              ? "Les notes de cette evaluation sont publiees."
              : `La periode "${evaluation.gradingPeriod.name}" est verrouillee.`}{" "}
            {canRevise
              ? "Toute correction passe desormais par une revision motivee et tracee."
              : "Contactez le responsable pedagogique pour toute correction."}
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <Card title="Informations" className="lg:col-span-1">
          <FieldGrid cols={2}>
            <Field label="Type">{EVALUATION_KIND_LABELS[evaluation.kind] ?? evaluation.kind}</Field>
            <Field label="Date">{formatDate(evaluation.date, school.locale)}</Field>
            <Field label="Bareme">sur {evaluation.maxScore}</Field>
            <Field label="Coefficient">{evaluation.coefficient}</Field>
            <Field label="Enseignant">
              {evaluation.teacher ? `${evaluation.teacher.lastName} ${evaluation.teacher.firstName}` : "—"}
            </Field>
            <Field label="Etat">
              <Badge
                tone={
                  evaluation.status === "PUBLISHED"
                    ? "success"
                    : evaluation.status === "VALIDATED"
                      ? "info"
                      : evaluation.status === "SUBMITTED"
                        ? "warning"
                        : "neutral"
                }
              >
                {EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status}
              </Badge>
            </Field>
          </FieldGrid>

          <dl className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Notes saisies</dt>
              <dd className="tabular font-medium">
                {entered.length} / {students.length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Moyenne</dt>
              <dd className="tabular font-medium">{formatScore(stats.averageCenti, school.locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Note la plus haute</dt>
              <dd className="tabular font-medium">
                {scores.length > 0 ? formatScore(Math.max(...scores), school.locale) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Note la plus basse</dt>
              <dd className="tabular font-medium">
                {scores.length > 0 ? formatScore(Math.min(...scores), school.locale) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Absents</dt>
              <dd className="tabular font-medium">
                {students.filter((student) => student.isAbsent).length}
              </dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Regle d&apos;absence appliquee :{" "}
            {settings.absenceRule === "EXCLURE"
              ? "les absences sont exclues du calcul."
              : "les absences non excusees comptent zero."}
          </p>
        </Card>

        <div className="lg:col-span-3">
          <Card
            title="Notes de la classe"
            description={
              locked
                ? "Lecture seule. Les corrections passent par le circuit de revision."
                : "Laissez une case vide pour ne pas saisir de note. Cochez « absent » pour une absence."
            }
            padded={false}
            actions={
              <Link
                href={`/api/documents/liste-classe/${evaluation.classRoom.id}`}
                target="_blank"
                className="btn-secondary btn-sm"
              >
                Liste de classe
              </Link>
            }
          >
            {students.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                Aucun eleve inscrit dans cette classe.
              </div>
            ) : (
              <GradeEntryTable
                evaluationId={evaluation.id}
                maxScore={evaluation.maxScore}
                students={students}
                locale={school.locale}
                readOnly={locked || !canEnter}
                canRevise={canRevise && locked}
              />
            )}
          </Card>

          {/* Journal des corrections, exige apres publication */}
          {students.some((student) => student.revisions.length > 0) && (
            <div className="mt-5">
              <Card title="Journal des corrections">
                <ul className="space-y-2 text-sm">
                  {students.flatMap((student) =>
                    student.revisions.map((revision) => (
                      <li key={revision.id} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="font-medium text-slate-800">{student.name}</p>
                        <p className="text-xs text-slate-600">
                          {formatScore(revision.previous, school.locale)} →{" "}
                          {formatScore(revision.next, school.locale)} — {revision.reason}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDateTime(revision.createdAt, school.locale)}
                        </p>
                      </li>
                    )),
                  )}
                </ul>
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
