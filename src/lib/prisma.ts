import { PrismaClient } from "@prisma/client";

/**
 * Client Prisma unique. En developpement, Next.js recharge les modules a chaque
 * modification : on memorise l'instance sur globalThis pour ne pas epuiser le
 * pool de connexions.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Accepte indifferemment le client global ou une transaction en cours. */
export type Db = PrismaClient | Tx;
