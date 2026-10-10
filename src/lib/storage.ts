import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";
import { ALLOWED_UPLOAD_MIME } from "@/lib/constants";

/**
 * Stockage PRIVE des fichiers.
 *
 * Les fichiers ne sont jamais ecrits dans /public : ils vivent hors de la
 * racine web et ne sont servis que par /api/files/[id], apres verification du
 * tenant et des permissions. Une URL devinee ne donne donc aucun acces.
 */

const ROOT = path.resolve(process.cwd(), env.storage.localPath);

/** Signatures binaires : le type MIME declare par le client n'est pas digne de confiance. */
const MAGIC_NUMBERS: { mime: string; bytes: number[]; offset: number }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }, // %PDF
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // "WEBP" apres RIFF
];

/** Detecte le type reel d'un fichier d'apres son entete. */
export function detectMimeType(buffer: Buffer): string | null {
  for (const candidate of MAGIC_NUMBERS) {
    const slice = buffer.subarray(candidate.offset, candidate.offset + candidate.bytes.length);
    if (slice.length === candidate.bytes.length && candidate.bytes.every((byte, i) => slice[i] === byte)) {
      return candidate.mime;
    }
  }
  return null;
}

/** Neutralise un nom de fichier fourni par l'utilisateur (traversee, caracteres speciaux). */
export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^\w.\-À-ſ ]+/g, "_");
  return base.slice(0, 120) || "fichier";
}

export type StoreFileInput = {
  file: File;
  schoolId: string | null;
  kind: string;
  visibility?: string;
  uploadedById: string;
  studentId?: string | null;
  staffId?: string | null;
  expenseId?: string | null;
  assignmentId?: string | null;
  submissionId?: string | null;
};

/**
 * Enregistre un fichier televerse apres controle de taille et de type reel.
 * Retourne l'identifiant du Document, jamais un chemin disque.
 */
export async function storeUploadedFile(input: StoreFileInput): Promise<{ documentId: string }> {
  const { file } = input;

  if (!file || file.size === 0) throw new ValidationError("Aucun fichier n'a ete transmis.");
  if (file.size > env.storage.maxUploadBytes) {
    throw new ValidationError(
      `Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} Mo). ` +
        `Maximum autorise : ${Math.round(env.storage.maxUploadBytes / 1024 / 1024)} Mo.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectMimeType(buffer);

  // On se fie a la signature binaire, pas au type annonce : un .exe renomme
  // en .pdf est rejete ici.
  if (!detected || !ALLOWED_UPLOAD_MIME.includes(detected as (typeof ALLOWED_UPLOAD_MIME)[number])) {
    throw new ValidationError(
      "Format de fichier non autorise. Formats acceptes : PDF, JPEG, PNG, WebP.",
    );
  }

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const safeName = sanitizeFileName(file.name);
  const extension = path.extname(safeName) || extensionFor(detected);

  // Cle de stockage imprevisible et cloisonnee par ecole.
  const storageKey = path.posix.join(
    input.schoolId ?? "_global",
    new Date().toISOString().slice(0, 7),
    `${randomUUID()}${extension}`,
  );

  const absolutePath = path.join(ROOT, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  const document = await prisma.document.create({
    data: {
      schoolId: input.schoolId,
      storageKey,
      fileName: safeName,
      mimeType: detected,
      sizeBytes: buffer.byteLength,
      checksum,
      kind: input.kind,
      visibility: input.visibility ?? "STAFF",
      uploadedById: input.uploadedById,
      studentId: input.studentId ?? null,
      staffId: input.staffId ?? null,
      expenseId: input.expenseId ?? null,
      assignmentId: input.assignmentId ?? null,
      submissionId: input.submissionId ?? null,
    },
    select: { id: true },
  });

  return { documentId: document.id };
}

/** Enregistre un fichier genere par l'application (recu, bulletin). */
export async function storeGeneratedFile(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  schoolId: string | null;
  kind: string;
  visibility?: string;
  uploadedById?: string | null;
  studentId?: string | null;
}): Promise<{ documentId: string }> {
  const storageKey = path.posix.join(
    input.schoolId ?? "_global",
    new Date().toISOString().slice(0, 7),
    `${randomUUID()}${path.extname(input.fileName) || ".pdf"}`,
  );

  const absolutePath = path.join(ROOT, storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  const document = await prisma.document.create({
    data: {
      schoolId: input.schoolId,
      storageKey,
      fileName: sanitizeFileName(input.fileName),
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      checksum: createHash("sha256").update(input.buffer).digest("hex"),
      kind: input.kind,
      visibility: input.visibility ?? "STAFF",
      uploadedById: input.uploadedById ?? null,
      studentId: input.studentId ?? null,
    },
    select: { id: true },
  });

  return { documentId: document.id };
}

/**
 * Lit un fichier. La cle est re-resolue et verifiee : meme si un storageKey
 * corrompu contenait "../", la lecture hors du dossier de stockage est refusee.
 */
export async function readStoredFile(storageKey: string): Promise<Buffer> {
  const absolutePath = path.resolve(ROOT, storageKey);
  if (!absolutePath.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new ValidationError("Chemin de fichier invalide.");
  }
  return readFile(absolutePath);
}

export async function deleteStoredFile(documentId: string): Promise<void> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { storageKey: true },
  });
  if (!document) return;

  try {
    const absolutePath = path.resolve(ROOT, document.storageKey);
    if (absolutePath.startsWith(path.resolve(ROOT) + path.sep)) await unlink(absolutePath);
  } catch {
    // Fichier deja absent du disque : on poursuit la suppression logique.
  }

  await prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date() },
  });
}

function extensionFor(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return ".pdf";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
}
