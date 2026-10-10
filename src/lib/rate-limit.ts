import { prisma } from "@/lib/prisma";
import { RateLimitError } from "@/lib/errors";

/**
 * Limitation des tentatives, persistee en base.
 *
 * Le stockage en base (plutot qu'en memoire) resiste au redemarrage et
 * fonctionne avec plusieurs instances applicatives derriere un load balancer.
 */

export type RateLimitRule = {
  /** Nombre de tentatives autorisees dans la fenetre. */
  limit: number;
  /** Duree de la fenetre glissante, en secondes. */
  windowSeconds: number;
  /** Duree du blocage une fois la limite atteinte, en secondes. */
  blockSeconds: number;
};

export const RATE_LIMITS = {
  /** Connexion : volontairement strict, c'est la cible privilegiee. */
  LOGIN: { limit: 5, windowSeconds: 300, blockSeconds: 900 },
  PASSWORD_RESET: { limit: 3, windowSeconds: 900, blockSeconds: 900 },
  UPLOAD: { limit: 30, windowSeconds: 600, blockSeconds: 600 },
  /** Enregistrement de paiement : garde-fou contre les soumissions repetees. */
  PAYMENT: { limit: 60, windowSeconds: 300, blockSeconds: 300 },
  /** Messagerie : assez large pour une conversation, assez etroit pour le spam. */
  MESSAGE: { limit: 40, windowSeconds: 600, blockSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Consomme une unite du quota. Leve RateLimitError si la cle est bloquee.
 * `key` doit identifier la cible (ex. "login:email@exemple.ci" ou "upload:userId").
 */
export async function consumeRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  const now = new Date();
  const bucket = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (bucket?.blockedUntil && bucket.blockedUntil > now) {
    throw new RateLimitError(Math.ceil((bucket.blockedUntil.getTime() - now.getTime()) / 1000));
  }

  const windowExpired =
    !bucket || now.getTime() - bucket.windowStart.getTime() > rule.windowSeconds * 1000;

  if (windowExpired) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now, blockedUntil: null },
      update: { count: 1, windowStart: now, blockedUntil: null },
    });
    return;
  }

  const nextCount = bucket.count + 1;

  if (nextCount > rule.limit) {
    const blockedUntil = new Date(now.getTime() + rule.blockSeconds * 1000);
    await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: nextCount, blockedUntil },
    });
    throw new RateLimitError(rule.blockSeconds);
  }

  await prisma.rateLimitBucket.update({ where: { key }, data: { count: nextCount } });
}

/** Remet le compteur a zero (appele apres une connexion reussie). */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}
