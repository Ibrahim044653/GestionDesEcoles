import { getAuthContext } from "@/lib/auth/guard";
import { generateReportCardPdf } from "@/lib/pdf/documents";
import { NotFoundError } from "@/lib/errors";
import { pdfResponse, unauthorized, notFound, resolveAccessibleStudent } from "../../../_helpers";

/**
 * Bulletin de notes au format PDF.
 * Un parent n'y accede que si son autorisation « consulter les notes » est
 * active sur l'eleve concerne.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ studentId: string; periodId: string }> },
) {
  const { studentId, periodId } = await context.params;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const student = await resolveAccessibleStudent(auth, studentId, { requireGrades: true });
  if (!student) return notFound("Bulletin introuvable.");

  try {
    const buffer = await generateReportCardPdf(student.schoolId, student.id, periodId);
    return pdfResponse(buffer, `bulletin-${studentId}.pdf`);
  } catch (error) {
    if (error instanceof NotFoundError) return notFound(error.message);
    throw error;
  }
}
