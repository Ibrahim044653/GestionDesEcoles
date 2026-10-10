import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES } from "@/lib/constants";
import { getCurrentAcademicYear, listAcademicYears } from "@/lib/domain/school-context";
import { Badge, Card, DataTable, EmptyState, PageHeader, SchoolIcon } from "@/components/ui";

export const metadata: Metadata = { title: "Classes" };

/** Vue d'ensemble des classes : effectifs, capacite, matieres et enseignants. */
export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_VIEW);
  const params = await searchParams;
  const { school } = context;

  const currentYear = await getCurrentAcademicYear(school.id);
  const academicYearId = params.annee ?? currentYear?.id;
  const academicYears = await listAcademicYears(school.id);

  const isTeacher = context.membership?.roleCode === ROLES.TEACHER;
  const scope = isTeacher ? await teacherScope(context) : null;

  const classRooms = await prisma.classRoom.findMany({
    where: {
      schoolId: school.id,
      ...(academicYearId ? { academicYearId } : {}),
      ...(scope ? { id: { in: scope.classRoomIds } } : {}),
    },
    orderBy: [{ level: { sortOrder: "asc" } }, { name: "asc" }],
    include: {
      level: { select: { name: true } },
      track: { select: { name: true } },
      mainTeacher: { select: { firstName: true, lastName: true } },
      classSubjects: {
        include: {
          subject: { select: { name: true } },
          teacher: { select: { lastName: true } },
        },
      },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });

  const totalStudents = classRooms.reduce((total, room) => total + room._count.enrollments, 0);
  const totalCapacity = classRooms.reduce((total, room) => total + room.capacity, 0);

  return (
    <>
      <PageHeader
        title="Classes"
        description={
          isTeacher
            ? "Les classes qui vous sont affectees."
            : `${classRooms.length} classe(s) — ${totalStudents} eleve(s) pour ${totalCapacity} places.`
        }
      />

      {academicYears.length > 1 && (
        <form method="get" action="/classes" className="mb-5 flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <label htmlFor="annee" className="field-label">
              Annee scolaire
            </label>
            <select id="annee" name="annee" defaultValue={academicYearId ?? ""} className="input">
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isCurrent ? " (en cours)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">
            Afficher
          </button>
        </form>
      )}

      {classRooms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SchoolIcon className="size-8" />}
            title="Aucune classe"
            description="Creez des niveaux et des classes dans les parametres pour commencer."
            action={
              <Link href="/parametres/classes" className="btn-primary btn-sm">
                Configurer les classes
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classRooms.map((room) => {
            const fillRate = room.capacity > 0 ? (room._count.enrollments / room.capacity) * 100 : 0;
            const full = room._count.enrollments >= room.capacity;

            return (
              <Card key={room.id} padded={false}>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-900">{room.name}</h2>
                      <p className="text-xs text-slate-500">
                        {room.level.name}
                        {room.track && ` — ${room.track.name}`}
                        {room.roomLabel && ` · ${room.roomLabel}`}
                      </p>
                    </div>
                    {full && <Badge tone="danger">Complet</Badge>}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-slate-600">Effectif</span>
                      <span className="tabular font-semibold text-slate-900">
                        {room._count.enrollments}
                        <span className="font-normal text-slate-400"> / {room.capacity}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={full ? "h-full bg-rose-500" : "h-full bg-brand-500"}
                        style={{ width: `${Math.min(100, fillRate)}%` }}
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-600">
                    <span className="text-slate-400">Professeur principal : </span>
                    {room.mainTeacher
                      ? `${room.mainTeacher.lastName} ${room.mainTeacher.firstName}`
                      : "non designe"}
                  </p>

                  {room.classSubjects.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-brand-700 hover:underline">
                        {room.classSubjects.length} matiere(s)
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {room.classSubjects.map((classSubject) => (
                          <li key={classSubject.id} className="flex justify-between gap-2">
                            <span className="truncate">{classSubject.subject.name}</span>
                            <span className="shrink-0 text-slate-400">
                              coef. {classSubject.coefficient}
                              {classSubject.teacher && ` · ${classSubject.teacher.lastName}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                <div className="flex gap-2 border-t border-slate-200 px-5 py-3">
                  <Link href={`/eleves?classe=${room.id}`} className="btn-secondary btn-sm">
                    Eleves
                  </Link>
                  <Link
                    href={`/api/documents/liste-classe/${room.id}`}
                    target="_blank"
                    className="btn-ghost btn-sm"
                  >
                    Liste PDF
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
