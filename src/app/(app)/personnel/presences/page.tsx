import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { JOB_TITLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { LeaveReviewActions, StaffAttendanceForm, StaffLeaveForm } from "./attendance-forms";

export const metadata: Metadata = { title: "Presences du personnel" };

const LEAVE_KIND_LABELS: Record<string, string> = {
  CONGE: "Conge",
  MALADIE: "Maladie",
  MATERNITE: "Maternite",
  AUTRE: "Autre",
};

/**
 * Feuille de presence du personnel et gestion des conges.
 *
 * L'ecran enregistre des FAITS (present, retard, absent, conge). Il ne calcule
 * aucune retenue ni aucun solde de conges : ces regles dependent du droit du
 * travail local et doivent etre parametrees hors de l'application.
 */
export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.STAFF_VIEW);
  const params = await searchParams;
  const { school } = context;

  const canRecord = hasPermission(context, PERMISSIONS.STAFF_UPDATE);

  const today = new Date().toISOString().slice(0, 10);
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;
  const dateUtc = new Date(`${selectedDate}T00:00:00.000Z`);

  const [staff, attendances, leaves] = await Promise.all([
    prisma.staff.findMany({
      where: { schoolId: school.id, status: "ACTIVE" },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
    }),
    prisma.staffAttendance.findMany({
      where: { date: dateUtc, staff: { schoolId: school.id } },
      select: { staffId: true, status: true, minutesLate: true, note: true },
    }),
    prisma.staffLeave.findMany({
      where: { staff: { schoolId: school.id } },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 60,
      include: { staff: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const attendanceByStaff = new Map(attendances.map((item) => [item.staffId, item]));

  // Conges approuves couvrant la date affichee : signales a l'agent qui
  // pointe, pour qu'il ne marque pas une absence injustifiee par erreur.
  const onLeaveToday = new Set(
    leaves
      .filter(
        (leave) =>
          leave.status === "APPROVED" && leave.startDate <= dateUtc && leave.endDate >= dateUtc,
      )
      .map((leave) => leave.staffId),
  );

  const pendingLeaves = leaves.filter((leave) => leave.status === "PENDING");
  const present = attendances.filter((item) => item.status === "PRESENT").length;
  const late = attendances.filter((item) => item.status === "RETARD").length;
  const absent = attendances.filter((item) => item.status === "ABSENT").length;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Personnel", href: "/personnel" }, { label: "Presences" }]}
        title="Presences et conges du personnel"
        description="Feuille de presence quotidienne, retards et demandes de conge."
        actions={
          canRecord && staff.length > 0 ? (
            <StaffLeaveForm
              staff={staff.map((member) => ({
                id: member.id,
                name: `${member.lastName} ${member.firstName}`,
              }))}
            />
          ) : undefined
        }
      />

      <div className="mb-5">
        <Alert tone="info" title="Ce que cet ecran ne fait pas">
          Aucune retenue sur salaire, aucun solde de conges n&apos;est calcule ici. Les regles
          varient selon le droit du travail applicable : l&apos;application enregistre les faits,
          elle n&apos;en tire aucune consequence salariale automatique.
        </Alert>
      </div>

      <Card className="mb-5">
        <form method="get" action="/personnel/presences" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="date" className="field-label">
              Journee
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={selectedDate}
              max={today}
              className="input"
            />
          </div>
          <button type="submit" className="btn-primary">
            Afficher
          </button>
        </form>
      </Card>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard tone="sky" label="Effectif actif" value={String(staff.length)} />
        <StatCard tone="mint" label="Presents" value={String(present)} />
        <StatCard tone="rose" label="Retards" value={String(late)} />
        <StatCard tone="slate" label="Absents" value={String(absent)} />
      </div>

      <Card
        title={`Feuille du ${formatDate(dateUtc, school.locale)}`}
        description="Un statut non enregistre vaut « present » par defaut tant que la feuille n'est pas validee."
        padded={false}
        className="mb-5"
      >
        {staff.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Aucun personnel actif"
              description="Enregistrez d'abord des membres du personnel."
            />
          </div>
        ) : !canRecord ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Membre du personnel</th>
                  <th>Statut</th>
                  <th className="text-right">Retard</th>
                  <th>Observation</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const record = attendanceByStaff.get(member.id);
                  return (
                    <tr key={member.id}>
                      <td className="text-sm text-slate-900">
                        {member.lastName} {member.firstName}
                      </td>
                      <td className="text-sm text-slate-600">{record?.status ?? "Non saisi"}</td>
                      <td className="num text-slate-600">
                        {record?.minutesLate ? `${record.minutesLate} min` : "—"}
                      </td>
                      <td className="text-sm text-slate-500">{record?.note ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <StaffAttendanceForm
            date={selectedDate}
            staff={staff.map((member) => {
              const record = attendanceByStaff.get(member.id);
              return {
                id: member.id,
                name: `${member.lastName} ${member.firstName}`,
                jobTitle: JOB_TITLE_LABELS[member.jobTitle] ?? member.jobTitle,
                status: record?.status ?? (onLeaveToday.has(member.id) ? "CONGE" : "PRESENT"),
                minutesLate: record?.minutesLate ?? 0,
                note: record?.note ?? "",
                onApprovedLeave: onLeaveToday.has(member.id),
              };
            })}
          />
        )}
      </Card>

      <Card
        title="Conges"
        description={
          pendingLeaves.length > 0
            ? `${pendingLeaves.length} demande(s) en attente d'approbation.`
            : "Aucune demande en attente."
        }
        padded={false}
      >
        {leaves.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Aucun conge" description="Aucun conge n'a ete enregistre." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Membre du personnel</th>
                  <th>Type</th>
                  <th>Periode</th>
                  <th>Statut</th>
                  <th>Motif</th>
                  {canRecord && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td className="text-sm text-slate-900">
                      {leave.staff.lastName} {leave.staff.firstName}
                    </td>
                    <td className="text-sm text-slate-600">
                      {LEAVE_KIND_LABELS[leave.kind] ?? leave.kind}
                    </td>
                    <td className="text-sm text-slate-600">
                      {formatDate(leave.startDate, school.locale)} —{" "}
                      {formatDate(leave.endDate, school.locale)}
                    </td>
                    <td>
                      <Badge
                        tone={
                          leave.status === "APPROVED"
                            ? "success"
                            : leave.status === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {leave.status === "APPROVED"
                          ? "Approuve"
                          : leave.status === "REJECTED"
                            ? "Refuse"
                            : "En attente"}
                      </Badge>
                    </td>
                    <td className="max-w-xs text-xs text-slate-500">{leave.reason}</td>
                    {canRecord && (
                      <td>
                        {leave.status === "PENDING" ? (
                          <LeaveReviewActions leaveId={leave.id} />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
