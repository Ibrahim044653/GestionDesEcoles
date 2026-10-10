import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { getCurrentAcademicYear, listClassRooms } from "@/lib/domain/school-context";
import { Card, PageHeader, Alert } from "@/components/ui";
import { StudentForm } from "../student-form";

export const metadata: Metadata = { title: "Nouvel eleve" };

export default async function NewStudentPage() {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_CREATE);
  const academicYear = await getCurrentAcademicYear(context.school.id);
  const classRooms = academicYear ? await listClassRooms(context.school.id, academicYear.id) : [];

  return (
    <>
      <PageHeader
        title="Nouvel eleve"
        description="Les champs marques d'un asterisque sont obligatoires. Le matricule est genere automatiquement s'il est laisse vide."
        breadcrumb={[{ label: "Eleves", href: "/eleves" }, { label: "Nouvel eleve" }]}
      />

      {!academicYear && (
        <div className="mb-4">
          <Alert tone="warning" title="Aucune annee scolaire active">
            L&apos;eleve sera cree sans inscription. Configurez une annee scolaire pour pouvoir
            l&apos;affecter a une classe et lui appliquer les frais.
          </Alert>
        </div>
      )}

      <Card>
        <StudentForm
          mode="create"
          academicYear={academicYear ? { id: academicYear.id, name: academicYear.name } : null}
          classRooms={classRooms.map((room) => ({
            id: room.id,
            name: room.name,
            level: room.level.name,
            remaining: room.capacity - room._count.enrollments,
          }))}
        />
      </Card>
    </>
  );
}
