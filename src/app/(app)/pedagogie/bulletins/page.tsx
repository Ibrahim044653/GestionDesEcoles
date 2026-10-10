import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { computeClassResults } from "@/lib/domain/report-cards";
import { formatScore, parseGradingSettings } from "@/lib/domain/grades";
import {
  getCurrentAcademicYear,
  listClassRooms,
  listGradingPeriods,
} from "@/lib/domain/school-context";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  FileIcon,
} from "@/components/ui";
import { GenerateReportCardsForm, PublishResultsForm } from "./bulletin-forms";

export const metadata: Metadata = { title: "Bulletins" };

/**
 * Generation et publication des bulletins.
 *
 * Deux gestes distincts, volontairement separes :
 *   - GENERER   : fige les moyennes et les rangs a l'instant T (reversible,
 *                 on peut regenerer) ;
 *   - PUBLIER   : rend les resultats visibles des familles, verrouille la
 *                 periode et notifie. Irreversible.
 */
export default async function ReportCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; periode?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.GRADE_VIEW_ALL);
  const params = await searchParams;
  const { school } = context;

  const academicYear = await getCurrentAcademicYear(school.id);

  const [classRooms, periods, schoolSettings] = await Promise.all([
    listClassRooms(school.id, academicYear?.id),
    listGradingPeriods(school.id, academicYear?.id),
    prisma.school.findUnique({ where: { id: school.id }, select: { gradingSettings: true } }),
  ]);

  const settings = parseGradingSettings(schoolSettings?.gradingSettings);
  const selectedClassId = params.classe ?? classRooms[0]?.id;
  const selectedPeriodId = params.periode ?? periods[0]?.id;
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);

  const results =
    selectedClassId && selectedPeriodId
      ? await computeClassResults(school.id, selectedClassId, selectedPeriodId)
      : null;

  const existingReportCards =
    selectedPeriodId && selectedClassId
      ? await prisma.reportCard.findMany({
          where: {
            gradingPeriodId: selectedPeriodId,
            student: { enrollments: { some: { classRoomId: selectedClassId, status: "ACTIVE" } } },
          },
          select: { studentId: true, publishedAt: true, rank: true, averageCenti: true },
        })
      : [];

  const generatedFor = new Map(existingReportCards.map((card) => [card.studentId, card]));
  const canGenerate = hasPermission(context, PERMISSIONS.REPORTCARD_GENERATE);
  const canPublish = hasPermission(context, PERMISSIONS.GRADE_PUBLISH);

  return (
    <>
      <PageHeader
        title="Bulletins"
        description="Moyennes ponderees, rangs et appreciations par periode. Les bulletins sont figes au moment de leur generation."
      />

      {/* Selection classe / periode */}
      <Card className="mb-5">
        <form method="get" action="/pedagogie/bulletins" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <label htmlFor="classe" className="field-label">
              Classe
            </label>
            <select id="classe" name="classe" defaultValue={selectedClassId ?? ""} className="input">
              {classRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} ({room._count.enrollments} eleves)
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-48">
            <label htmlFor="periode" className="field-label">
              Periode
            </label>
            <select id="periode" name="periode" defaultValue={selectedPeriodId ?? ""} className="input">
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                  {period.status === "LOCKED" ? " (publiee)" : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Afficher
          </button>
        </form>
      </Card>

      {!selectedClassId || !selectedPeriodId ? (
        <Card>
          <EmptyState
            title="Configuration incomplete"
            description="Creez au moins une classe et une periode d'evaluation pour generer des bulletins."
          />
        </Card>
      ) : (
        <>
          {selectedPeriod?.status === "LOCKED" && (
            <div className="mb-5">
              <Alert tone="info" title="Periode publiee">
                Les resultats de cette periode sont publies et consultables par les familles. La
                saisie de notes y est verrouillee ; toute correction passe par une revision tracee.
              </Alert>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
            <div className="xl:col-span-3">
              <Card
                title="Resultats de la classe"
                description={
                  results
                    ? `Moyenne de classe : ${formatScore(results.classAverageCenti, school.locale)}${settings.rankingEnabled ? "" : " — classement desactive pour cet etablissement"}`
                    : undefined
                }
                padded={false}
              >
                {!results || results.results.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<FileIcon className="size-8" />}
                      title="Aucun eleve"
                      description="Cette classe ne compte aucun eleve inscrit."
                    />
                  </div>
                ) : (
                  <DataTable
                    caption="Resultats par eleve"
                    columns={[
                      { key: "rank", label: "Rang", align: "right" },
                      { key: "student", label: "Eleve" },
                      { key: "average", label: "Moyenne", align: "right" },
                      { key: "subjects", label: "Matieres notees", align: "right" },
                      { key: "state", label: "Bulletin" },
                      { key: "actions", label: "", align: "right" },
                    ]}
                  >
                    {results.results
                      .slice()
                      .sort((a, b) => (b.averageCenti ?? -1) - (a.averageCenti ?? -1))
                      .map((result) => {
                        const rank = results.ranks.get(result.studentId);
                        const card = generatedFor.get(result.studentId);
                        const passed =
                          result.averageCenti !== null && result.averageCenti >= settings.passMarkCenti;

                        return (
                          <tr key={result.studentId}>
                            <td className="num text-slate-500">
                              {settings.rankingEnabled && rank ? rank : "—"}
                            </td>
                            <td>
                              <Link
                                href={`/eleves/${result.studentId}`}
                                className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                              >
                                {result.lastName} {result.firstName}
                              </Link>
                              <span className="block font-mono text-xs text-slate-400">
                                {result.matricule}
                              </span>
                            </td>
                            <td className="num">
                              <span className={passed ? "text-mint-700" : "text-rose-700"}>
                                {formatScore(result.averageCenti, school.locale)}
                              </span>
                            </td>
                            <td className="num text-slate-600">
                              {result.subjects.filter((subject) => subject.averageCenti !== null).length}{" "}
                              / {result.subjects.length}
                            </td>
                            <td>
                              {card ? (
                                <Badge tone="success">
                                  Genere le {formatDate(card.publishedAt, school.locale)}
                                </Badge>
                              ) : (
                                <Badge tone="neutral">Non genere</Badge>
                              )}
                            </td>
                            <td className="text-right">
                              {card && (
                                <Link
                                  href={`/api/documents/bulletin/${result.studentId}/${selectedPeriodId}`}
                                  target="_blank"
                                  className="btn-ghost btn-sm"
                                >
                                  PDF
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </DataTable>
                )}
              </Card>
            </div>

            <div className="space-y-5">
              {canGenerate && (
                <Card title="1. Generer les bulletins">
                  <p className="mb-3 text-xs leading-relaxed text-slate-600">
                    Calcule les moyennes ponderees, les rangs et la moyenne de classe, puis les
                    fige. Seules les evaluations <strong>validees ou publiees</strong> sont prises
                    en compte. Vous pouvez regenerer tant que la periode n&apos;est pas publiee.
                  </p>
                  <GenerateReportCardsForm
                    classRoomId={selectedClassId}
                    gradingPeriodId={selectedPeriodId}
                  />
                </Card>
              )}

              {canPublish && selectedPeriod && (
                <Card title="2. Publier les resultats">
                  {selectedPeriod.status === "LOCKED" ? (
                    <p className="text-sm text-slate-600">
                      Les resultats de cette periode sont deja publies.
                    </p>
                  ) : (
                    <>
                      <p className="mb-3 text-xs leading-relaxed text-slate-600">
                        Rend les notes visibles des familles, <strong>verrouille la periode</strong>{" "}
                        pour tout l&apos;etablissement et envoie une notification aux parents et aux
                        eleves. Cette action est irreversible.
                      </p>
                      <PublishResultsForm
                        gradingPeriodId={selectedPeriodId}
                        periodName={selectedPeriod.name}
                      />
                    </>
                  )}
                </Card>
              )}

              <Card title="Regles appliquees">
                <ul className="space-y-2 text-xs text-slate-600">
                  <li>
                    Moyenne par matiere : ponderee par le coefficient de chaque evaluation, ramenee
                    sur {settings.maxScore}.
                  </li>
                  <li>
                    Moyenne generale : ponderee par le coefficient de chaque matiere. Une matiere
                    sans note est ignoree, jamais comptee zero.
                  </li>
                  <li>
                    Absences :{" "}
                    {settings.absenceRule === "EXCLURE"
                      ? "exclues du calcul"
                      : "comptees zero si non excusees"}
                    .
                  </li>
                  <li>
                    Classement : {settings.rankingEnabled ? "active" : "desactive"}, ex aequo geres
                    (1, 2, 2, 4).
                  </li>
                  <li>Moyenne de passage : {formatScore(settings.passMarkCenti, school.locale)}.</li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
