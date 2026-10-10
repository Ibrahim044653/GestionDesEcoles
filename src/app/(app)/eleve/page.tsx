import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSchoolPage, currentStudentId, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate, formatMinutes } from "@/lib/format";
import { formatScore } from "@/lib/domain/grades";
import { SUBMISSION_STATUS_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  PulseBanner,
  StatCard,
  BookIcon,
  ClipboardIcon,
  CalendarIcon,
} from "@/components/ui";
import { SubmitWorkForm } from "./submit-form";

export const metadata: Metadata = { title: "Mon espace" };

/**
 * Espace eleve.
 *
 * L'eleve ne voit QUE ses propres donnees : l'identifiant utilise provient de
 * son profil lie au compte connecte, jamais d'un parametre d'URL.
 */
export default async function StudentHomePage() {
  const context = await requireSchoolPage();
  const { school } = context;

  const studentId = await currentStudentId(context);

  if (!studentId) {
    return (
      <>
        <PageHeader title="Mon espace" />
        <Card>
          <EmptyState
            title="Aucun profil eleve"
            description="Votre compte n'est associe a aucun dossier eleve dans cet etablissement."
          />
        </Card>
      </>
    );
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: school.id },
    include: {
      enrollments: {
        where: { status: "ACTIVE" },
        include: {
          classRoom: {
            include: {
              timetableSlots: {
                include: { subject: { select: { name: true } }, teacher: { select: { lastName: true } } },
                orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
              },
            },
          },
          academicYear: true,
        },
        take: 1,
      },
      reportCards: {
        include: { gradingPeriod: { select: { name: true } } },
        orderBy: { publishedAt: "desc" },
      },
    },
  });

  if (!student) {
    return (
      <Card>
        <EmptyState title="Dossier introuvable" />
      </Card>
    );
  }

  const [grades, submissions, attendanceStats, announcements] = await Promise.all([
    // Seules les notes publiees sont visibles de l'eleve.
    prisma.grade.findMany({
      where: { studentId, evaluation: { status: "PUBLISHED" } },
      include: {
        evaluation: {
          select: {
            title: true,
            date: true,
            maxScore: true,
            coefficient: true,
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { evaluation: { date: "desc" } },
      take: 20,
    }),
    prisma.submission.findMany({
      where: { studentId, assignment: { status: "PUBLISHED" } },
      include: {
        assignment: {
          include: { subject: { select: { name: true } } },
        },
      },
      orderBy: { assignment: { dueAt: "asc" } },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { studentId },
      _count: { _all: true },
    }),
    prisma.announcement.findMany({
      where: { schoolId: school.id, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 4,
    }),
  ]);

  const enrollment = student.enrollments[0];
  const latestReport = student.reportCards[0];
  const todo = submissions.filter((s) => s.status === "A_FAIRE" || s.status === "EN_RETARD");
  const absences = attendanceStats.find((row) => row.status === "ABSENT")?._count._all ?? 0;
  const canSubmit = hasPermission(context, PERMISSIONS.ASSIGNMENT_SUBMIT);

  const today = new Date().getDay() === 0 ? 7 : new Date().getDay();
  const todaySlots = (enrollment?.classRoom.timetableSlots ?? []).filter(
    (slot) => slot.weekday === today,
  );

  return (
    <>
      <PageHeader
        title={`Bonjour ${student.firstName}`}
        description={`${enrollment?.classRoom.name ?? "Non inscrit"} — ${enrollment?.academicYear.name ?? school.name}`}
      />

      <PulseBanner
        eyebrow="Ma semaine"
        chips={[
          { label: `${todaySlots.length} cours aujourd'hui` },
          ...(todo.length > 0
            ? [{ label: `${todo.length} devoir(s) a rendre`, tone: "alert" as const }]
            : [{ label: "Aucun devoir en attente" }]),
          ...(latestReport
            ? [{ label: `Moyenne ${formatScore(latestReport.averageCenti, school.locale)}` }]
            : []),
        ]}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          tone="sky"
          label="Derniere moyenne"
          value={latestReport ? formatScore(latestReport.averageCenti, school.locale) : "—"}
          hint={latestReport?.gradingPeriod.name ?? "Aucun bulletin publie"}
        />
        <StatCard
          tone="iris"
          label="Devoirs a rendre"
          value={String(todo.length)}
          icon={<ClipboardIcon className="size-[18px]" />}
        />
        <StatCard
          tone="mint"
          label="Notes publiees"
          value={String(grades.length)}
          icon={<BookIcon className="size-[18px]" />}
        />
        <StatCard tone="rose" label="Absences" value={String(absences)} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ------------------------------ Devoirs ------------------------------ */}
          <Card title="Mes devoirs" padded={false}>
            {submissions.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun devoir" description="Aucun devoir ne vous a ete assigne." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {submissions.map((submission) => {
                  const overdue =
                    submission.status === "A_FAIRE" &&
                    submission.assignment.dueAt.getTime() < Date.now();

                  return (
                    <li key={submission.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {submission.assignment.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {submission.assignment.subject.name} — a rendre le{" "}
                            {formatDate(submission.assignment.dueAt, school.locale)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            tone={
                              submission.status === "CORRIGE"
                                ? "success"
                                : overdue || submission.status === "EN_RETARD"
                                  ? "danger"
                                  : submission.status === "REMIS"
                                    ? "info"
                                    : "neutral"
                            }
                          >
                            {overdue
                              ? "En retard"
                              : (SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status)}
                          </Badge>
                          {submission.scoreCenti !== null && (
                            <span className="tabular text-sm font-semibold">
                              {formatScore(submission.scoreCenti, school.locale)} /{" "}
                              {submission.assignment.maxScore}
                            </span>
                          )}
                        </div>
                      </div>

                      {submission.assignment.description && (
                        <p className="mt-2 text-xs leading-relaxed text-slate-600">
                          {submission.assignment.description}
                        </p>
                      )}

                      {submission.feedback && (
                        <p className="mt-2 rounded-lg bg-mint-50 px-3 py-2 text-xs text-mint-700">
                          <span className="font-semibold">Retour de l&apos;enseignant : </span>
                          {submission.feedback}
                        </p>
                      )}

                      {canSubmit && submission.status !== "CORRIGE" && (
                        <div className="mt-3">
                          <SubmitWorkForm
                            assignmentId={submission.assignmentId}
                            currentContent={submission.content}
                            alreadySubmitted={submission.status !== "A_FAIRE"}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ------------------------------- Notes ------------------------------- */}
          <Card title="Mes notes publiees" padded={false}>
            {grades.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aucune note publiee"
                  description="Vos notes apparaissent ici une fois publiees par l'etablissement."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "date", label: "Date" },
                  { key: "subject", label: "Matiere" },
                  { key: "title", label: "Evaluation" },
                  { key: "score", label: "Note", align: "right" },
                ]}
              >
                {grades.map((grade) => (
                  <tr key={grade.id}>
                    <td className="whitespace-nowrap text-xs">
                      {formatDate(grade.evaluation.date, school.locale)}
                    </td>
                    <td className="text-sm">{grade.evaluation.subject.name}</td>
                    <td className="text-sm">{grade.evaluation.title}</td>
                    <td className="num">
                      {grade.isAbsent
                        ? "Absent"
                        : `${formatScore(grade.scoreCenti, school.locale)} / ${grade.evaluation.maxScore}`}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Mon emploi du temps du jour" padded={false}>
            {todaySlots.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<CalendarIcon className="size-7" />}
                  title="Aucun cours aujourd'hui"
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {todaySlots.map((slot) => (
                  <li key={slot.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-20 shrink-0 text-xs tabular text-slate-500">
                      {formatMinutes(slot.startMinute)}
                      <br />
                      {formatMinutes(slot.endMinute)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {slot.subject.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {slot.teacher?.lastName}
                        {slot.room && ` · ${slot.room}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-200 px-4 py-3">
              <Link href="/pedagogie/emploi-du-temps" className="text-xs font-medium text-brand-700 hover:underline">
                Voir la semaine complete
              </Link>
            </div>
          </Card>

          <Card title="Mes bulletins" padded={false}>
            {student.reportCards.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun bulletin" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {student.reportCards.map((card) => (
                  <li key={card.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        {card.gradingPeriod.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        Moyenne {formatScore(card.averageCenti, school.locale)}
                        {card.rank && ` · rang ${card.rank}/${card.classSize}`}
                      </span>
                    </span>
                    <Link
                      href={`/api/documents/bulletin/${student.id}/${card.gradingPeriodId}`}
                      target="_blank"
                      className="btn-ghost btn-sm"
                    >
                      PDF
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Annonces" padded={false}>
            {announcements.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucune annonce" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {announcements.map((announcement) => (
                  <li key={announcement.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{announcement.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{announcement.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
