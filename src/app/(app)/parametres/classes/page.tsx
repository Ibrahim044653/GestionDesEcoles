import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentAcademicYear, listAcademicYears } from "@/lib/domain/school-context";
import { Alert, Card, DataTable, EmptyState, PageHeader, SchoolIcon } from "@/components/ui";
import { LevelForm, ClassRoomForm } from "./class-forms";

export const metadata: Metadata = { title: "Niveaux et classes" };

/** Structure academique : niveaux, filieres et classes. */
export default async function ClassSettingsPage() {
  const context = await requirePagePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);
  const { school } = context;

  const currentYear = await getCurrentAcademicYear(school.id);

  const [levels, tracks, classRooms, academicYears, teachers] = await Promise.all([
    prisma.level.findMany({
      where: { schoolId: school.id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { classRooms: true } } },
    }),
    prisma.track.findMany({ where: { schoolId: school.id }, orderBy: { sortOrder: "asc" } }),
    prisma.classRoom.findMany({
      where: { schoolId: school.id, ...(currentYear ? { academicYearId: currentYear.id } : {}) },
      orderBy: [{ level: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        level: { select: { name: true } },
        track: { select: { name: true } },
        mainTeacher: { select: { firstName: true, lastName: true } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } }, classSubjects: true } },
      },
    }),
    listAcademicYears(school.id),
    prisma.staff.findMany({
      where: { schoolId: school.id, status: "ACTIVE", jobTitle: "ENSEIGNANT" },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Parametres", href: "/parametres" }, { label: "Niveaux et classes" }]}
        title="Niveaux et classes"
        description="Les niveaux structurent le cursus ; les classes accueillent les eleves pour une annee donnee."
      />

      {academicYears.length === 0 && (
        <div className="mb-5">
          <Alert tone="warning" title="Aucune annee scolaire">
            Creez d&apos;abord une annee scolaire : une classe appartient toujours a une annee.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Niveaux" padded={false}>
            {levels.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aucun niveau"
                  description="Creez les niveaux de votre cursus (CP1, 6eme, Licence 1...)."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "order", label: "Ordre", align: "right" },
                  { key: "code", label: "Code" },
                  { key: "name", label: "Libelle" },
                  { key: "classes", label: "Classes", align: "right" },
                ]}
              >
                {levels.map((level) => (
                  <tr key={level.id}>
                    <td className="num text-slate-500">{level.sortOrder}</td>
                    <td className="font-mono text-xs">{level.code}</td>
                    <td className="font-medium text-slate-900">{level.name}</td>
                    <td className="num">{level._count.classRooms}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          <Card
            title="Classes"
            description={currentYear ? `Annee ${currentYear.name}` : "Aucune annee en cours"}
            padded={false}
          >
            {classRooms.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<SchoolIcon className="size-8" />}
                  title="Aucune classe"
                  description="Creez des classes pour pouvoir y inscrire des eleves."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "name", label: "Classe" },
                  { key: "level", label: "Niveau" },
                  { key: "teacher", label: "Prof. principal" },
                  { key: "subjects", label: "Matieres", align: "right" },
                  { key: "effectif", label: "Effectif", align: "right" },
                ]}
              >
                {classRooms.map((room) => (
                  <tr key={room.id}>
                    <td>
                      <span className="block font-medium text-slate-900">{room.name}</span>
                      <span className="font-mono text-xs text-slate-400">{room.code}</span>
                    </td>
                    <td className="text-sm">
                      {room.level.name}
                      {room.track && <span className="block text-xs text-slate-400">{room.track.name}</span>}
                    </td>
                    <td className="text-sm text-slate-600">
                      {room.mainTeacher
                        ? `${room.mainTeacher.lastName} ${room.mainTeacher.firstName}`
                        : "—"}
                    </td>
                    <td className="num">{room._count.classSubjects}</td>
                    <td className="num">
                      {room._count.enrollments}
                      <span className="text-slate-400"> / {room.capacity}</span>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Nouveau niveau">
            <LevelForm nextOrder={levels.length + 1} />
          </Card>

          <Card title="Nouvelle classe">
            {levels.length === 0 || academicYears.length === 0 ? (
              <EmptyState
                title="Prerequis manquants"
                description="Creez d'abord une annee scolaire et au moins un niveau."
              />
            ) : (
              <ClassRoomForm
                levels={levels.map((level) => ({ id: level.id, name: level.name }))}
                tracks={tracks.map((track) => ({ id: track.id, name: track.name }))}
                academicYears={academicYears
                  .filter((year) => year.status !== "CLOSED")
                  .map((year) => ({ id: year.id, name: year.name, isCurrent: year.isCurrent }))}
                teachers={teachers.map((teacher) => ({
                  id: teacher.id,
                  label: `${teacher.lastName} ${teacher.firstName}`,
                }))}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
