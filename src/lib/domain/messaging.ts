import { prisma, type Db } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { notifyUsers } from "./notifications";

/**
 * Messagerie interne parent <-> etablissement.
 *
 * REGLE D'ACCES : un fil n'est lisible que par ses PARTICIPANTS explicites.
 * Il n'existe aucun acces « par role » a un fil : un directeur ne lit pas le
 * fil d'un collegue avec une famille sauf s'il y a ete ajoute. C'est une
 * conversation, pas un registre administratif.
 *
 * Les messages ne sont jamais supprimes ni modifies : une conversation avec
 * une famille peut servir de preuve, des deux cotes.
 */

export const MAX_MESSAGE_LENGTH = 4000;

/** Fils auxquels cet utilisateur participe, les plus recents d'abord. */
export async function listThreadsForUser(
  schoolId: string,
  userId: string,
  options: { db?: Db; take?: number } = {},
) {
  const db = options.db ?? prisma;

  const threads = await db.messageThread.findMany({
    where: { schoolId, participants: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    take: options.take ?? 50,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { author: { select: { firstName: true, lastName: true } } },
      },
      participants: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  const studentIds = threads
    .map((thread) => thread.studentId)
    .filter((id): id is string => Boolean(id));

  const students = studentIds.length
    ? await db.student.findMany({
        where: { id: { in: studentIds }, schoolId },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];

  const studentById = new Map(students.map((student) => [student.id, student]));

  return threads.map((thread) => {
    const self = thread.participants.find((participant) => participant.userId === userId);
    const last = thread.messages[0];

    return {
      id: thread.id,
      subject: thread.subject,
      updatedAt: thread.updatedAt,
      student: thread.studentId ? (studentById.get(thread.studentId) ?? null) : null,
      otherParticipants: thread.participants
        .filter((participant) => participant.userId !== userId)
        .map((participant) => `${participant.user.firstName} ${participant.user.lastName}`),
      lastMessage: last
        ? {
            body: last.body,
            author: last.author
              ? `${last.author.firstName} ${last.author.lastName}`
              : "Compte supprime",
            at: last.createdAt,
          }
        : null,
      // Non lu : un message posterieur a la derniere lecture, ecrit par un autre.
      unread: Boolean(
        last &&
          last.authorId !== userId &&
          (!self?.lastReadAt || last.createdAt > self.lastReadAt),
      ),
    };
  });
}

/** Nombre de fils non lus, pour la pastille de navigation. */
export async function countUnreadThreads(
  schoolId: string,
  userId: string,
  db: Db = prisma,
): Promise<number> {
  const threads = await listThreadsForUser(schoolId, userId, { db, take: 200 });
  return threads.filter((thread) => thread.unread).length;
}

/**
 * Charge un fil pour un utilisateur donne.
 *
 * Retourne null si l'utilisateur n'y participe pas OU si le fil appartient a
 * un autre etablissement : l'appelant doit alors repondre 404, sans distinguer
 * « inexistant » de « interdit ».
 */
export async function loadThreadForUser(
  schoolId: string,
  threadId: string,
  userId: string,
  db: Db = prisma,
) {
  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, firstName: true, lastName: true } } },
      },
      participants: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  if (!thread || thread.schoolId !== schoolId) return null;
  if (!thread.participants.some((participant) => participant.userId === userId)) return null;

  const student = thread.studentId
    ? await db.student.findFirst({
        where: { id: thread.studentId, schoolId },
        select: { id: true, firstName: true, lastName: true },
      })
    : null;

  return { ...thread, student };
}

/** Marque le fil comme lu pour cet utilisateur. */
export async function markThreadRead(
  threadId: string,
  userId: string,
  db: Db = prisma,
): Promise<void> {
  await db.threadParticipant.updateMany({
    where: { threadId, userId },
    data: { lastReadAt: new Date() },
  });
}

/**
 * Ouvre un fil et y depose le premier message.
 *
 * L'auteur est ajoute aux participants meme s'il ne figure pas dans la liste
 * fournie : sans cela il ne pourrait pas relire sa propre conversation.
 */
export async function startThread(input: {
  schoolId: string;
  authorId: string;
  subject: string;
  body: string;
  participantIds: string[];
  studentId?: string | null;
  db?: Db;
}): Promise<{ threadId: string }> {
  const db = input.db ?? prisma;

  const subject = input.subject.trim().slice(0, 200);
  const body = input.body.trim().slice(0, MAX_MESSAGE_LENGTH);

  if (!subject) throw new ValidationError("Indiquez l'objet du message.", {
    subject: ["L'objet est obligatoire."],
  });
  if (!body) throw new ValidationError("Le message est vide.", {
    body: ["Le message est obligatoire."],
  });

  const participantIds = Array.from(new Set([input.authorId, ...input.participantIds])).filter(
    Boolean,
  );

  if (participantIds.length < 2) {
    throw new ValidationError("Choisissez au moins un destinataire.", {
      participantIds: ["Un destinataire est obligatoire."],
    });
  }

  // Tous les destinataires doivent etre membres actifs de cet etablissement :
  // on n'ouvre pas une conversation avec un compte etranger au tenant.
  const memberships = await db.membership.findMany({
    where: { schoolId: input.schoolId, status: "ACTIVE", userId: { in: participantIds } },
    select: { userId: true },
  });

  const allowed = new Set(memberships.map((membership) => membership.userId));
  const rejected = participantIds.filter((id) => !allowed.has(id));
  if (rejected.length > 0) {
    throw new ValidationError(
      "Un destinataire ne fait pas partie de cet etablissement.",
      { participantIds: ["Destinataire invalide."] },
    );
  }

  const thread = await db.messageThread.create({
    data: {
      schoolId: input.schoolId,
      subject,
      studentId: input.studentId ?? null,
      participants: {
        create: participantIds.map((userId) => ({
          userId,
          // L'auteur a evidemment lu son propre message.
          lastReadAt: userId === input.authorId ? new Date() : null,
        })),
      },
      messages: { create: { authorId: input.authorId, body } },
    },
    select: { id: true },
  });

  await notifyUsers(
    {
      schoolId: input.schoolId,
      userIds: participantIds.filter((id) => id !== input.authorId),
      studentId: input.studentId ?? undefined,
      kind: "AUTRE",
      title: `Nouveau message : ${subject}`,
      body: body.slice(0, 200),
      link: `/messages/${thread.id}`,
    },
    db,
  );

  return { threadId: thread.id };
}

/** Ajoute un message a un fil existant. */
export async function replyToThread(input: {
  schoolId: string;
  threadId: string;
  authorId: string;
  body: string;
  db?: Db;
}): Promise<{ messageId: string }> {
  const db = input.db ?? prisma;

  const body = input.body.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!body) {
    throw new ValidationError("Le message est vide.", { body: ["Le message est obligatoire."] });
  }

  const thread = await db.messageThread.findUnique({
    where: { id: input.threadId },
    select: {
      id: true,
      schoolId: true,
      subject: true,
      studentId: true,
      participants: { select: { userId: true } },
    },
  });

  // Meme traitement pour « n'existe pas » et « pas participant ».
  if (
    !thread ||
    thread.schoolId !== input.schoolId ||
    !thread.participants.some((participant) => participant.userId === input.authorId)
  ) {
    throw new NotFoundError("Conversation introuvable.");
  }

  const message = await db.message.create({
    data: { threadId: thread.id, authorId: input.authorId, body },
    select: { id: true },
  });

  // `updatedAt` porte le tri de la liste : il doit bouger a chaque message.
  await db.messageThread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() },
  });

  await markThreadRead(thread.id, input.authorId, db);

  await notifyUsers(
    {
      schoolId: input.schoolId,
      userIds: thread.participants
        .map((participant) => participant.userId)
        .filter((userId) => userId !== input.authorId),
      studentId: thread.studentId ?? undefined,
      kind: "AUTRE",
      title: `Reponse : ${thread.subject}`,
      body: body.slice(0, 200),
      link: `/messages/${thread.id}`,
    },
    db,
  );

  return { messageId: message.id };
}
