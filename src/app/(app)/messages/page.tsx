import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, guardianStudentIds } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, ROLE_LABELS, type RoleCode } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { listThreadsForUser } from "@/lib/domain/messaging";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { NewThreadForm } from "./message-forms";

export const metadata: Metadata = { title: "Messages" };

/** Profils cote etablissement, joignables par une famille. */
const STAFF_ROLES: RoleCode[] = [
  ROLES.OWNER,
  ROLES.DIRECTOR,
  ROLES.ACADEMIC_HEAD,
  ROLES.ACCOUNTANT,
  ROLES.CASHIER,
  ROLES.TEACHER,
];

/**
 * Messagerie interne.
 *
 * La liste n'affiche que les fils auxquels l'utilisateur PARTICIPE : il n'y a
 * pas de vue « tous les messages de l'ecole », meme pour la direction.
 */
export default async function MessagesPage() {
  const context = await requirePagePermission(PERMISSIONS.MESSAGE_SEND);
  const { school, user } = context;

  const threads = await listThreadsForUser(school.id, user.id);

  const isFamily =
    context.membership?.roleCode === ROLES.GUARDIAN ||
    context.membership?.roleCode === ROLES.STUDENT;

  // Une famille ecrit a l'etablissement ; un personnel peut ecrire a tout
  // membre actif, familles comprises.
  const memberships = await prisma.membership.findMany({
    where: {
      schoolId: school.id,
      status: "ACTIVE",
      userId: { not: user.id },
      ...(isFamily ? { role: { code: { in: STAFF_ROLES } } } : {}),
    },
    select: {
      userId: true,
      user: { select: { firstName: true, lastName: true, status: true } },
      role: { select: { code: true } },
    },
    orderBy: { user: { lastName: "asc" } },
    take: 300,
  });

  const recipients = memberships
    .filter((membership) => membership.user.status === "ACTIVE")
    .map((membership) => ({
      id: membership.userId,
      label: `${membership.user.firstName} ${membership.user.lastName} — ${
        ROLE_LABELS[membership.role.code as RoleCode] ?? membership.role.code
      }`,
    }));

  // Rattachement d'un fil a un eleve : propose aux familles pour leurs
  // enfants. Cote personnel, le rattachement se fait depuis la fiche eleve.
  const studentIds = isFamily ? await guardianStudentIds(context) : [];
  const students = studentIds.length
    ? (
        await prisma.student.findMany({
          where: { id: { in: studentIds }, schoolId: school.id },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: "asc" },
        })
      ).map((student) => ({ id: student.id, label: `${student.firstName} ${student.lastName}` }))
    : [];

  const unread = threads.filter((thread) => thread.unread).length;

  return (
    <>
      <PageHeader
        title="Messages"
        description="Conversations avec l'etablissement. Un message envoye ne peut plus etre modifie."
        actions={
          recipients.length > 0 ? (
            <NewThreadForm recipients={recipients} students={students} />
          ) : undefined
        }
      />

      {unread > 0 && (
        <p className="mb-4 text-sm text-slate-600">
          {unread} conversation(s) comportent un message non lu.
        </p>
      )}

      <Card padded={false}>
        {threads.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Aucune conversation"
              description={
                recipients.length === 0
                  ? "Aucun destinataire n'est disponible dans cet etablissement."
                  : "Ouvrez une conversation avec le bouton « Nouveau message »."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/messages/${thread.id}`}
                  className="flex flex-wrap items-start gap-3 px-5 py-4 transition hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm ${
                          thread.unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"
                        }`}
                      >
                        {thread.subject}
                      </span>
                      {thread.unread && <Badge tone="info">Non lu</Badge>}
                      {thread.student && (
                        <Badge tone="neutral">
                          {thread.student.firstName} {thread.student.lastName}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {thread.otherParticipants.join(", ") || "Conversation sans destinataire actif"}
                      {thread.lastMessage && (
                        <>
                          {" · "}
                          {thread.lastMessage.author} : {thread.lastMessage.body.slice(0, 120)}
                        </>
                      )}
                    </p>
                  </div>

                  <span className="shrink-0 text-xs text-slate-400">
                    {formatRelative(thread.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
