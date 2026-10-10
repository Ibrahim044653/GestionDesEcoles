import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from "node:crypto";
import { requireSessionSecret } from "@/lib/env";
import { promisify } from "node:util";

/**
 * Hachage des mots de passe avec scrypt (RFC 7914), fourni par node:crypto.
 *
 * Choix assume : aucune dependance native (bcrypt/argon2 exigent une chaine de
 * compilation). scrypt est resistant au materiel dedie grace a son cout memoire.
 *
 * Format stocke : scrypt$N$r$p$<sel base64url>$<empreinte base64url>
 * Le format embarque ses parametres : augmenter le cout plus tard n'invalide
 * pas les empreintes existantes.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

export const PASSWORD_MIN_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Verification a temps constant. Retourne false sur empreinte malformee
 * plutot que de lever : un enregistrement corrompu ne doit pas ouvrir l'acces.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
    const N = Number.parseInt(nRaw, 10);
    const r = Number.parseInt(rRaw, 10);
    const p = Number.parseInt(pRaw, 10);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const salt = Buffer.from(saltRaw, "base64url");
    const expected = Buffer.from(hashRaw, "base64url");

    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Politique de mot de passe. Retourne la liste des manquements. */
export function validatePasswordStrength(password: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (!/[a-z]/.test(password)) problems.push("Il doit contenir une minuscule.");
  if (!/[A-Z]/.test(password)) problems.push("Il doit contenir une majuscule.");
  if (!/[0-9]/.test(password)) problems.push("Il doit contenir un chiffre.");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("Il doit contenir un caractere special.");
  return problems;
}

/** Jeton opaque (session, reinitialisation). Jamais stocke en clair. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Empreinte d'un jeton pour stockage.
 *
 * HMAC-SHA256 plutot qu'un simple SHA-256 : le jeton est deja une valeur
 * aleatoire de forte entropie, mais "poivrer" l'empreinte avec SESSION_SECRET
 * rend les empreintes inexploitables pour qui obtiendrait une copie de la
 * base sans connaitre le secret applicatif.
 */
export function hashToken(token: string): string {
  return createHmac("sha256", requireSessionSecret()).update(token).digest("hex");
}
