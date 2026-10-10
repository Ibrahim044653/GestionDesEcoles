import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { ROLE_LABELS, type RoleCode } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/format";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { Alert, Badge, Card, DataTable, EmptyState, Field, FieldGrid, PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mon compte" };

/** Profil, securite et sessions actives de l'utilisateur connecte. */
export default async function AccountPage() {
  const context = await requireAuth();

  const [user, sessions, recentActivity] = await Promise.all([
    prisma.user.findUnique({
      where: { id: context.user.id },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
        mustChangePassword: true,
        isSuperAdmin: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: {
            school: { select: { name: true, code: true } },
            role: { select: { code: true, name: true } },
          },
        },
      },
    }),
    prisma.session.findMany({
      where: { userId: context.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
    }),
    prisma.auditEvent.findMany({
      where: { userId: context.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, createdAt: true, ipAddress: true },
    }),
  ]);

  if (!user) return null;

  return (
    <>
      <PageHeader
        title="Mon compte"
        description="Vos informations, votre mot de passe et vos sessions actives."
      />

      {user.mustChangePassword && (
        <div className="mb-5">
          <Alert tone="warning" title="Changement de mot de passe requis">
            Votre mot de passe a ete defini par un administrateur. Choisissez-en un nouveau,
            connu de vous seul, avant de poursuivre.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Changer mon mot de passe">
            <ChangePasswordForm minLength={PASSWORD_MIN_LENGTH} />
          </Card>

          <Card
            title="Sessions actives"
            description="Appareils actuellement connectes avec votre compte."
            padded={false}
          >
            {sessions.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucune session" />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "device", label: "Appareil" },
                  { key: "ip", label: "Adresse IP" },
                  { key: "start", label: "Ouverte" },
                  { key: "end", label: "Expire" },
                ]}
              >
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="max-w-xs truncate text-xs text-slate-600" title={session.userAgent}>
                      {session.userAgent || "Inconnu"}
                      {session.id === context.sessionId && (
                        <span className="ml-1.5">
                          <Badge tone="success">Session actuelle</Badge>
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs">{session.ipAddress || "—"}</td>
                    <td className="text-xs text-slate-600">
                      {formatRelative(session.createdAt, context.school?.locale)}
                    </td>
                    <td className="text-xs text-slate-600">
                      {formatDateTime(session.expiresAt, context.school?.locale)}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Changer votre mot de passe ferme automatiquement toutes les autres sessions.
            </p>
          </Card>

          <Card title="Mon activite recente" padded={false}>
            {recentActivity.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucune activite" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentActivity.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="font-mono text-xs text-slate-600">{event.action}</span>
                    <span className="text-xs text-slate-400">
                      {formatRelative(event.createdAt, context.school?.locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Mon profil">
            <FieldGrid cols={2}>
              <Field label="Nom">{user.lastName}</Field>
              <Field label="Prenom">{user.firstName}</Field>
              <Field label="E-mail">{user.email}</Field>
              <Field label="Telephone">{user.phone}</Field>
              <Field label="Compte cree">
                {formatDateTime(user.createdAt, context.school?.locale)}
              </Field>
              <Field label="Derniere connexion">
                {user.lastLoginAt ? formatDateTime(user.lastLoginAt, context.school?.locale) : "—"}
              </Field>
            </FieldGrid>

            {user.isSuperAdmin && (
              <p className="mt-4">
                <Badge tone="info">Super-administrateur de la plateforme</Badge>
              </p>
            )}
          </Card>

          <Card title="Mes etablissements" padded={false}>
            {user.memberships.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun etablissement" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {user.memberships.map((membership, index) => (
                  <li key={index} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{membership.school.name}</p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABELS[membership.role.code as RoleCode] ?? membership.role.name}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Bonnes pratiques">
            <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
              <li>
                Utilisez un mot de passe unique, different de ceux de vos autres services.
              </li>
              <li>Ne partagez jamais vos identifiants, meme avec un collegue de confiance.</li>
              <li>
                Si vous constatez une session que vous ne reconnaissez pas, changez immediatement
                votre mot de passe : cela fermera toutes les autres sessions.
              </li>
              <li>
                Les administrateurs ne vous demanderont jamais votre mot de passe par telephone ou
                par message.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
