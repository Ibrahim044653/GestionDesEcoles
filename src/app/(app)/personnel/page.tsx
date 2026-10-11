import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { JOB_TITLE_LABELS, ROLE_LABELS, type RoleCode } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getCurrentAcademicYear, listClassRooms, listSubjects } from "@/lib/domain/school-context";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  BuildingIcon,
  DownloadIcon,
  UsersIcon,
} from "@/components/ui";
import { StaffForm, StaffAccessButton, TeachingAssignmentForm } from "./staff-forms";
import { textContains } from "@/lib/search";

export const metadata: Metadata = { title: "Personnel" };

const JOB_LABELS = JOB_TITLE_LABELS;

/** Gestion du personnel : profils, contrats, affectations et acces. */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ fonction?: string; q?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.STAFF_VIEW);
  const params = await searchParams;
  const { school } = context;

  const query = (params.q ?? "").trim();
  const academicYear = await getCurrentAcademicYear(school.id);

  const [staff, counts, classRooms, subjects] = await Promise.all([
    prisma.staff.findMany({
      where: {
        schoolId: school.id,
        ...(params.fonction ? { jobTitle: params.fonction } : {}),
        ...(query
          ? {
              OR: [
                { lastName: textContains(query) },
                { firstName: textContains(query) },
                { staffNumber: textContains(query) },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            lastLoginAt: true,
            memberships: {
              where: { schoolId: school.id },
              select: { status: true, role: { select: { code: true, name: true } } },
            },
          },
        },
        classSubjects: {
          include: {
            subject: { select: { name: true } },
            classRoom: { select: { name: true } },
          },
        },
        _count: { select: { mainOfClasses: true } },
      },
    }),
    prisma.staff.groupBy({
      by: ["jobTitle"],
      where: { schoolId: school.id, status: "ACTIVE" },
      _count: { _all: true },
    }),
    listClassRooms(school.id, academicYear?.id),
    listSubjects(school.id),
  ]);

  const canCreate = hasPermission(context, PERMISSIONS.STAFF_CREATE);
  const canManageAccess = hasPermission(context, PERMISSIONS.USER_DISABLE);
  const canAssign = hasPermission(context, PERMISSIONS.SUBJECT_MANAGE);
  const canExportPayroll = hasPermission(context, PERMISSIONS.STAFF_EXPORT_PAYROLL);
  const countFor = (job: string) => counts.find((row) => row.jobTitle === job)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Personnel"
        description="Profils, contrats, affectations pedagogiques et acces a l'application."
        actions={
          canExportPayroll && (
            <Link href="/api/export/personnel" className="btn-secondary">
              <DownloadIcon className="size-4" />
              Export paie
            </Link>
          )
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          tone="sky"
          label="Enseignants"
          value={String(countFor("ENSEIGNANT"))}
          icon={<UsersIcon className="size-[18px]" />}
        />
        <StatCard tone="iris" label="Direction" value={String(countFor("DIRECTION"))} />
        <StatCard
          tone="mint"
          label="Administratif et finance"
          value={String(countFor("ADMINISTRATIF") + countFor("COMPTABLE") + countFor("CAISSIER"))}
        />
        <StatCard
          tone="slate"
          label="Total actif"
          value={String(counts.reduce((total, row) => total + row._count._all, 0))}
          icon={<BuildingIcon className="size-[18px]" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="mb-4">
            <form method="get" action="/personnel" className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <label htmlFor="q" className="field-label">
                  Rechercher
                </label>
                <input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={query}
                  placeholder="Nom, prenom ou numero"
                  className="input"
                />
              </div>
              <div className="min-w-44">
                <label htmlFor="fonction" className="field-label">
                  Fonction
                </label>
                <select id="fonction" name="fonction" defaultValue={params.fonction ?? ""} className="input">
                  <option value="">Toutes</option>
                  {Object.entries(JOB_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary">
                Filtrer
              </button>
            </form>
          </Card>

          <Card title={`${staff.length} membre(s) du personnel`} padded={false}>
            {staff.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<UsersIcon className="size-8" />}
                  title="Aucun membre du personnel"
                  description="Enregistrez les enseignants et le personnel administratif de l'etablissement."
                />
              </div>
            ) : (
              <DataTable
                caption="Liste du personnel"
                columns={[
                  { key: "name", label: "Personne" },
                  { key: "job", label: "Fonction" },
                  { key: "contract", label: "Contrat" },
                  { key: "assignments", label: "Affectations" },
                  { key: "access", label: "Acces" },
                  { key: "actions", label: "", align: "right" },
                ]}
              >
                {staff.map((member) => {
                  const membership = member.user?.memberships[0];
                  const suspended = membership?.status === "SUSPENDED";

                  return (
                    <tr key={member.id}>
                      <td>
                        <span className="block font-medium text-slate-900">
                          {member.lastName} {member.firstName}
                        </span>
                        <span className="block font-mono text-xs text-slate-400">
                          {member.staffNumber}
                        </span>
                        {member.email && (
                          <span className="block truncate text-xs text-slate-500">{member.email}</span>
                        )}
                      </td>
                      <td className="text-sm">
                        {JOB_LABELS[member.jobTitle] ?? member.jobTitle}
                        {member.qualification && (
                          <span className="block text-xs text-slate-400">{member.qualification}</span>
                        )}
                      </td>
                      <td className="text-xs text-slate-600">
                        {member.contractType}
                        {member.contractStart && (
                          <span className="block text-slate-400">
                            depuis le {formatDate(member.contractStart, school.locale)}
                          </span>
                        )}
                        {canExportPayroll && member.baseSalaryMinor > 0 && (
                          <span className="block text-slate-500">
                            {formatMoney(member.baseSalaryMinor, school.currency, school.locale)}
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-slate-600">
                        {member.classSubjects.length === 0 ? (
                          <span className="text-slate-400">Aucune</span>
                        ) : (
                          <details>
                            <summary className="cursor-pointer text-brand-700 hover:underline">
                              {member.classSubjects.length} affectation(s)
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {member.classSubjects.map((assignment) => (
                                <li key={assignment.id}>
                                  {assignment.classRoom.name} — {assignment.subject.name}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {member._count.mainOfClasses > 0 && (
                          <span className="mt-0.5 block text-slate-500">
                            Professeur principal ({member._count.mainOfClasses})
                          </span>
                        )}
                      </td>
                      <td>
                        {!member.user ? (
                          <Badge tone="neutral">Pas de compte</Badge>
                        ) : suspended ? (
                          <Badge tone="danger">Suspendu</Badge>
                        ) : (
                          <>
                            <Badge tone="success">
                              {membership
                                ? (ROLE_LABELS[membership.role.code as RoleCode] ?? membership.role.name)
                                : "Actif"}
                            </Badge>
                            {member.user.lastLoginAt && (
                              <span className="mt-0.5 block text-xs text-slate-400">
                                vu le {formatDate(member.user.lastLoginAt, school.locale)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="text-right">
                        {canManageAccess && member.user && (
                          <StaffAccessButton staffId={member.id} enabled={!suspended} />
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
          {canCreate && (
            <Card title="Ajouter un membre du personnel">
              <StaffForm />
            </Card>
          )}

          {canAssign && (
            <Card
              title="Affecter un enseignant"
              description="Rattache un enseignant a une matiere dans une classe."
            >
              {staff.filter((member) => member.jobTitle === "ENSEIGNANT").length === 0 ? (
                <EmptyState title="Aucun enseignant" description="Enregistrez d'abord un enseignant." />
              ) : (
                <TeachingAssignmentForm
                  teachers={staff
                    .filter((member) => member.jobTitle === "ENSEIGNANT")
                    .map((member) => ({
                      id: member.id,
                      label: `${member.lastName} ${member.firstName}`,
                    }))}
                  classRooms={classRooms.map((room) => ({ id: room.id, name: room.name }))}
                  subjects={subjects.map((subject) => ({
                    id: subject.id,
                    name: subject.name,
                    defaultCoefficient: subject.defaultCoefficient,
                  }))}
                />
              )}
            </Card>
          )}

          <Card title="Remuneration et paie">
            <p className="text-xs leading-relaxed text-slate-600">
              Les elements de remuneration enregistres ici sont <strong>indicatifs</strong>. Cette
              application ne calcule pas de bulletin de paie conforme a la legislation ivoirienne :
              cotisations, abattements et retenues dependent d&apos;un parametrage specifique.
              Utilisez l&apos;export pour alimenter votre logiciel de paie.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
