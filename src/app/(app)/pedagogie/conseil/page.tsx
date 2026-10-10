import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatScore, parseGradingSettings } from "@/lib/domain/grades";
import {
  getCurrentAcademicYear,
  listClassRooms,
  listGradingPeriods,
} from "@/lib/domain/school-context";
import { Alert, Card, EmptyState, PageHeader, StatCard, ClipboardIcon, DownloadIcon } from "@/components/ui";
import { ClassDecisionsForm } from "./decisions-form";

export const metadata: Metadata = { title: "Conseil de classe" };

/**
 * Conseil de classe : appreciations, decisions de passage et proces-verbal.
 *
 * Les moyennes affichees proviennent des bulletins DEJA GENERES : le conseil
 * delibere sur des valeurs figees, pas sur un calcul qui bougerait pendant la
 * seance.
 */
export default async function ClassCouncilPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; periode?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.REPORTCARD_GENERATE);
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
  // Par defaut, la derniere periode : c'est celle du conseil de fin d'annee.
  const selectedPeriodId = params.periode ?? periods[periods.length - 1]?.id;

  const enrollments =
    selectedClassId && academicYear
      ? await prisma.enrollment.findMany({
          where: { classRoomId: selectedClassId, academicYearId: academicYear.id, status: "ACTIVE" },
          orderBy: { student: { lastName: "asc" } },
          include: {
            student: {
              select: {
                id: true,
                matricule: true,
                firstName: true,
                lastName: true,
                reportCards: selectedPeriodId
                  ? {
                      where: { gradingPeriodId: selectedPeriodId },
                      select: {
                        id: true,
                        averageCenti: true,
                        rank: true,
                        classSize: true,
                        appreciation: true,
                        decision: true,
                      },
                    }
                  : false,
              },
            },
          },
        })
      : [];

  const canDecide = hasPermission(context, PERMISSIONS.ENROLLMENT_MANAGE);
  const bulletinsGeneres = enrollments.filter((e) => (e.student.reportCards ?? []).length > 0).length;
  const decisionsPrises = enrollments.filter((e) => e.decision !== "EN_ATTENTE").length;

  const moyennes = enrollments
    .map((e) => (e.student.reportCards ?? [])[0]?.averageCenti)
    .filter((v): v is number => typeof v === "number");
  const admissibles = moyennes.filter((m) => m >= settings.passMarkCenti).length;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Pedagogie", href: "/pedagogie/bulletins" }, { label: "Conseil de classe" }]}
        title="Conseil de classe"
        description="Appreciations, decisions de passage et proces-verbal de deliberation."
        actions={
          selectedClassId &&
          selectedPeriodId && (
            <Link
              href={`/api/documents/proces-verbal/${selectedClassId}/${selectedPeriodId}`}
              target="_blank"
              className="btn-secondary"
            >
              <DownloadIcon className="size-4" />
              Proces-verbal PDF
            </Link>
          )
        }
      />

      <Card className="mb-5">
        <form method="get" action="/pedagogie/conseil" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
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
          <div className="min-w-48">
            <label htmlFor="periode" className="field-label">
              Periode
            </label>
            <select id="periode" name="periode" defaultValue={selectedPeriodId ?? ""} className="input">
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
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
            description="Creez au moins une classe et une periode d'evaluation."
          />
        </Card>
      ) : enrollments.length === 0 ? (
        <Card>
          <EmptyState title="Aucun eleve inscrit" description="Cette classe ne compte aucun eleve." />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <StatCard tone="sky" label="Eleves" value={String(enrollments.length)} />
            <StatCard
              tone={bulletinsGeneres === enrollments.length ? "mint" : "rose"}
              label="Bulletins generes"
              value={`${bulletinsGeneres} / ${enrollments.length}`}
              hint={
                bulletinsGeneres < enrollments.length
                  ? "Generez les bulletins avant de deliberer."
                  : "Tous les bulletins sont disponibles."
              }
              icon={<ClipboardIcon className="size-[18px]" />}
            />
            <StatCard
              tone="iris"
              label={`Moyenne >= ${formatScore(settings.passMarkCenti, school.locale)}`}
              value={`${admissibles} / ${moyennes.length}`}
            />
            <StatCard
              tone="slate"
              label="Decisions prises"
              value={`${decisionsPrises} / ${enrollments.length}`}
            />
          </div>

          {bulletinsGeneres < enrollments.length && (
            <div className="mb-5">
              <Alert tone="warning" title="Bulletins incomplets">
                {enrollments.length - bulletinsGeneres} eleve(s) n&apos;ont pas de bulletin pour
                cette periode. Le conseil delibere sur des moyennes figees :{" "}
                <Link href="/pedagogie/bulletins" className="font-semibold underline">
                  generez-les d&apos;abord
                </Link>
                .
              </Alert>
            </div>
          )}

          <Card
            title="Deliberation"
            description="La decision porte sur l'annee entiere ; l'appreciation figure sur le bulletin de la periode."
            padded={false}
          >
            {!canDecide ? (
              <div className="p-5 text-sm text-slate-600">
                Vous pouvez consulter les resultats, mais l&apos;enregistrement des decisions est
                reserve aux profils habilites a gerer les inscriptions.
              </div>
            ) : (
              <ClassDecisionsForm
                classRoomId={selectedClassId}
                academicYearId={academicYear!.id}
                passMarkCenti={settings.passMarkCenti}
                locale={school.locale}
                students={enrollments.map((enrollment) => {
                  const card = (enrollment.student.reportCards ?? [])[0];
                  return {
                    id: enrollment.student.id,
                    matricule: enrollment.student.matricule,
                    name: `${enrollment.student.lastName} ${enrollment.student.firstName}`,
                    averageCenti: card?.averageCenti ?? null,
                    rank: card?.rank ?? null,
                    classSize: card?.classSize ?? null,
                    reportCardId: card?.id ?? null,
                    appreciation: card?.appreciation ?? "",
                    decision: enrollment.decision,
                    decisionNote: enrollment.decisionNote,
                  };
                })}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
