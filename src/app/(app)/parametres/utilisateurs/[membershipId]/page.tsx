import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  effectivePermissions,
  grantablePermissionGroups,
} from "@/lib/permissions";
import { ROLE_LABELS, type RoleCode } from "@/lib/constants";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { MembershipPermissionsEditor } from "../permissions-editor";

export const metadata: Metadata = { title: "Permissions d'un utilisateur" };

/**
 * Permissions fines d'un rattachement.
 *
 * L'ecran montre les permissions REELLEMENT appliquees par le serveur :
 * matrice du role, plus les surcharges enregistrees. C'est la meme fonction
 * `effectivePermissions` qui sert ici et dans le controle d'acces, pour que
 * l'affichage ne puisse pas diverger de la realite.
 */
export default async function MembershipPermissionsPage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.MEMBERSHIP_MANAGE);
  const { membershipId } = await params;
  const { school } = context;

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      role: { select: { code: true, name: true } },
    },
  });

  // Rattachement d'un autre etablissement : 404, pas 403.
  if (!membership || membership.schoolId !== school.id) notFound();

  let overrides: { grant?: string[]; revoke?: string[] } | null = null;
  try {
    overrides = JSON.parse(membership.overrides || "{}") as typeof overrides;
  } catch {
    // Surcharge illisible : on l'ignore et on repart du role, plutot que de
    // faire echouer l'ecran qui sert justement a la corriger.
    overrides = null;
  }

  const roleOnly = [...effectivePermissions(membership.role.code, null)].sort();
  const effective = [...effectivePermissions(membership.role.code, overrides)].sort();

  const added = effective.filter((code) => !roleOnly.includes(code));
  const removed = roleOnly.filter((code) => !effective.includes(code));

  const isSelf = membership.user.id === context.user.id;
  const userName = `${membership.user.lastName} ${membership.user.firstName}`;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Parametres", href: "/parametres" },
          { label: "Utilisateurs et roles", href: "/parametres/utilisateurs" },
          { label: userName },
        ]}
        title={`Permissions de ${userName}`}
        description={membership.user.email}
        actions={
          <Link href="/parametres/utilisateurs" className="btn-secondary btn-sm">
            Retour a la liste
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Badge tone="info">
          Role : {ROLE_LABELS[membership.role.code as RoleCode] ?? membership.role.name}
        </Badge>
        <Badge tone={membership.status === "ACTIVE" ? "success" : "danger"}>
          {membership.status === "ACTIVE" ? "Acces actif" : "Acces suspendu"}
        </Badge>
        {added.length > 0 && <Badge tone="warning">{added.length} permission(s) ajoutee(s)</Badge>}
        {removed.length > 0 && (
          <Badge tone="warning">{removed.length} permission(s) retiree(s)</Badge>
        )}
      </div>

      {(added.length > 0 || removed.length > 0) && (
        <div className="mb-5">
          <Alert tone="warning" title="Ce rattachement s'ecarte de son role">
            <ul className="mt-1 space-y-0.5 text-sm">
              {added.map((code) => (
                <li key={code}>
                  <span className="font-semibold">+</span> {PERMISSION_LABELS[code] ?? code}
                </li>
              ))}
              {removed.map((code) => (
                <li key={code}>
                  <span className="font-semibold">−</span> {PERMISSION_LABELS[code] ?? code}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}

      <div className="mb-5">
        <Alert tone="info">
          Ces cases decrivent ce que le serveur autorise, pas ce que l&apos;interface affiche.
          Retirer une permission ferme reellement l&apos;action correspondante, y compris en
          appelant l&apos;application directement.
        </Alert>
      </div>

      <Card title="Permissions effectives" description="Cochez ce que cet utilisateur doit pouvoir faire.">
        <MembershipPermissionsEditor
          membershipId={membership.id}
          userName={userName}
          roleName={ROLE_LABELS[membership.role.code as RoleCode] ?? membership.role.name}
          groups={grantablePermissionGroups()}
          rolePermissions={roleOnly}
          effectivePermissions={effective}
          readOnly={isSelf}
          readOnlyReason="Vous ne pouvez pas modifier vos propres permissions. Demandez a un autre administrateur de le faire."
        />
      </Card>
    </>
  );
}
