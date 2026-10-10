import { prisma, type Db } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * Notifications.
 *
 * Le canal IN_APP est le seul reellement operationnel : il ecrit en base et
 * s'affiche dans l'application. Les canaux EMAIL / SMS / WHATSAPP passent par
 * les adaptateurs de src/lib/integrations : tant qu'aucun prestataire n'est
 * configure, l'envoi est journalise et marque FAILED plutot que d'etre
 * presente comme reussi.
 */

export type NotifyInput = {
  schoolId: string | null;
  userIds: string[];
  kind: string;
  title: string;
  body?: string;
  link?: string;
  studentId?: string | null;
  channels?: ("IN_APP" | "EMAIL" | "SMS" | "WHATSAPP")[];
  metadata?: Record<string, unknown>;
};

export async function notifyUsers(input: NotifyInput, db: Db = prisma): Promise<number> {
  const uniqueUserIds = Array.from(new Set(input.userIds)).filter(Boolean);
  if (uniqueUserIds.length === 0) return 0;

  const channels = input.channels ?? ["IN_APP"];
  const rows: {
    schoolId: string | null;
    userId: string;
    studentId: string | null;
    kind: string;
    title: string;
    body: string;
    link: string;
    channel: string;
    deliveryStatus: string;
  }[] = [];

  for (const userId of uniqueUserIds) {
    for (const channel of channels) {
      rows.push({
        schoolId: input.schoolId,
        userId,
        studentId: input.studentId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body ?? "",
        link: input.link ?? "",
        channel,
        deliveryStatus: deliveryStatusFor(channel),
      });
    }
  }

  await db.notification.createMany({ data: rows });
  return rows.length;
}

/**
 * Un canal externe non configure est marque FAILED, jamais SENT :
 * l'interface ne doit pas laisser croire qu'un SMS est parti.
 */
function deliveryStatusFor(channel: string): string {
  switch (channel) {
    case "IN_APP":
      return "SENT";
    case "EMAIL":
      return env.integrations.mail.configured ? "PENDING" : "FAILED";
    case "SMS":
      return env.integrations.sms.configured ? "PENDING" : "FAILED";
    case "WHATSAPP":
      return env.integrations.whatsapp.configured ? "PENDING" : "FAILED";
    default:
      return "FAILED";
  }
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  // Le filtre sur userId empeche de marquer la notification d'autrui.
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string, schoolId?: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(schoolId ? { schoolId } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function unreadCount(userId: string, schoolId?: string | null): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null, ...(schoolId ? { schoolId } : {}) },
  });
}

/**
 * Rappels d'echeances proches.
 * Concu pour une tache planifiee : la double notification est evitee en
 * verifiant qu'aucun rappel du meme type n'a ete emis dans les 72 dernieres heures.
 */
export async function sendDueDateReminders(
  schoolId: string,
  options: { withinDays?: number } = {},
): Promise<number> {
  const withinDays = options.withinDays ?? 7;
  const now = new Date();
  const horizon = new Date(now.getTime() + withinDays * 86_400_000);

  const installments = await prisma.installment.findMany({
    where: { schoolId, dueDate: { gte: now, lte: horizon } },
    select: {
      id: true,
      label: true,
      dueDate: true,
      feeAssignment: {
        select: {
          studentId: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              guardians: {
                where: { canViewFinance: true },
                select: { guardian: { select: { userId: true } } },
              },
            },
          },
        },
      },
    },
  });

  let sent = 0;
  const since = new Date(now.getTime() - 72 * 3600 * 1000);

  for (const installment of installments) {
    const userIds = installment.feeAssignment.student.guardians
      .map((link) => link.guardian.userId)
      .filter((id): id is string => Boolean(id));
    if (userIds.length === 0) continue;

    const alreadySent = await prisma.notification.findFirst({
      where: {
        schoolId,
        kind: "ECHEANCE_PROCHE",
        studentId: installment.feeAssignment.studentId,
        createdAt: { gte: since },
        userId: { in: userIds },
      },
      select: { id: true },
    });
    if (alreadySent) continue;

    sent += await notifyUsers({
      schoolId,
      userIds,
      studentId: installment.feeAssignment.studentId,
      kind: "ECHEANCE_PROCHE",
      title: "Echeance de paiement proche",
      body: `L'echeance "${installment.label}" arrive a terme le ${installment.dueDate.toLocaleDateString("fr-FR")}.`,
      link: "/parent/paiements",
    });
  }

  return sent;
}
