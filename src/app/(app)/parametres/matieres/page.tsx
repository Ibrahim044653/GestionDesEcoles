import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { HIGHER_EDUCATION_TYPES, type SchoolType } from "@/lib/constants";
import { Card, DataTable, EmptyState, PageHeader, Alert, BookIcon } from "@/components/ui";
import { SubjectForm } from "./subject-form";

export const metadata: Metadata = { title: "Matieres" };

/**
 * Matieres et coefficients.
 *
 * Pour l'enseignement superieur, les matieres portent des credits et peuvent
 * etre rattachees a une unite d'enseignement (UE) : elles jouent alors le role
 * d'elements constitutifs (EC).
 */
export default async function SubjectsPage() {
  const context = await requirePagePermission(PERMISSIONS.SUBJECT_MANAGE);
  const { school } = context;

  const isHigherEducation = HIGHER_EDUCATION_TYPES.includes(school.type as SchoolType);

  const [subjects, teachingUnits] = await Promise.all([
    prisma.subject.findMany({
      where: { schoolId: school.id },
      orderBy: { name: "asc" },
      include: {
        teachingUnit: { select: { code: true, name: true, credits: true } },
        _count: { select: { classSubjects: true, evaluations: true } },
      },
    }),
    prisma.teachingUnit.findMany({
      where: { schoolId: school.id },
      orderBy: { code: "asc" },
      include: { _count: { select: { subjects: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Parametres", href: "/parametres" }, { label: "Matieres" }]}
        title="Matieres et coefficients"
        description="Le coefficient par defaut s'applique a la creation d'une affectation ; il reste modifiable classe par classe."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title={`${subjects.length} matiere(s)`} padded={false}>
            {subjects.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<BookIcon className="size-8" />}
                  title="Aucune matiere"
                  description="Creez les matieres enseignees dans l'etablissement."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Matiere" },
                  ...(isHigherEducation
                    ? [
                        { key: "ue", label: "Unite d'enseignement" },
                        { key: "credits", label: "Credits", align: "right" as const },
                      ]
                    : []),
                  { key: "coef", label: "Coef. par defaut", align: "right" },
                  { key: "classes", label: "Classes", align: "right" },
                  { key: "evals", label: "Evaluations", align: "right" },
                ]}
              >
                {subjects.map((subject) => (
                  <tr key={subject.id}>
                    <td className="font-mono text-xs">{subject.code}</td>
                    <td className="font-medium text-slate-900">{subject.name}</td>
                    {isHigherEducation && (
                      <>
                        <td className="text-sm text-slate-600">
                          {subject.teachingUnit
                            ? `${subject.teachingUnit.code} — ${subject.teachingUnit.name}`
                            : "—"}
                        </td>
                        <td className="num">{subject.credits || "—"}</td>
                      </>
                    )}
                    <td className="num">{subject.defaultCoefficient}</td>
                    <td className="num text-slate-600">{subject._count.classSubjects}</td>
                    <td className="num text-slate-600">{subject._count.evaluations}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          {isHigherEducation && (
            <Card title="Unites d'enseignement" padded={false}>
              {teachingUnits.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="Aucune unite d'enseignement"
                    description="Les UE regroupent les elements constitutifs et portent les credits."
                  />
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "name", label: "Intitule" },
                    { key: "semester", label: "Semestre", align: "right" },
                    { key: "credits", label: "Credits", align: "right" },
                    { key: "ec", label: "EC", align: "right" },
                  ]}
                >
                  {teachingUnits.map((unit) => (
                    <tr key={unit.id}>
                      <td className="font-mono text-xs">{unit.code}</td>
                      <td className="font-medium text-slate-900">{unit.name}</td>
                      <td className="num">{unit.semester}</td>
                      <td className="num">{unit.credits}</td>
                      <td className="num text-slate-600">{unit._count.subjects}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Nouvelle matiere">
            <SubjectForm
              isHigherEducation={isHigherEducation}
              teachingUnits={teachingUnits.map((unit) => ({
                id: unit.id,
                label: `${unit.code} — ${unit.name}`,
              }))}
            />
          </Card>

          {isHigherEducation && (
            <Alert tone="info" title="Validation des credits">
              Un element constitutif est acquis lorsque sa moyenne atteint le seuil de validation
              configure. Aucune compensation automatique entre unites d&apos;enseignement
              n&apos;est appliquee : cette regle varie selon les etablissements et doit etre
              parametree explicitement.
            </Alert>
          )}
        </div>
      </div>
    </>
  );
}
