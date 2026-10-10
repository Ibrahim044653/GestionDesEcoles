// Outil de test local : cree une session valide en base et imprime le cookie.
// Sert au parcours de fumee des pages ; il ne fait PAS partie de l'application.
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

// Le hachage des jetons est poivre par SESSION_SECRET (src/lib/auth/password.ts).
const envFile = readFileSync(".env", "utf8");
const match = envFile.split(/\r?\n/).find((line) => line.startsWith("SESSION_SECRET="));
const secret = match
  ? match.slice("SESSION_SECRET=".length).replace(/^"|"$/g, "")
  : "dev-only-insecure-secret-do-not-use-in-production";

const prisma = new PrismaClient();
const email = process.argv[2];

const user = await prisma.user.findUnique({
  where: { email },
  include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
});

if (!user) {
  console.error(`Utilisateur ${email} introuvable`);
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
await prisma.session.create({
  data: {
    userId: user.id,
    tokenHash: createHmac("sha256", secret).update(token).digest("hex"),
    activeSchoolId: user.memberships[0]?.schoolId ?? null,
    expiresAt: new Date(Date.now() + 3600 * 1000),
  },
});

console.log(`ge_session=${token}`);
await prisma.$disconnect();
