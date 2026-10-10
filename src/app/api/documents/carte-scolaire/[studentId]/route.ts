import { getAuthContext } from "@/lib/auth/guard";
import { generateStudentCardPdf } from "@/lib/pdf/documents";
import { pdfResponse, unauthorized, notFound, resolveAccessibleStudent } from "../../_helpers";

/** Carte scolaire au format PDF. */
export async function GET(_request: Request, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const student = await resolveAccessibleStudent(auth, studentId);
  if (!student) return notFound("Carte introuvable.");

  const buffer = await generateStudentCardPdf(student.schoolId, student.id);
  return pdfResponse(buffer, `carte-scolaire-${studentId}.pdf`);
}
