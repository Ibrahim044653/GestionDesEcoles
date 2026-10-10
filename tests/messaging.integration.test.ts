import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase, seedTwoSchools } from "./helpers/db";
import {
  countUnreadThreads,
  listThreadsForUser,
  loadThreadForUser,
  markThreadRead,
  replyToThread,
  startThread,
} from "@/lib/domain/messaging";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Messagerie interne.
 *
 * Deux garde-fous sont verifies ici, parce que ce sont ceux qui coutent cher
 * s'ils cedent :
 *  - un fil n'est lisible que par ses participants ;
 *  - un fil n'est jamais lisible depuis un autre etablissement.
 */

let seed: Awaited<ReturnType<typeof seedTwoSchools>>;
let role: { id: string };

async function createMember(schoolId: string, lastName: string) {
  const user = await prisma.user.create({
    data: {
      email: `${lastName.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}@test.local`,
      passwordHash: "scrypt$placeholder",
      firstName: "Test",
      lastName,
    },
  });

  await prisma.membership.create({
    data: { schoolId, userId: user.id, roleId: role.id, status: "ACTIVE" },
  });

  return user;
}

beforeEach(async () => {
  await resetDatabase();
  seed = await seedTwoSchools();
  role = await prisma.role.create({
    data: { code: "DIRECTOR", name: "Directeur", isSystem: true },
  });
});

describe("ouverture d'un fil", () => {
  it("cree le fil, inscrit l'auteur et notifie le destinataire", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");

    const { threadId } = await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Absence de lundi",
      body: "Bonjour, mon enfant etait souffrant.",
      participantIds: [recipient.id],
      studentId: seed.studentA.id,
    });

    const thread = await prisma.messageThread.findUniqueOrThrow({
      where: { id: threadId },
      include: { participants: true, messages: true },
    });

    expect(thread.schoolId).toBe(seed.schoolA.id);
    expect(thread.messages).toHaveLength(1);
    // L'auteur doit figurer parmi les participants, sinon il ne relirait pas
    // sa propre conversation.
    expect(thread.participants.map((p) => p.userId).sort()).toEqual(
      [author.id, recipient.id].sort(),
    );

    const notifications = await prisma.notification.findMany({
      where: { userId: recipient.id },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].link).toBe(`/messages/${threadId}`);

    // L'auteur n'est pas notifie de son propre message.
    expect(await prisma.notification.count({ where: { userId: author.id } })).toBe(0);
  });

  it("refuse un destinataire d'un autre etablissement", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const etranger = await createMember(seed.schoolB.id, "ETRANGER");

    await expect(
      startThread({
        schoolId: seed.schoolA.id,
        authorId: author.id,
        subject: "Test",
        body: "Message",
        participantIds: [etranger.id],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await prisma.messageThread.count()).toBe(0);
  });

  it("refuse un fil sans destinataire", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");

    await expect(
      startThread({
        schoolId: seed.schoolA.id,
        authorId: author.id,
        subject: "Test",
        body: "Message",
        participantIds: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse un objet ou un corps vide", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");

    await expect(
      startThread({
        schoolId: seed.schoolA.id,
        authorId: author.id,
        subject: "   ",
        body: "Message",
        participantIds: [recipient.id],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      startThread({
        schoolId: seed.schoolA.id,
        authorId: author.id,
        subject: "Objet",
        body: "   ",
        participantIds: [recipient.id],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("lecture d'un fil", () => {
  it("refuse la lecture a un non-participant du meme etablissement", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");
    const curieux = await createMember(seed.schoolA.id, "CURIEUX");

    const { threadId } = await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Confidentiel",
      body: "Contenu prive",
      participantIds: [recipient.id],
    });

    expect(await loadThreadForUser(seed.schoolA.id, threadId, author.id)).not.toBeNull();
    // Meme ecole, meme role de direction : sans participation, pas de lecture.
    expect(await loadThreadForUser(seed.schoolA.id, threadId, curieux.id)).toBeNull();
  });

  it("refuse la lecture depuis un autre etablissement", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");

    const { threadId } = await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Confidentiel",
      body: "Contenu prive",
      participantIds: [recipient.id],
    });

    // Meme utilisateur, mais contexte d'ecole B : rien ne doit remonter.
    expect(await loadThreadForUser(seed.schoolB.id, threadId, author.id)).toBeNull();
  });

  it("ne liste que les fils dont l'utilisateur est participant", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");
    const curieux = await createMember(seed.schoolA.id, "CURIEUX");

    await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Fil 1",
      body: "Message",
      participantIds: [recipient.id],
    });

    expect(await listThreadsForUser(seed.schoolA.id, author.id)).toHaveLength(1);
    expect(await listThreadsForUser(seed.schoolA.id, curieux.id)).toHaveLength(0);
  });
});

describe("reponse a un fil", () => {
  it("ajoute le message, notifie les autres et remonte le fil", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");

    const { threadId } = await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Suivi",
      body: "Premier message",
      participantIds: [recipient.id],
    });

    const before = await prisma.messageThread.findUniqueOrThrow({ where: { id: threadId } });

    await replyToThread({
      schoolId: seed.schoolA.id,
      threadId,
      authorId: recipient.id,
      body: "Bien recu, merci.",
    });

    const after = await prisma.messageThread.findUniqueOrThrow({
      where: { id: threadId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    expect(after.messages).toHaveLength(2);
    expect(after.messages[1].body).toBe("Bien recu, merci.");
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());

    // L'auteur initial est notifie de la reponse.
    expect(await prisma.notification.count({ where: { userId: author.id } })).toBe(1);
  });

  it("refuse une reponse d'un non-participant", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");
    const curieux = await createMember(seed.schoolA.id, "CURIEUX");

    const { threadId } = await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Suivi",
      body: "Premier message",
      participantIds: [recipient.id],
    });

    await expect(
      replyToThread({
        schoolId: seed.schoolA.id,
        threadId,
        authorId: curieux.id,
        body: "Je m'invite.",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await prisma.message.count({ where: { threadId } })).toBe(1);
  });

  it("refuse une reponse depuis un autre etablissement", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");

    const { threadId } = await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Suivi",
      body: "Premier message",
      participantIds: [recipient.id],
    });

    await expect(
      replyToThread({
        schoolId: seed.schoolB.id,
        threadId,
        authorId: author.id,
        body: "Depuis la mauvaise ecole.",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("suivi de lecture", () => {
  it("marque un fil non lu pour le destinataire, lu pour l'auteur", async () => {
    const author = await createMember(seed.schoolA.id, "AUTEUR");
    const recipient = await createMember(seed.schoolA.id, "PARENT");

    const { threadId } = await startThread({
      schoolId: seed.schoolA.id,
      authorId: author.id,
      subject: "Suivi",
      body: "Premier message",
      participantIds: [recipient.id],
    });

    expect(await countUnreadThreads(seed.schoolA.id, author.id)).toBe(0);
    expect(await countUnreadThreads(seed.schoolA.id, recipient.id)).toBe(1);

    await markThreadRead(threadId, recipient.id);
    expect(await countUnreadThreads(seed.schoolA.id, recipient.id)).toBe(0);

    // Une nouvelle reponse rend le fil non lu pour l'autre partie.
    await replyToThread({
      schoolId: seed.schoolA.id,
      threadId,
      authorId: recipient.id,
      body: "Une question de plus.",
    });

    expect(await countUnreadThreads(seed.schoolA.id, author.id)).toBe(1);
    // Celui qui vient d'ecrire n'a rien de non lu.
    expect(await countUnreadThreads(seed.schoolA.id, recipient.id)).toBe(0);
  });
});
