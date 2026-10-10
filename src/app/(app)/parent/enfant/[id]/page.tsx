import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, assertGuardianOwnsStudent, guardianStudentIds } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { formatScore } from "@/lib/domain/grades";
import { loadStudentAccount } from "@/lib/domain/student-account";
import { ATTENDANCE_STATUS_LABELS, SUBMISSION_STATUS_LABELS, WEEKDAY_LABELS } from "@/lib/constants";
import { formatMinutes } from "@/lib/format";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  StatCard,
} from "@/components/ui";

export const metadata: Metadata = { title: "Suivi de l'enfant" };

/**
 * Detail d'un enfant pour son parent.
 *
 * L'acces est double-verifie : permission de role, puis rattachement effectif
 * du parent a CET eleve. Les notes et la facturation ne s'affichent que si les
 * autorisations correspondantes sont accordees sur le lien parent-enfant.
 */
export default async function ParentChildPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_VIEW_OWN);
  const { id } = await params;
  const { school } = context;

  // Leve une 404 si l'eleve n'est pas rattache a ce parent.
  await assertGuardianOwnsStudent(context, id);

  const [student, link] = await Promise.all([
    prisma.student.findFirst({
      where: { id, schoolId: school.id },
      include: {
        enrollments: {
          where: { status: "ACTIVE" },
          include: {
            classRoom: {
              include: {
                level: true,
                mainTeacher: { select: { firstName: true, lastName: true } },
                timetableSlots: {
                  include: { subject: { select: { name: true } } },
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
    }),
    prisma.studentGuardian.findFirst({
      where: { studentId: id, guardian: { userId: context.user.id } },
      select: { canViewGrades: true, canViewFinance: true },
    }),
  ]);

  if (!student) notFound();

  const canViewGrades = link?.canViewGrades ?? false;
  const canViewFinance = link?.canViewFinance ?? false;
  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const enrollment = student.enrollments[0];

  const [account, attendances, submissions, publishedGrades] = await Promise.all([
    canViewFinance ? loadStudentAccount(student.id, school.id) : Promise.resolve(null),
    prisma.attendance.findMany({
      where: { studentId: student.id, status: { in: ["ABSENT", "RETARD", "EXCUSE"] } },
      orderBy: { date: "desc" },
      take: 15,
    }),
    prisma.submission.findMany({
      where: { studentId: student.id, assignment: { status: "PUBLISHED" } },
      include: {
        assignment: {
          select: { title: true, dueAt: true, maxScore: true, subject: { select: { name: true } } },
        },
      },
      orderBy: { assignment: { dueAt: "desc" } },
      take: 15,
    }),
    // Seules les evaluations PUBLIEES sont visibles d'une famille.
    canViewGrades
      ? prisma.grade.findMany({
          where: { studentId: student.id, evaluation: { status: "PUBLISHED" } },
          include: {
            evaluation: {
              select: {
                title: true,
                date: true,
                maxScore: true,
                coefficient: true,
                subject: { select: { name: true } },
                gradingPeriod: { select: { name: true } },
              },
            },
          },
          orderBy: { evaluation: { date: "desc" } },
          take: 40,
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Mes enfants", href: "/parent" }, { label: `${student.lastName} ${student.firstName}` }]}
        title={`${student.lastName} ${student.firstName}`}
        description={`${student.matricule} — ${enrollment?.classRoom.name ?? "non inscrit"}${enrollment ? ` — ${enrollment.academicYear.name}` : ""}`}
        actions={
          <>
            <Link
              href={`/api/documents/certificat-scolarite/${student.id}`}
              target="_blank"
              className="btn-secondary"
            >
              Certificat
            </Link>
            {canViewFinance && (
              <Link
                href={`/api/documents/releve-compte/${student.id}`}
                target="_blank"
                className="btn-secondary"
              >
                Releve de compte
              </Link>
            )}
          </>
        }
      />

      {canViewFinance && account && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard tone="sky" label="Total du" value={money(account.netDueMinor)} />
          <StatCard tone="mint" label="Paye et confirme" value={money(account.paidMinor)} />
          <StatCard
            tone="iris"
            label="En attente"
            value={money(account.pendingProofMinor)}
            hint="Non deduit du solde."
          />
          <StatCard
            tone={account.balanceMinor > 0 ? "rose" : "mint"}
            label="Reste a payer"
            value={money(account.balanceMinor)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ------------------------------ Notes ------------------------------ */}
          {canViewGrades ? (
            <>
              <Card title="Bulletins" padded={false}>
                {student.reportCards.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      title="Aucun bulletin publie"
                      description="Les bulletins apparaissent apres publication par l'etablissement."
                    />
                  </div>
                ) : (
                  <DataTable
                    columns={[
                      { key: "period", label: "Periode" },
                      { key: "average", label: "Moyenne", align: "right" },
                      { key: "rank", label: "Rang", align: "right" },
                      { key: "classAvg", label: "Moyenne classe", align: "right" },
                      { key: "pdf", label: "", align: "right" },
                    ]}
                  >
                    {student.reportCards.map((card) => (
                      <tr key={card.id}>
                        <td className="font-medium">{card.gradingPeriod.name}</td>
                        <td className="num">{formatScore(card.averageCenti, school.locale)}</td>
                        <td className="num">{card.rank ? `${card.rank} / ${card.classSize}` : "—"}</td>
                        <td className="num text-slate-600">
                          {formatScore(card.classAverageCenti, school.locale)}
                        </td>
                        <td className="text-right">
                          <Link
                            href={`/api/documents/bulletin/${student.id}/${card.gradingPeriodId}`}
                            target="_blank"
                            className="btn-ghost btn-sm"
                          >
                            PDF
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </Card>

              <Card title="Notes publiees" padded={false}>
                {publishedGrades.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      title="Aucune note publiee"
                      description="Les notes ne sont visibles qu'une fois publiees par l'etablissement."
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
                    {publishedGrades.map((grade) => (
                      <tr key={grade.id}>
                        <td className="whitespace-nowrap text-xs">
                          {formatDate(grade.evaluation.date, school.locale)}
                          <span className="block text-slate-400">
                            {grade.evaluation.gradingPeriod.name}
                          </span>
                        </td>
                        <td className="text-sm">{grade.evaluation.subject.name}</td>
                        <td className="text-sm">
                          {grade.evaluation.title}
                          <span className="block text-xs text-slate-400">
                            coef. {grade.evaluation.coefficient}
                          </span>
                        </td>
                        <td className="num">
                          {grade.isAbsent ? (
                            <Badge tone={grade.isExcused ? "info" : "warning"}>
                              {grade.isExcused ? "Absence excusee" : "Absent"}
                            </Badge>
                          ) : (
                            `${formatScore(grade.scoreCenti, school.locale)} / ${grade.evaluation.maxScore}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState
                title="Notes non accessibles"
                description="Vous n'etes pas autorise a consulter les resultats de cet enfant. Contactez le secretariat si cela vous semble incorrect."
              />
            </Card>
          )}

          {/* ------------------------------ Devoirs ------------------------------ */}
          <Card title="Devoirs" padded={false}>
            {submissions.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun devoir" />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "due", label: "A rendre" },
                  { key: "subject", label: "Matiere" },
                  { key: "title", label: "Devoir" },
                  { key: "status", label: "Statut" },
                  { key: "score", label: "Note", align: "right" },
                ]}
              >
                {submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td className="whitespace-nowrap text-xs">
                      {formatDate(submission.assignment.dueAt, school.locale)}
                    </td>
                    <td className="text-sm">{submission.assignment.subject.name}</td>
                    <td className="text-sm">{submission.assignment.title}</td>
                    <td>
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
                    </td>
                    <td className="num">
                      {submission.scoreCenti !== null
                        ? `${formatScore(submission.scoreCenti, school.locale)} / ${submission.assignment.maxScore}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        {/* ---------------------------- Colonne droite ---------------------------- */}
        <div className="space-y-5">
          <Card title="Scolarite">
            <FieldGrid cols={2}>
              <Field label="Classe">{enrollment?.classRoom.name}</Field>
              <Field label="Niveau">{enrollment?.classRoom.level.name}</Field>
              <Field label="Professeur principal">
                {enrollment?.classRoom.mainTeacher
                  ? `${enrollment.classRoom.mainTeacher.lastName} ${enrollment.classRoom.mainTeacher.firstName}`
                  : "—"}
              </Field>
              <Field label="Date de naissance">{formatDate(student.birthDate, school.locale)}</Field>
            </FieldGrid>
          </Card>

          <Card title="Absences et retards" padded={false}>
            {attendances.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun incident" description="Assiduite sans incident signale." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attendances.map((attendance) => (
                  <li key={attendance.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-sm text-slate-700">
                      {formatDate(attendance.date, school.locale)}
                    </span>
                    <Badge tone={attendance.status === "ABSENT" ? "danger" : "warning"}>
                      {ATTENDANCE_STATUS_LABELS[attendance.status] ?? attendance.status}
                      {attendance.minutesLate > 0 && ` (${attendance.minutesLate} min)`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {enrollment && enrollment.classRoom.timetableSlots.length > 0 && (
            <Card title="Emploi du temps" padded={false}>
              <ul className="divide-y divide-slate-100">
                {enrollment.classRoom.timetableSlots.map((slot) => (
                  <li key={slot.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-16 shrink-0 text-xs font-medium text-slate-500">
                      {WEEKDAY_LABELS[slot.weekday]?.slice(0, 3)}
                    </span>
                    <span className="w-24 shrink-0 text-xs tabular text-slate-500">
                      {formatMinutes(slot.startMinute)}–{formatMinutes(slot.endMinute)}
                    </span>
                    <span className="min-w-0 truncate text-sm text-slate-800">{slot.subject.name}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
