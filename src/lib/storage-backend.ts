import "server-only";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

/**
 * Backends de stockage des fichiers.
 *
 * Deux pilotes :
 *  - `local` : disque, pour le developpement et tout hebergement disposant
 *              d'un volume persistant (VPS, Docker avec volume).
 *  - `blob`  : Vercel Blob en magasin PRIVE, pour un hebergement sans disque
 *              persistant. Sur Vercel le systeme de fichiers est en lecture
 *              seule hors /tmp, et /tmp disparait entre deux invocations :
 *              ecrire sur disque y perdrait silencieusement les justificatifs.
 *
 * Le magasin est volontairement PRIVE et non public. Un magasin public aurait
 * rendu chaque justificatif de paiement et chaque photo d'eleve lisible par
 * quiconque obtiendrait l'URL, ce qui aurait affaibli la garantie centrale de
 * l'application : un fichier n'est servi que par /api/files/[id], apres
 * verification du tenant et des permissions. En prive, l'URL seule ne donne
 * rien — il faut le jeton du magasin, qui ne quitte jamais le serveur.
 *
 * La cle de stockage (`Document.storageKey`) porte son pilote en prefixe :
 * `blob:<pathname>` pour Vercel Blob, chemin relatif nu pour le disque. La
 * LECTURE choisit donc son pilote d'apres la cle elle-meme, pas d'apres la
 * configuration courante. Consequence voulue : apres un changement de pilote,
 * les anciens fichiers restent lisibles au lieu de devenir introuvables.
 */

const LOCAL_ROOT = path.resolve(process.cwd(), env.storage.localPath);
const BLOB_PREFIX = "blob:";

/**
 * Resout une cle locale en chemin absolu, en refusant toute sortie du dossier
 * de stockage. Meme un `storageKey` corrompu contenant « ../ » est rejete.
 */
function resolveLocal(storageKey: string): string {
  const absolutePath = path.resolve(LOCAL_ROOT, storageKey);
  if (!absolutePath.startsWith(LOCAL_ROOT + path.sep)) {
    throw new ValidationError("Chemin de fichier invalide.");
  }
  return absolutePath;
}

/** Ecrit un fichier et retourne la cle a enregistrer en base. */
export async function writeStoredFile(
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (env.storage.driver !== "blob") {
    const absolutePath = resolveLocal(storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);
    return storageKey;
  }

  // Import differe : le paquet n'est charge que si le pilote est reellement
  // utilise, pour ne rien peser sur un deploiement en stockage local.
  const { put } = await import("@vercel/blob");

  const result = await put(storageKey, buffer, {
    access: "private",
    contentType: mimeType,
    // Suffixe aleatoire : meme en prive, deux televersements du meme nom ne
    // doivent pas s'ecraser.
    addRandomSuffix: true,
  });

  return `${BLOB_PREFIX}${result.pathname}`;
}

export async function readStoredFileBytes(storageKey: string): Promise<Buffer> {
  if (!storageKey.startsWith(BLOB_PREFIX)) {
    return readFile(resolveLocal(storageKey));
  }

  const { get } = await import("@vercel/blob");
  const pathname = storageKey.slice(BLOB_PREFIX.length);

  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new ValidationError("Fichier introuvable dans le stockage distant.");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of result.stream as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Supprime le fichier physique. Tolerante par conception : un fichier deja
 * absent ne doit pas empecher la suppression logique du Document en base.
 */
export async function removeStoredFile(storageKey: string): Promise<void> {
  try {
    if (!storageKey.startsWith(BLOB_PREFIX)) {
      await unlink(resolveLocal(storageKey));
      return;
    }
    const { del } = await import("@vercel/blob");
    await del(storageKey.slice(BLOB_PREFIX.length));
  } catch {
    // Volontairement silencieux : voir le commentaire ci-dessus.
  }
}
