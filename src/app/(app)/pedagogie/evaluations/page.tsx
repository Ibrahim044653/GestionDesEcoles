import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, EVALUATION_KIND_LABELS, EVALUATION_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  getCurrentAcademicYear,
  listClassRooms,
  listGradingPeriods,
  listSubjects,
} from "@/lib/domain/school-context";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  ClipboardIcon,
} from "@/components/ui";
import { EvaluationForm, EvaluationStatusButtons } from "./evaluation-forms";

export const metadata: Metadata = { title: "Evaluations" };

/**
 * Evaluations et saisie des notes.
 *
 * Un enseignant ne voit que les evaluations de ses propres couples
 * classe/matiere : la restriction est appliquee par la requete, pas seulement
 * par l'affichage.
 */
export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; periode?: string; statut?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.EVALUATION_VIEW);
  const params = await searchParams;
  const { school } = context;

  const academicYear = await getCurrentAcademicYear(school.id);

  const isTeacher = context.membership?.roleCode === ROLES.TEACHER;
  const scope = isTeacher ? await teacherScope(context) : null;

  const [classRooms, subjects, periods] = await Promise.all([
    listClassRooms(school.id, academicYear?.id),
    listSubjects(school.id),
    listGradingPeriods(school.id, academicYear?.id),
  ]);

  const visibleClassRooms = scope
    ? classRooms.filter((room) => scope.classRoomIds.includes(room.id))
    : classRooms;

  const evaluations = await prisma.evaluation.findMany({
    where: {
      schoolId: school.id,
      ...(academicYear ? { academicYearId: academicYear.id } : {}),
      ...(params.classe ? { classRoomId: params.classe } : {}),
      ...(params.periode ? { gradingPeriodId: params.periode } : {}),
      ...(params.statut && params.statut !== "TOUS" ? { status: params.statut } : {}),
      // Portee enseignant : uniquement ses couples classe/matiere.
      ...(scope
        ? {
            OR: scope.classSubjectPairs.map((pair) => ({
              classRoomId: pair.classRoomId,
              subjectId: pair.subjectId,
            })),
          }
        : {}),
    },
    orderBy: [{ date: "desc" }],
    take: 100,
    include: {
      classRoom: { select: { id: true, name: true } },
      subject: { select: { name: true } },
      gradingPeriod: { select: { name: true, status: true } },
      teacher: { select: { firstName: true, lastName: true } },
      _count: { select: { grades: true } },
    },
  });

  const canManage = hasPermission(context, PERMISSIONS.EVALUATION_MANAGE);
  const canValidate = hasPermission(context, PERMISSIONS.GRADE_VALIDATE);
  const openPeriods = periods.filter((period) => period.status === "OPEN");

  return (
    <>
      <PageHeader
        title="Evaluations et notes"
        description={
          isTeacher
            ? "Vous voyez les evaluations des classes et matieres qui vous sont affectees."
            : "Devoirs, interrogations et compositions de l'annee en cours."
        }
      />

      {scope && scope.classSubjectPairs.length === 0 && (
        <div className="mb-5">
          <Alert tone="warning" title="Aucune affectation">
            Aucune classe ni matiere ne vous est affectee pour le moment. Contactez le responsable
            pedagogique.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {/* Filtres */}
          <Card className="mb-4">
            <form
              method="get"
              action="/pedagogie/evaluations"
              className="grid grid-cols-1 gap-3 sm:grid-cols-4"
            >
              <div>
                <label htmlFor="classe" className="field-label">
                  Classe
                </label>
                <select id="classe" name="classe" defaultValue={params.classe ?? ""} className="input">
                  <option value="">Toutes</option>
                  {visibleClassRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="periode" className="field-label">
                  Periode
                </label>
                <select id="periode" name="periode" defaultValue={params.periode ?? ""} className="input">
                  <option value="">Toutes</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="statut" className="field-label">
                  Etat
                </label>
                <select id="statut" name="statut" defaultValue={params.statut ?? ""} className="input">
                  <option value="TOUS">Tous</option>
                  <option value="DRAFT">Brouillon</option>
                  <option value="SUBMITTED">A valider</option>
                  <option value="VALIDATED">Validee</option>
                  <option value="PUBLISHED">Publiee</option>
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full">
                  Filtrer
                </button>
              </div>
            </form>
          </Card>

          <Card title={`${evaluations.length} evaluation(s)`} padded={false}>
            {evaluations.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<ClipboardIcon className="size-8" />}
                  title="Aucune evaluation"
                  description="Creez une evaluation pour commencer a saisir des notes."
                />
              </div>
            ) : (
              <DataTable
                caption="Liste des evaluations"
                columns={[
                  { key: "title", label: "Evaluation" },
                  { key: "class", label: "Classe / matiere" },
                  { key: "date", label: "Date" },
                  { key: "grades", label: "Notes", align: "right" },
                  { key: "status", label: "Etat" },
                  { key: "actions", label: "", align: "right" },
                ]}
              >
                {evaluations.map((evaluation) => (
                  <tr key={evaluation.id}>
                    <td>
                      <Link
                        href={`/pedagogie/evaluations/${evaluation.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {evaluation.title}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {EVALUATION_KIND_LABELS[evaluation.kind] ?? evaluation.kind} — sur{" "}
                        {evaluation.maxScore}, coef. {evaluation.coefficient}
                        {evaluation.examSession === "RATTRAPAGE" && " — rattrapage"}
                      </span>
                    </td>
                    <td className="text-sm">
                      {evaluation.classRoom.name}
                      <span className="block text-xs text-slate-500">{evaluation.subject.name}</span>
                    </td>
                    <td className="whitespace-nowrap text-sm text-slate-600">
                      {formatDate(evaluation.date, school.locale)}
                      <span className="block text-xs text-slate-400">
                        {evaluation.gradingPeriod.name}
                      </span>
                    </td>
                    <td className="num">{evaluation._count.grades}</td>
                    <td>
                      <Badge
                        tone={
                          evaluation.status === "PUBLISHED"
                            ? "success"
                            : evaluation.status === "VALIDATED"
                              ? "info"
                              : evaluation.status === "SUBMITTED"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {EVALUATION_STATUS_LABELS[evaluation.status] ?? evaluation.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`/pedagogie/evaluations/${evaluation.id}`} className="btn-ghost btn-sm">
                        Notes
                      </Link>
                      <EvaluationStatusButtons
                        evaluationId={evaluation.id}
                        status={evaluation.status}
                        canManage={canManage}
                        canValidate={canValidate}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        {canManage && (
          <Card title="Nouvelle evaluation">
            {openPeriods.length === 0 ? (
              <EmptyState
                title="Aucune periode ouverte"
                description="Toutes les periodes d'evaluation sont verrouillees ou absentes."
              />
            ) : visibleClassRooms.length === 0 ? (
              <EmptyState title="Aucune classe accessible" description="Aucune classe ne vous est affectee." />
            ) : (
              <EvaluationForm
                classRooms={visibleClassRooms.map((room) => ({ id: room.id, name: room.name }))}
                subjects={subjects.map((subject) => ({
                  id: subject.id,
                  name: subject.name,
                  defaultCoefficient: subject.defaultCoefficient,
                }))}
                periods={openPeriods.map((period) => ({ id: period.id, name: period.name }))}
                isUniversity={["UNIVERSITE", "FORMATION_PRO"].includes(school.type)}
              />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
