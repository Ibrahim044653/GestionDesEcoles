import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

/**
 * Preparation globale des tests.
 *
 * Cree une base SQLite jetable AVANT le chargement du moindre module
 * applicatif, et pointe DATABASE_URL dessus. Les processus de test heritent de
 * cette variable : le client Prisma partage par l'application se connecte donc
 * a la base de test, jamais a la base de developpement.
 */

const TEST_DB_FILE = path.resolve(process.cwd(), "prisma", "test-integration.db");

export async function setup(): Promise<void> {
  if (existsSync(TEST_DB_FILE)) unlinkSync(TEST_DB_FILE);

  const url = `file:${TEST_DB_FILE.replace(/\\/g, "/")}`;
  process.env.DATABASE_URL = url;
  // NODE_ENV est declare en lecture seule par @types/node ; l'affectation est
  // volontaire et sans risque ici (processus de test dedie).
  Object.assign(process.env, { NODE_ENV: "test" });
  // Secret factice : les tests n'emettent aucun cookie reel.
  process.env.SESSION_SECRET ??= "test-only-secret-not-used-for-real-sessions-32";

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

export async function teardown(): Promise<void> {
  try {
    if (existsSync(TEST_DB_FILE)) unlinkSync(TEST_DB_FILE);
  } catch {
    // Sous Windows le fichier peut rester verrouille brievement : sans
    // consequence, il est recree a l'execution suivante.
  }
}
