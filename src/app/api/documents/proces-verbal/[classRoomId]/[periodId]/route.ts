import { prisma } from "@/lib/prisma";
import { getAuthContext, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES } from "@/lib/constants";
import { generateCouncilMinutesPdf } from "@/lib/pdf/documents";
import { pdfResponse, unauthorized, notFound } from "../../../_helpers";

/**
 * Proces-verbal de deliberation du conseil de classe.
 *
 * Document interne : reserve au personnel habilite a generer les bulletins.
 * Les parents et les eleves n'y ont pas acces (il contient les decisions et
 * les rangs de TOUS les eleves de la classe). Un enseignant ne peut l'editer
 * que pour les classes qui lui sont affectees.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ classRoomId: string; periodId: string }> },
) {
  const { classRoomId, periodId } = await context.params;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.school) return notFound();

  if (!auth.permissions.has(PERMISSIONS.REPORTCARD_GENERATE)) return notFound();

  const classRoom = await prisma.classRoom.findUnique({
    where: { id: classRoomId },
    select: { id: true, schoolId: true, code: true },
  });

  if (!classRoom || classRoom.schoolId !== auth.school.id) return notFound("Classe introuvable.");

  if (auth.membership?.roleCode === ROLES.TEACHER) {
    const scope = await teacherScope(auth);
    if (!scope.classRoomIds.includes(classRoom.id)) return notFound("Classe introuvable.");
  }

  const buffer = await generateCouncilMinutesPdf(auth.school.id, classRoom.id, periodId);
  return pdfResponse(buffer, `pv-conseil-${classRoom.code}.pdf`);
}
