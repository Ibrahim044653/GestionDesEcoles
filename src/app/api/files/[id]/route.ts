import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, guardianStudentIds, currentStudentId } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { readStoredFile } from "@/lib/storage";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

/**
 * Service des fichiers prives.
 *
 * Les fichiers ne sont JAMAIS exposes directement : ils vivent hors de la
 * racine web et ne transitent que par cette route, apres :
 *   1. authentification ;
 *   2. verification du tenant (le document appartient-il a l'ecole active ?) ;
 *   3. verification du droit de lecture selon le role et le lien avec l'eleve.
 *
 * Toute reponse negative est un 404 uniforme : connaitre l'identifiant d'un
 * document ne doit rien reveler de son existence.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      schoolId: true,
      storageKey: true,
      fileName: true,
      mimeType: true,
      kind: true,
      visibility: true,
      studentId: true,
      staffId: true,
      uploadedById: true,
      deletedAt: true,
    },
  });

  const notFound = () => NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });

  if (!document || document.deletedAt) return notFound();

  // Isolation multi-tenant : le document doit relever de l'etablissement actif.
  if (document.schoolId && document.schoolId !== auth.school?.id) {
    await recordAudit({
      action: AUDIT_ACTIONS.CROSS_TENANT_ATTEMPT,
      schoolId: auth.school?.id ?? null,
      userId: auth.user.id,
      entityType: "document",
      entityId: document.id,
    });
    return notFound();
  }

  if (!(await canRead(auth, document))) {
    await recordAudit({
      action: AUDIT_ACTIONS.ACCESS_DENIED,
      schoolId: auth.school?.id ?? null,
      userId: auth.user.id,
      entityType: "document",
      entityId: document.id,
      metadata: { kind: document.kind },
    });
    return notFound();
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(document.storageKey);
  } catch {
    return notFound();
  }

  await recordAudit({
    action: AUDIT_ACTIONS.FILE_DOWNLOADED,
    schoolId: document.schoolId,
    userId: auth.user.id,
    entityType: "document",
    entityId: document.id,
    metadata: { fileName: document.fileName },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
      // Les documents sont personnels : aucun cache partage.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Regles de lecture, evaluees dans l'ordre du moins au plus restrictif. */
async function canRead(
  auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>,
  document: { studentId: string | null; staffId: string | null; uploadedById: string | null; visibility: string },
): Promise<boolean> {
  // L'auteur du televersement garde l'acces a son propre fichier.
  if (document.uploadedById === auth.user.id) return true;

  // Le personnel habilite consulte les documents des eleves.
  if (auth.permissions.has(PERMISSIONS.STUDENT_VIEW) && document.studentId) return true;
  if (auth.permissions.has(PERMISSIONS.STAFF_VIEW) && document.staffId) return true;
  if (auth.permissions.has(PERMISSIONS.EXPENSE_VIEW) && document.visibility === "STAFF") return true;

  // Un parent n'accede qu'aux documents de SES enfants.
  if (document.studentId && auth.permissions.has(PERMISSIONS.STUDENT_VIEW_OWN)) {
    const allowed = await guardianStudentIds(auth);
    if (allowed.includes(document.studentId)) return true;

    const ownStudentId = await currentStudentId(auth);
    if (ownStudentId && ownStudentId === document.studentId) return true;
  }

  // Document public de l'etablissement (logo, annonce).
  if (document.visibility === "PUBLIC_SCHOOL") return true;

  return false;
}
