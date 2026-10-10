import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, SUBMISSION_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatScore } from "@/lib/domain/grades";
import { getCurrentAcademicYear, listClassRooms, listSubjects } from "@/lib/domain/school-context";
import { Badge, Card, EmptyState, PageHeader, StatCard, BookIcon } from "@/components/ui";
import { AssignmentForm, GradeSubmissionForm } from "./assignment-forms";

export const metadata: Metadata = { title: "Devoirs" };

/** Devoirs publies, remises des eleves et correction. */
export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ devoir?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.ASSIGNMENT_MANAGE);
  const params = await searchParams;
  const { school } = context;

  const academicYear = await getCurrentAcademicYear(school.id);
  const isTeacher = context.membership?.roleCode === ROLES.TEACHER;
  const scope = isTeacher ? await teacherScope(context) : null;

  const [allClassRooms, subjects] = await Promise.all([
    listClassRooms(school.id, academicYear?.id),
    listSubjects(school.id),
  ]);

  const classRooms = scope
    ? allClassRooms.filter((room) => scope.classRoomIds.includes(room.id))
    : allClassRooms;

  const assignments = await prisma.assignment.findMany({
    where: {
      schoolId: school.id,
      ...(scope
        ? {
            OR: scope.classSubjectPairs.map((pair) => ({
              classRoomId: pair.classRoomId,
              subjectId: pair.subjectId,
            })),
          }
        : {}),
    },
    orderBy: { dueAt: "desc" },
    take: 50,
    include: {
      classRoom: { select: { name: true } },
      subject: { select: { name: true } },
      submissions: { select: { status: true } },
    },
  });

  const selectedId = params.devoir ?? assignments[0]?.id;

  const selected = selectedId
    ? await prisma.assignment.findFirst({
        where: { id: selectedId, schoolId: school.id },
        include: {
          classRoom: { select: { name: true } },
          subject: { select: { name: true } },
          submissions: {
            include: {
              student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
            },
            orderBy: { student: { lastName: "asc" } },
          },
        },
      })
    : null;

  const canGrade = hasPermission(context, PERMISSIONS.ASSIGNMENT_GRADE);
  const totalPending = assignments.reduce(
    (total, assignment) =>
      total + assignment.submissions.filter((s) => s.status === "REMIS" || s.status === "EN_RETARD").length,
    0,
  );

  return (
    <>
      <PageHeader
        title="Devoirs"
        description="Publiez des devoirs, suivez les remises et corrigez les travaux des eleves."
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          tone="sky"
          label="Devoirs publies"
          value={String(assignments.filter((a) => a.status === "PUBLISHED").length)}
          icon={<BookIcon className="size-[18px]" />}
        />
        <StatCard tone="iris" label="A corriger" value={String(totalPending)} />
        <StatCard
          tone="slate"
          label="Brouillons"
          value={String(assignments.filter((a) => a.status === "DRAFT").length)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card title="Devoirs" padded={false}>
            {assignments.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun devoir" description="Creez un devoir pour votre classe." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {assignments.map((assignment) => {
                  const pending = assignment.submissions.filter(
                    (s) => s.status === "REMIS" || s.status === "EN_RETARD",
                  ).length;

                  return (
                    <li key={assignment.id}>
                      <Link
                        href={`/pedagogie/devoirs?devoir=${assignment.id}`}
                        className={`block px-4 py-3 transition-colors hover:bg-slate-50 ${
                          selectedId === assignment.id ? "bg-brand-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 text-sm font-medium text-slate-900">
                            {assignment.title}
                          </span>
                          {pending > 0 && <Badge tone="warning">{pending}</Badge>}
                        </div>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {assignment.classRoom.name} — {assignment.subject.name}
                        </span>
                        <span className="block text-xs text-slate-400">
                          a rendre le {formatDate(assignment.dueAt, school.locale)}
                          {assignment.status === "DRAFT" && " — brouillon"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Nouveau devoir">
            {classRooms.length === 0 ? (
              <EmptyState title="Aucune classe" description="Aucune classe ne vous est affectee." />
            ) : (
              <AssignmentForm
                classRooms={classRooms.map((room) => ({ id: room.id, name: room.name }))}
                subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}
              />
            )}
          </Card>
        </div>

        <div className="xl:col-span-2">
          {!selected ? (
            <Card>
              <EmptyState
                title="Selectionnez un devoir"
                description="Choisissez un devoir dans la liste pour voir les remises."
              />
            </Card>
          ) : (
            <Card
              title={selected.title}
              description={`${selected.classRoom.name} — ${selected.subject.name} — a rendre le ${formatDate(selected.dueAt, school.locale)} (sur ${selected.maxScore})`}
              padded={false}
            >
              {selected.description && (
                <p className="border-b border-slate-200 px-5 py-4 text-sm leading-relaxed text-slate-600">
                  {selected.description}
                </p>
              )}

              {selected.submissions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="Aucune remise attendue"
                    description={
                      selected.status === "DRAFT"
                        ? "Ce devoir est encore en brouillon : publiez-le pour le rendre visible des eleves."
                        : "Aucun eleve n'est rattache a ce devoir."
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {selected.submissions.map((submission) => (
                    <li key={submission.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/eleves/${submission.student.id}`}
                            className="text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline"
                          >
                            {submission.student.lastName} {submission.student.firstName}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {submission.student.matricule}
                            {submission.submittedAt &&
                              ` — remis le ${formatDateTime(submission.submittedAt, school.locale)}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            tone={
                              submission.status === "CORRIGE"
                                ? "success"
                                : submission.status === "EN_RETARD"
                                  ? "warning"
                                  : submission.status === "REMIS"
                                    ? "info"
                                    : "neutral"
                            }
                          >
                            {SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status}
                          </Badge>
                          {submission.scoreCenti !== null && (
                            <span className="tabular text-sm font-semibold text-slate-900">
                              {formatScore(submission.scoreCenti, school.locale)} / {selected.maxScore}
                            </span>
                          )}
                        </div>
                      </div>

                      {submission.content && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          {submission.content}
                        </p>
                      )}

                      {submission.feedback && (
                        <p className="mt-2 text-xs text-slate-600">
                          <span className="font-medium">Retour : </span>
                          {submission.feedback}
                        </p>
                      )}

                      {canGrade && submission.status !== "A_FAIRE" && (
                        <div className="mt-3">
                          <GradeSubmissionForm
                            submissionId={submission.id}
                            maxScore={selected.maxScore}
                            currentScoreCenti={submission.scoreCenti}
                            currentFeedback={submission.feedback}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
