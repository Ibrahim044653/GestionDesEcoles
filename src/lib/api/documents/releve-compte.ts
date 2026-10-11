import { getAuthContext } from "@/lib/auth/guard";
import { generateStudentStatementPdf } from "@/lib/pdf/documents";
import { pdfResponse, unauthorized, notFound, resolveAccessibleStudent } from "@/lib/api/document-helpers";

/**
 * Releve de compte d'un eleve.
 * Reserve au personnel habilite et au parent autorise sur la facturation.
 */
export async function GET(request: Request, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const student = await resolveAccessibleStudent(auth, studentId, { requireFinance: true });
  if (!student) return notFound("Releve introuvable.");

  const academicYearId = new URL(request.url).searchParams.get("annee") ?? undefined;
  const buffer = await generateStudentStatementPdf(student.schoolId, student.id, academicYearId);

  return pdfResponse(buffer, `releve-compte-${studentId}.pdf`);
}
