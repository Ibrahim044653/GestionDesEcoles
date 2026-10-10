import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { ROLES, ROLE_LABELS, type RoleCode } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Card, DataTable, EmptyState, PageHeader, ShieldIcon } from "@/components/ui";
import { MembershipForm, ResetPasswordButton, ToggleMembershipButton } from "./user-forms";

export const metadata: Metadata = { title: "Utilisateurs et roles" };

/**
 * Utilisateurs rattaches a l'etablissement et matrice des permissions.
 *
 * La matrice est affichee telle qu'elle est reellement appliquee par le
 * serveur : c'est la meme source que le garde-fou des Server Actions.
 */
export default async function UsersPage() {
  const context = await requirePagePermission(PERMISSIONS.MEMBERSHIP_MANAGE);
  const { school } = context;

  const [memberships, roles] = await Promise.all([
    prisma.membership.findMany({
      where: { schoolId: school.id },
      orderBy: [{ role: { rank: "asc" } }, { user: { lastName: "asc" } }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            lastLoginAt: true,
            mustChangePassword: true,
            failedAttempts: true,
            lockedUntil: true,
            _count: { select: { memberships: true } },
          },
        },
        role: { select: { code: true, name: true } },
      },
    }),
    prisma.role.findMany({
      where: { code: { not: ROLES.SUPER_ADMIN } },
      orderBy: { rank: "asc" },
      select: { id: true, code: true, name: true, description: true },
    }),
  ]);

  // Regroupement des permissions par ressource, pour une lecture synthetique.
  const resources = Array.from(
    new Set(
      Object.values(ROLE_PERMISSIONS)
        .flat()
        .map((permission) => permission.split(".")[0]),
    ),
  ).sort();

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Parametres", href: "/parametres" }, { label: "Utilisateurs" }]}
        title="Utilisateurs et roles"
        description={`${memberships.length} compte(s) rattache(s) a ${school.name}.`}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Comptes rattaches" padded={false}>
            {memberships.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ShieldIcon className="size-8" />}
                  title="Aucun utilisateur"
                  description="Rattachez des comptes a cet etablissement."
                />
              </div>
            ) : (
              <DataTable
                caption="Utilisateurs de l'etablissement"
                columns={[
                  { key: "user", label: "Utilisateur" },
                  { key: "role", label: "Role" },
                  { key: "state", label: "Etat" },
                  { key: "last", label: "Derniere connexion" },
                  { key: "actions", label: "", align: "right" },
                ]}
              >
                {memberships.map((membership) => {
                  const locked =
                    membership.user.lockedUntil && membership.user.lockedUntil > new Date();
                  const isSelf = membership.user.id === context.user.id;

                  return (
                    <tr key={membership.id}>
                      <td>
                        <span className="block font-medium text-slate-900">
                          {membership.user.lastName} {membership.user.firstName}
                          {isSelf && <span className="ml-1 text-xs text-slate-400">(vous)</span>}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {membership.user.email}
                        </span>
                        {membership.user._count.memberships > 1 && (
                          <span className="text-xs text-slate-400">
                            Present dans {membership.user._count.memberships} etablissements
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge tone="info">
                          {ROLE_LABELS[membership.role.code as RoleCode] ?? membership.role.name}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {membership.status === "SUSPENDED" ? (
                            <Badge tone="danger">Suspendu</Badge>
                          ) : membership.user.status !== "ACTIVE" ? (
                            <Badge tone="danger">Compte desactive</Badge>
                          ) : (
                            <Badge tone="success">Actif</Badge>
                          )}
                          {locked && <Badge tone="warning">Bloque temporairement</Badge>}
                          {membership.user.mustChangePassword && (
                            <Badge tone="warning">Mot de passe a changer</Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-xs text-slate-600">
                        {membership.user.lastLoginAt
                          ? formatDateTime(membership.user.lastLoginAt, school.locale)
                          : "Jamais connecte"}
                        {membership.user.failedAttempts > 0 && (
                          <span className="block text-amber-700">
                            {membership.user.failedAttempts} echec(s) recent(s)
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {!isSelf && (
                          <>
                            <ResetPasswordButton userId={membership.user.id} />
                            <ToggleMembershipButton
                              membershipId={membership.id}
                              suspended={membership.status === "SUSPENDED"}
                            />
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </Card>

          {/* --------------------------- Matrice des roles --------------------------- */}
          <Card
            title="Matrice des permissions"
            description="Droits reellement appliques par le serveur pour chaque role."
            padded={false}
          >
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ressource</th>
                    {roles.map((role) => (
                      <th key={role.id} className="text-center">
                        <span className="block text-[10px] leading-tight">
                          {(ROLE_LABELS[role.code as RoleCode] ?? role.name).split(" ")[0]}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => (
                    <tr key={resource}>
                      <td className="font-mono text-xs font-medium">{resource}</td>
                      {roles.map((role) => {
                        const permissions = ROLE_PERMISSIONS[role.code as RoleCode] ?? [];
                        const count = permissions.filter((p) => p.startsWith(`${resource}.`)).length;
                        return (
                          <td key={role.id} className="text-center">
                            {count > 0 ? (
                              <span
                                className="inline-flex size-5 items-center justify-center rounded bg-brand-50 text-[10px] font-semibold text-brand-700"
                                title={permissions
                                  .filter((p) => p.startsWith(`${resource}.`))
                                  .join(", ")}
                              >
                                {count}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Le nombre indique les actions autorisees sur la ressource. Survolez une case pour voir
              le detail.
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Rattacher un utilisateur"
            description="Associe un compte existant a cet etablissement avec un role."
          >
            <MembershipForm
              roles={roles.map((role) => ({
                code: role.code,
                label: ROLE_LABELS[role.code as RoleCode] ?? role.name,
              }))}
            />
          </Card>

          <Alert tone="info" title="Separation des responsabilites">
            Le <strong>caissier</strong> encaisse et edite les recus mais ne valide pas les
            justificatifs et n&apos;accede pas a la comptabilite. Le <strong>comptable</strong>{" "}
            arbitre les justificatifs et tient les comptes. Cette separation limite le risque de
            fraude interne : evitez de cumuler ces roles sur un meme compte.
          </Alert>

          <Alert tone="warning" title="Super-administrateur SaaS">
            Le super-administrateur gere les abonnements et les etablissements clients. Il
            n&apos;accede PAS aux donnees pedagogiques ou financieres d&apos;une ecole sans y
            disposer d&apos;un rattachement explicite.
          </Alert>
        </div>
      </div>
    </>
  );
}
