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

    /**
     * Delais des transactions interactives, definis UNE FOIS ici plutot que
     * repetes a chaque appel.
     *
     * Le defaut de Prisma est de 5 s. Il suffit largement en SQLite local, ou
     * la latence reseau est nulle. Il ne suffit pas sur une base PostgreSQL
     * distante : une operation enchainant une dizaine d'ecritures depasse le
     * delai, la transaction est fermee cote serveur, et les requetes suivantes
     * echouent en P2028 « transaction not found » — un message qui ne designe
     * pas sa vraie cause.
     *
     * Ce reglage est une propriete de la LATENCE du deploiement, pas de
     * chaque operation metier : sa place est donc sur le client.
     *
     * `maxWait` borne l'attente d'une connexion libre dans le pool,
     * `timeout` la duree de la transaction elle-meme.
     */
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
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
