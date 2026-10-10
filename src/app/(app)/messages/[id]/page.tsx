import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { loadThreadForUser, markThreadRead } from "@/lib/domain/messaging";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ReplyForm } from "../message-forms";

export const metadata: Metadata = { title: "Conversation" };

/**
 * Fil de discussion.
 *
 * `loadThreadForUser` renvoie null aussi bien pour un fil inexistant que pour
 * un fil auquel l'utilisateur ne participe pas : les deux cas donnent 404,
 * sans reveler l'existence de la conversation.
 */
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission(PERMISSIONS.MESSAGE_SEND);
  const { id } = await params;
  const { school, user } = context;

  const thread = await loadThreadForUser(school.id, id, user.id);
  if (!thread) notFound();

  // La lecture est enregistree a l'ouverture : c'est le geste qui la constate.
  await markThreadRead(thread.id, user.id);

  const canOpenStudent = hasPermission(context, PERMISSIONS.STUDENT_VIEW);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Messages", href: "/messages" }, { label: thread.subject }]}
        title={thread.subject}
        description={thread.participants
          .map((participant) => `${participant.user.firstName} ${participant.user.lastName}`)
          .join(", ")}
        actions={
          thread.student ? (
            canOpenStudent ? (
              <Link href={`/eleves/${thread.student.id}`} className="btn-secondary btn-sm">
                Fiche de {thread.student.firstName} {thread.student.lastName}
              </Link>
            ) : (
              <Badge tone="neutral">
                {thread.student.firstName} {thread.student.lastName}
              </Badge>
            )
          ) : undefined
        }
      />

      <Card padded={false} className="mb-5">
        <ul className="divide-y divide-slate-100">
          {thread.messages.map((message) => {
            const mine = message.authorId === user.id;
            return (
              <li key={message.id} className={`px-5 py-4 ${mine ? "bg-brand-50/40" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {message.author
                      ? `${message.author.firstName} ${message.author.lastName}`
                      : "Compte supprime"}
                  </span>
                  {mine && <Badge tone="neutral">Vous</Badge>}
                  <span className="text-xs text-slate-400">
                    {message.createdAt.toLocaleString("fr-FR")}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{message.body}</p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Repondre">
        <ReplyForm threadId={thread.id} />
      </Card>
    </>
  );
}
