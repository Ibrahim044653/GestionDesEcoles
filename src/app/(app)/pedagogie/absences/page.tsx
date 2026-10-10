import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, ATTENDANCE_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getCurrentAcademicYear, listClassRooms, listSubjects } from "@/lib/domain/school-context";
import { Badge, Card, DataTable, EmptyState, PageHeader, StatCard, CalendarIcon } from "@/components/ui";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata: Metadata = { title: "Absences" };

/** Appel et suivi de l'assiduite. */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; date?: string; matiere?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.ATTENDANCE_VIEW);
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

  const selectedClassId = params.classe ?? classRooms[0]?.id;
  const dateValue = params.date ?? new Date().toISOString().slice(0, 10);
  const date = new Date(dateValue);
  const subjectId = params.matiere || null;

  const canRecord = hasPermission(context, PERMISSIONS.ATTENDANCE_RECORD);

  const [enrollments, existing, monthStats, recentAbsences] = await Promise.all([
    selectedClassId
      ? prisma.enrollment.findMany({
          where: { classRoomId: selectedClassId, status: "ACTIVE" },
          select: {
            student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
          },
          orderBy: { student: { lastName: "asc" } },
        })
      : Promise.resolve([]),
    selectedClassId
      ? prisma.attendance.findMany({
          where: { classRoomId: selectedClassId, date, subjectId },
          select: { studentId: true, status: true, minutesLate: true },
        })
      : Promise.resolve([]),
    prisma.attendance.groupBy({
      by: ["status"],
      where: {
        schoolId: school.id,
        date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        ...(scope ? { classRoomId: { in: scope.classRoomIds } } : {}),
      },
      _count: { _all: true },
    }),
    prisma.attendance.findMany({
      where: {
        schoolId: school.id,
        status: { in: ["ABSENT", "RETARD"] },
        ...(scope ? { classRoomId: { in: scope.classRoomIds } } : {}),
      },
      orderBy: { date: "desc" },
      take: 25,
      include: {
        student: { select: { id: true, lastName: true, firstName: true, matricule: true } },
        classRoom: { select: { name: true } },
      },
    }),
  ]);

  const existingByStudent = new Map(existing.map((record) => [record.studentId, record]));
  const countFor = (status: string) => monthStats.find((row) => row.status === status)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Absences et retards"
        description={
          isTeacher
            ? "Faites l'appel pour les classes qui vous sont affectees."
            : "Appel quotidien et suivi de l'assiduite."
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard tone="mint" label="Presences du mois" value={String(countFor("PRESENT"))} />
        <StatCard tone="rose" label="Absences du mois" value={String(countFor("ABSENT"))} />
        <StatCard tone="iris" label="Retards du mois" value={String(countFor("RETARD"))} />
        <StatCard tone="sky" label="Absences excusees" value={String(countFor("EXCUSE"))} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="mb-4">
            <form method="get" action="/pedagogie/absences" className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="classe" className="field-label">
                  Classe
                </label>
                <select id="classe" name="classe" defaultValue={selectedClassId ?? ""} className="input">
                  {classRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="date" className="field-label">
                  Date
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={dateValue}
                  max={new Date().toISOString().slice(0, 10)}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="matiere" className="field-label">
                  Matiere
                </label>
                <select id="matiere" name="matiere" defaultValue={params.matiere ?? ""} className="input">
                  <option value="">Journee entiere</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full">
                  Afficher l&apos;appel
                </button>
              </div>
            </form>
          </Card>

          <Card
            title={`Appel du ${formatDate(date, school.locale)}`}
            description={
              existing.length > 0
                ? "Un appel a deja ete enregistre pour cette date : vous pouvez le corriger."
                : "Aucun appel enregistre pour cette date."
            }
            padded={false}
          >
            {!selectedClassId || enrollments.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<CalendarIcon className="size-8" />}
                  title="Aucun eleve"
                  description="Choisissez une classe comptant des eleves inscrits."
                />
              </div>
            ) : !canRecord ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Eleve</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((enrollment) => {
                      const record = existingByStudent.get(enrollment.student.id);
                      return (
                        <tr key={enrollment.student.id}>
                          <td className="font-medium">
                            {enrollment.student.lastName} {enrollment.student.firstName}
                          </td>
                          <td>
                            {record ? (
                              ATTENDANCE_STATUS_LABELS[record.status] ?? record.status
                            ) : (
                              <span className="text-slate-400">Non renseigne</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <AttendanceSheet
                classRoomId={selectedClassId}
                date={dateValue}
                subjectId={subjectId}
                students={enrollments.map((enrollment) => {
                  const record = existingByStudent.get(enrollment.student.id);
                  return {
                    id: enrollment.student.id,
                    matricule: enrollment.student.matricule,
                    name: `${enrollment.student.lastName} ${enrollment.student.firstName}`,
                    status: record?.status ?? "PRESENT",
                    minutesLate: record?.minutesLate ?? 0,
                  };
                })}
              />
            )}
          </Card>
        </div>

        <Card title="Derniers incidents" padded={false}>
          {recentAbsences.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucun incident" description="Aucune absence ni retard enregistre." />
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "date", label: "Date" },
                { key: "student", label: "Eleve" },
                { key: "status", label: "Statut" },
              ]}
            >
              {recentAbsences.map((record) => (
                <tr key={record.id}>
                  <td className="whitespace-nowrap text-xs">{formatDate(record.date, school.locale)}</td>
                  <td>
                    <Link
                      href={`/eleves/${record.student.id}`}
                      className="text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {record.student.lastName} {record.student.firstName}
                    </Link>
                    <span className="block text-xs text-slate-400">{record.classRoom.name}</span>
                  </td>
                  <td>
                    <Badge tone={record.status === "ABSENT" ? "danger" : "warning"}>
                      {ATTENDANCE_STATUS_LABELS[record.status] ?? record.status}
                      {record.minutesLate > 0 && ` (${record.minutesLate} min)`}
                    </Badge>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
