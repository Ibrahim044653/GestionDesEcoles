import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, assertSameSchoolOrNotFound } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { toDateInputValue } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { StudentForm } from "../../student-form";

export const metadata: Metadata = { title: "Modifier un eleve" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_UPDATE);
  const { id } = await params;

  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) notFound();
  await assertSameSchoolOrNotFound(context, student, "student");

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Eleves", href: "/eleves" },
          { label: `${student.lastName} ${student.firstName}`, href: `/eleves/${student.id}` },
          { label: "Modifier" },
        ]}
        title="Modifier le dossier"
        description={`Matricule ${student.matricule}`}
      />

      <Card>
        <StudentForm
          mode="edit"
          student={{
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            matricule: student.matricule,
            gender: student.gender,
            birthDate: toDateInputValue(student.birthDate),
            birthPlace: student.birthPlace,
            nationality: student.nationality,
            email: student.email,
            phone: student.phone,
            address: student.address,
            emergencyContactName: student.emergencyContactName,
            emergencyContactPhone: student.emergencyContactPhone,
            previousSchool: student.previousSchool,
            bloodGroup: student.bloodGroup,
            medicalNotes: student.medicalNotes,
          }}
        />
      </Card>
    </>
  );
}
