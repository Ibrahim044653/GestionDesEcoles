import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { generateToken, hashToken } from "./password";

/**
 * Sessions serveur.
 *
 * Le cookie ne contient qu'un jeton aleatoire opaque ; l'etat vit en base
 * (table Session). Consequence : une session peut etre revoquee cote serveur
 * immediatement (desactivation d'un compte, deconnexion de tous les appareils),
 * ce qu'un JWT auto-porte ne permet pas.
 */

export const SESSION_COOKIE = "ge_session";

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

async function requestContext(): Promise<{ ipAddress: string; userAgent: string }> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for") ?? "";
  return {
    ipAddress: (forwarded.split(",")[0] || headerList.get("x-real-ip") || "").trim().slice(0, 64),
    userAgent: (headerList.get("user-agent") ?? "").slice(0, 255),
  };
}

export async function createSession(userId: string, activeSchoolId?: string | null): Promise<void> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000);
  const { ipAddress, userAgent } = await requestContext();

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      activeSchoolId: activeSchoolId ?? null,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export type SessionRecord = {
  id: string;
  userId: string;
  activeSchoolId: string | null;
  expiresAt: Date;
};

/** Lit la session courante, ou null. Les sessions expirees/revoquees sont rejetees. */
export async function readSession(): Promise<SessionRecord | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, activeSchoolId: true, expiresAt: true, revokedAt: true },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return {
    id: session.id,
    userId: session.userId,
    activeSchoolId: session.activeSchoolId,
    expiresAt: session.expiresAt,
  };
}

/** Change l'etablissement actif (utilisateur rattache a plusieurs ecoles). */
export async function setActiveSchool(sessionId: string, schoolId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { activeSchoolId: schoolId },
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

/** Revoque toutes les sessions d'un utilisateur (desactivation, changement de mot de passe). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Purge des sessions expirees : a appeler depuis une tache planifiee. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
