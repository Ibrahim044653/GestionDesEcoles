import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES } from "@/lib/constants";
import {
  getCurrentAcademicYear,
  listClassRooms,
  listGradingPeriods,
} from "@/lib/domain/school-context";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubjectAppreciationsForm } from "./appreciations-form";

export const metadata: Metadata = { title: "Appreciations par matiere" };

/**
 * Saisie des appreciations par matiere.
 *
 * Les listes proposees sont deja bornees au perimetre de l'enseignant ; le
 * serveur revalide de toute facon le couple classe/matiere a l'enregistrement
 * (`assertTeacherCanTouch`). Masquer n'est pas proteger.
 */
export default async function SubjectAppreciationsPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; matiere?: string; periode?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.GRADE_ENTER);
  const params = await searchParams;
  const { school } = context;

  const academicYear = await getCurrentAcademicYear(school.id);
  const isTeacher = context.membership?.roleCode === ROLES.TEACHER;
  const scope = isTeacher ? await teacherScope(context) : null;

  const [allClassRooms, periods] = await Promise.all([
    listClassRooms(school.id, academicYear?.id),
    listGradingPeriods(school.id, academicYear?.id),
  ]);

  const classRooms = scope
    ? allClassRooms.filter((room) => scope.classRoomIds.includes(room.id))
    : allClassRooms;

  const selectedClassId = params.classe ?? classRooms[0]?.id;
  const selectedPeriodId = params.periode ?? periods[periods.length - 1]?.id;

  // Matieres reellement enseignees dans cette classe, et pour un enseignant,
  // uniquement celles qui lui sont affectees.
  const classSubjects = selectedClassId
    ? await prisma.classSubject.findMany({
        where: {
          classRoomId: selectedClassId,
          ...(scope ? { teacherId: scope.staffId ?? "__aucun__" } : {}),
        },
        select: { subjectId: true, subject: { select: { id: true, name: true } } },
        orderBy: { subject: { name: "asc" } },
      })
    : [];

  const selectedSubjectId = params.matiere ?? classSubjects[0]?.subjectId;
  const subjectAllowed = classSubjects.some((item) => item.subjectId === selectedSubjectId);

  const enrollments =
    selectedClassId && selectedPeriodId && selectedSubjectId && subjectAllowed && academicYear
      ? await prisma.enrollment.findMany({
          where: {
            classRoomId: selectedClassId,
            academicYearId: academicYear.id,
            status: "ACTIVE",
          },
          orderBy: { student: { lastName: "asc" } },
          select: {
            student: {
              select: {
                id: true,
                matricule: true,
                firstName: true,
                lastName: true,
                subjectAppreciations: {
                  where: { gradingPeriodId: selectedPeriodId, subjectId: selectedSubjectId },
                  select: { text: true },
                },
              },
            },
          },
        })
      : [];

  const period = periods.find((item) => item.id === selectedPeriodId);
  const periodLocked = period?.status === "LOCKED";

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Pedagogie", href: "/pedagogie/evaluations" },
          { label: "Appreciations" },
        ]}
        title="Appreciations par matiere"
        description="Chaque enseignant redige l'appreciation de sa matiere ; elle est reprise sur le bulletin."
      />

      <Card className="mb-5">
        <form
          method="get"
          action="/pedagogie/appreciations"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-44">
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
          <div className="min-w-44">
            <label htmlFor="matiere" className="field-label">
              Matiere
            </label>
            <select
              id="matiere"
              name="matiere"
              defaultValue={selectedSubjectId ?? ""}
              className="input"
            >
              {classSubjects.map((item) => (
                <option key={item.subjectId} value={item.subjectId}>
                  {item.subject.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-44">
            <label htmlFor="periode" className="field-label">
              Periode
            </label>
            <select
              id="periode"
              name="periode"
              defaultValue={selectedPeriodId ?? ""}
              className="input"
            >
              {periods.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Afficher
          </button>
        </form>
      </Card>

      {periodLocked && (
        <div className="mb-5">
          <Alert tone="info" title="Periode verrouillee">
            Les resultats de cette periode sont publies. Une appreciation saisie maintenant
            n&apos;apparaitra que sur un bulletin regenere.
          </Alert>
        </div>
      )}

      {classRooms.length === 0 ? (
        <Card>
          <EmptyState
            title="Aucune classe"
            description="Aucune classe ne vous est affectee pour cette annee scolaire."
          />
        </Card>
      ) : classSubjects.length === 0 ? (
        <Card>
          <EmptyState
            title="Aucune matiere"
            description="Aucune matiere ne vous est affectee dans cette classe."
          />
        </Card>
      ) : enrollments.length === 0 ? (
        <Card>
          <EmptyState title="Aucun eleve" description="Cette classe ne compte aucun eleve actif." />
        </Card>
      ) : (
        <Card
          title={classSubjects.find((item) => item.subjectId === selectedSubjectId)?.subject.name}
          description="Une appreciation vide est supprimee : le bulletin n'affichera pas de ligne vide."
          padded={false}
        >
          <SubjectAppreciationsForm
            classRoomId={selectedClassId!}
            subjectId={selectedSubjectId!}
            gradingPeriodId={selectedPeriodId!}
            students={enrollments.map(({ student }) => ({
              id: student.id,
              matricule: student.matricule,
              name: `${student.lastName} ${student.firstName}`,
              text: student.subjectAppreciations[0]?.text ?? "",
            }))}
          />
        </Card>
      )}
    </>
  );
}
