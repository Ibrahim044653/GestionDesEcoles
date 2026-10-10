import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { formatRelative, formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, BellIcon } from "@/components/ui";
import { MarkAllReadButton } from "./notification-forms";

export const metadata: Metadata = { title: "Notifications" };

const KIND_LABELS: Record<string, string> = {
  NOTES_PUBLIEES: "Resultats publies",
  ABSENCE: "Absence",
  PAIEMENT_VALIDE: "Paiement valide",
  JUSTIFICATIF_REJETE: "Justificatif rejete",
  ECHEANCE_PROCHE: "Echeance proche",
  ANNONCE: "Annonce",
  DEVOIR: "Devoir",
  AUTRE: "Information",
};

function toneFor(kind: string): "neutral" | "info" | "warning" | "danger" | "success" {
  switch (kind) {
    case "PAIEMENT_VALIDE":
    case "NOTES_PUBLIEES":
      return "success";
    case "JUSTIFICATIF_REJETE":
      return "danger";
    case "ABSENCE":
    case "ECHEANCE_PROCHE":
      return "warning";
    default:
      return "info";
  }
}

/** Notifications personnelles de l'utilisateur connecte. */
export default async function NotificationsPage() {
  const context = await requireAuth();

  const notifications = await prisma.notification.findMany({
    // Filtre sur userId : impossible de consulter les notifications d'autrui.
    where: { userId: context.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: { select: { firstName: true, lastName: true } },
      school: { select: { name: true } },
    },
  });

  const unread = notifications.filter((notification) => !notification.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          unread > 0 ? `${unread} notification(s) non lue(s).` : "Toutes vos notifications sont lues."
        }
        actions={unread > 0 && <MarkAllReadButton />}
      />

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BellIcon className="size-8" />}
            title="Aucune notification"
            description="Vous serez informe ici des publications de notes, paiements valides, absences et echeances."
          />
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {notifications.map((notification) => {
              const content = (
                <>
                  <div className="flex items-start gap-3">
                    {!notification.readAt && (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500"
                        aria-label="Non lue"
                      />
                    )}
                    <div className={`min-w-0 ${notification.readAt ? "ml-5" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                        <Badge tone={toneFor(notification.kind)}>
                          {KIND_LABELS[notification.kind] ?? notification.kind}
                        </Badge>
                        {notification.deliveryStatus === "FAILED" && (
                          <Badge tone="neutral">Canal externe indisponible</Badge>
                        )}
                      </div>

                      {notification.body && (
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                          {notification.body}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-slate-400">
                        {formatRelative(notification.createdAt, context.school?.locale)}
                        {notification.student &&
                          ` — ${notification.student.lastName} ${notification.student.firstName}`}
                        {notification.school && ` — ${notification.school.name}`}
                        <span className="ml-1.5 text-slate-300">
                          ({formatDateTime(notification.createdAt, context.school?.locale)})
                        </span>
                      </p>
                    </div>
                  </div>
                </>
              );

              return (
                <li key={notification.id} className={notification.readAt ? "" : "bg-brand-50/40"}>
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      className="block px-5 py-4 transition-colors hover:bg-slate-50"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="px-5 py-4">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
