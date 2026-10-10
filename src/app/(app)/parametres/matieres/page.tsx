import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { HIGHER_EDUCATION_TYPES, type SchoolType } from "@/lib/constants";
import { Card, DataTable, EmptyState, PageHeader, Alert, BookIcon } from "@/components/ui";
import { SubjectForm, TeachingUnitForm, AssignSubjectToUnitForm } from "./subject-form";

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

  const [subjects, teachingUnits, levels, tracks] = await Promise.all([
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
      orderBy: [{ semester: "asc" }, { code: "asc" }],
      include: {
        level: { select: { name: true } },
        track: { select: { name: true } },
        subjects: { select: { id: true, code: true, name: true, credits: true } },
      },
    }),
    prisma.level.findMany({
      where: { schoolId: school.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.track.findMany({
      where: { schoolId: school.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Parametres", href: "/parametres" }, { label: "Matieres" }]}
        title={isHigherEducation ? "Matieres et unites d'enseignement" : "Matieres et coefficients"}
        description="Le coefficient saisi ici est une valeur par defaut ; il reste modifiable classe par classe."
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
                            : <span className="text-amber-700">non rattachee</span>}
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
            <Card
              title="Unites d'enseignement"
              description="Une UE regroupe des elements constitutifs et porte les credits acquis a sa validation."
              padded={false}
            >
              {teachingUnits.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="Aucune unite d'enseignement"
                    description="Creez vos UE, puis rattachez-y les matieres qui les composent."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {teachingUnits.map((unit) => {
                    const creditsEC = unit.subjects.reduce((total, ec) => total + ec.credits, 0);

                    return (
                      <li key={unit.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              <span className="font-mono text-xs text-slate-500">{unit.code}</span>{" "}
                              {unit.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              Semestre {unit.semester}
                              {unit.level && ` — ${unit.level.name}`}
                              {unit.track && ` — ${unit.track.name}`}
                            </p>
                          </div>
                          <span className="tabular text-sm font-medium text-slate-700">
                            {unit.credits} credits
                          </span>
                        </div>

                        {unit.subjects.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-400">
                            Aucun element constitutif rattache.
                          </p>
                        ) : (
                          <>
                            <ul className="mt-2 space-y-1">
                              {unit.subjects.map((ec) => (
                                <li
                                  key={ec.id}
                                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs"
                                >
                                  <span className="text-slate-700">
                                    <span className="font-mono text-slate-500">{ec.code}</span>{" "}
                                    {ec.name}
                                  </span>
                                  <span className="tabular text-slate-500">{ec.credits} cr.</span>
                                </li>
                              ))}
                            </ul>
                            {creditsEC !== unit.credits && (
                              <p className="mt-1.5 text-xs text-amber-700">
                                Les credits des elements constitutifs ({creditsEC}) different de
                                ceux de l&apos;UE ({unit.credits}).
                              </p>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
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
            <>
              <Card title="Nouvelle unite d'enseignement">
                <TeachingUnitForm levels={levels} tracks={tracks} />
              </Card>

              {subjects.length > 0 && teachingUnits.length > 0 && (
                <Card
                  title="Rattacher une matiere"
                  description="Associe un element constitutif existant a une unite d'enseignement."
                >
                  <AssignSubjectToUnitForm
                    subjects={subjects.map((subject) => ({
                      id: subject.id,
                      label: `${subject.code} — ${subject.name}`,
                    }))}
                    teachingUnits={teachingUnits.map((unit) => ({
                      id: unit.id,
                      label: `${unit.code} — ${unit.name}`,
                    }))}
                  />
                </Card>
              )}

              <Alert tone="info" title="Validation des credits">
                Un element constitutif est acquis lorsque sa moyenne atteint le seuil de validation
                configure. Aucune compensation automatique entre unites d&apos;enseignement
                n&apos;est appliquee : cette regle varie selon les etablissements et doit etre
                parametree explicitement.
              </Alert>
            </>
          )}
        </div>
      </div>
    </>
  );
}
