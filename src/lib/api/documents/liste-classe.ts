import { prisma } from "@/lib/prisma";
import { getAuthContext, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES } from "@/lib/constants";
import { generateClassListPdf } from "@/lib/pdf/documents";
import { pdfResponse, unauthorized, notFound } from "@/lib/api/document-helpers";

/**
 * Liste de classe (feuille d'appel / emargement).
 * Un enseignant ne peut editer que la liste des classes qui lui sont affectees.
 */
export async function GET(_request: Request, context: { params: Promise<{ classRoomId: string }> }) {
  const { classRoomId } = await context.params;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.school) return notFound();

  if (!auth.permissions.has(PERMISSIONS.STUDENT_VIEW)) return notFound();

  const classRoom = await prisma.classRoom.findUnique({
    where: { id: classRoomId },
    select: { id: true, schoolId: true, code: true },
  });

  if (!classRoom || classRoom.schoolId !== auth.school.id) return notFound("Classe introuvable.");

  if (auth.membership?.roleCode === ROLES.TEACHER) {
    const scope = await teacherScope(auth);
    if (!scope.classRoomIds.includes(classRoom.id)) return notFound("Classe introuvable.");
  }

  const buffer = await generateClassListPdf(auth.school.id, classRoom.id);
  return pdfResponse(buffer, `liste-${classRoom.code}.pdf`);
}
