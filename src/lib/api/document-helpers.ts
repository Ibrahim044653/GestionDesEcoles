import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { getAuthContext } from "@/lib/auth/guard";
import { guardianStudentIds, currentStudentId } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";

/** Utilitaires communs aux routes de generation de documents. */

type Auth = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

export function pdfResponse(buffer: Buffer, fileName: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      // Document nominatif : jamais mis en cache par un intermediaire.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
}

export function notFound(message = "Document introuvable."): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Verifie l'acces a un eleve pour la generation d'un document.
 *
 * Retourne l'eleve si et seulement si :
 *  - il appartient a l'etablissement actif, ET
 *  - l'utilisateur est un personnel habilite, OU le parent rattache,
 *    OU l'eleve lui-meme.
 *
 * Retourne null dans tous les autres cas, sans distinguer « inexistant » de
 * « interdit ».
 */
export async function resolveAccessibleStudent(
  auth: Auth,
  studentId: string,
  options: { requireGrades?: boolean; requireFinance?: boolean } = {},
): Promise<{ id: string; schoolId: string } | null> {
  if (!auth.school) return null;

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, schoolId: true },
  });

  if (!student || student.schoolId !== auth.school.id) return null;

  if (auth.permissions.has(PERMISSIONS.STUDENT_VIEW)) return student;

  if (auth.permissions.has(PERMISSIONS.STUDENT_VIEW_OWN)) {
    const guardianOf = await guardianStudentIds(auth, {
      requireGrades: options.requireGrades,
      requireFinance: options.requireFinance,
    });
    if (guardianOf.includes(student.id)) return student;

    const ownStudentId = await currentStudentId(auth);
    if (ownStudentId === student.id) return student;
  }

  return null;
}
