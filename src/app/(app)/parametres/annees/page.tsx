import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Card, DataTable, EmptyState, PageHeader, Alert, CalendarIcon } from "@/components/ui";
import { AcademicYearForm, GradingPeriodForm, CloseYearButton } from "./year-forms";

export const metadata: Metadata = { title: "Annees scolaires" };

/** Annees scolaires et periodes d'evaluation (trimestres, semestres). */
export default async function AcademicYearsPage() {
  const context = await requirePagePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);
  const { school } = context;

  const years = await prisma.academicYear.findMany({
    where: { schoolId: school.id },
    orderBy: { startDate: "desc" },
    include: {
      gradingPeriods: { orderBy: { sortOrder: "asc" } },
      _count: { select: { enrollments: true, classRooms: true, feeItems: true } },
    },
  });

  const isHigherEducation = ["UNIVERSITE", "FORMATION_PRO"].includes(school.type);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Parametres", href: "/parametres" }, { label: "Annees scolaires" }]}
        title="Annees scolaires et periodes"
        description="Une annee scolaire structure les inscriptions, les frais et les evaluations. Les periodes decoupent l'annee en trimestres ou semestres."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {years.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CalendarIcon className="size-8" />}
                title="Aucune annee scolaire"
                description="Creez une annee scolaire pour pouvoir inscrire des eleves et emettre des frais."
              />
            </Card>
          ) : (
            years.map((year) => (
              <Card
                key={year.id}
                title={year.name}
                description={`${formatDate(year.startDate, school.locale)} → ${formatDate(year.endDate, school.locale)}`}
                actions={
                  <>
                    {year.isCurrent && <Badge tone="success">Annee en cours</Badge>}
                    {year.status === "CLOSED" ? (
                      <Badge tone="neutral">Cloturee</Badge>
                    ) : (
                      <CloseYearButton academicYearId={year.id} name={year.name} />
                    )}
                  </>
                }
                padded={false}
              >
                <div className="grid grid-cols-3 gap-px bg-slate-100">
                  {[
                    { label: "Inscriptions", value: year._count.enrollments },
                    { label: "Classes", value: year._count.classRooms },
                    { label: "Frais au catalogue", value: year._count.feeItems },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white px-4 py-3">
                      <p className="label-caps text-slate-500">{stat.label}</p>
                      <p className="mt-0.5 text-lg font-semibold text-slate-900 tabular">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 p-5">
                  <h3 className="label-caps mb-3 text-slate-500">Periodes d&apos;evaluation</h3>

                  {year.gradingPeriods.length === 0 ? (
                    <p className="mb-4 text-sm text-slate-500">
                      Aucune periode definie. Sans periode, aucune evaluation ni bulletin
                      n&apos;est possible.
                    </p>
                  ) : (
                    <DataTable
                      columns={[
                        { key: "name", label: "Periode" },
                        { key: "range", label: "Du / au" },
                        { key: "status", label: "Etat" },
                      ]}
                    >
                      {year.gradingPeriods.map((period) => (
                        <tr key={period.id}>
                          <td className="font-medium text-slate-900">{period.name}</td>
                          <td className="text-slate-600">
                            {formatDate(period.startDate, school.locale)} →{" "}
                            {formatDate(period.endDate, school.locale)}
                          </td>
                          <td>
                            <Badge tone={period.status === "LOCKED" ? "neutral" : "success"}>
                              {period.status === "LOCKED" ? "Publiee et verrouillee" : "Ouverte"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  )}

                  {year.status !== "CLOSED" && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-medium text-brand-700 hover:underline">
                        Ajouter une periode
                      </summary>
                      <div className="mt-3 max-w-xl">
                        <GradingPeriodForm
                          academicYearId={year.id}
                          defaultKind={isHigherEducation ? "SEMESTRE" : "TRIMESTRE"}
                          nextOrder={year.gradingPeriods.length + 1}
                        />
                      </div>
                    </details>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-5">
          <Card title="Nouvelle annee scolaire">
            <AcademicYearForm />
          </Card>

          <Alert tone="info" title="Cloture d'une annee">
            Cloturer une annee bloque toute nouvelle inscription et tout nouveau frais sur cette
            annee. Aucune donnee n&apos;est supprimee : l&apos;historique reste consultable,
            imprimable et exportable.
          </Alert>
        </div>
      </div>
    </>
  );
}
