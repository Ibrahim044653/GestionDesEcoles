import { getAuthContext } from "@/lib/auth/guard";
import { generateEnrollmentCertificatePdf } from "@/lib/pdf/documents";
import { pdfResponse, unauthorized, notFound, resolveAccessibleStudent } from "../../_helpers";

/** Certificat de scolarite au format PDF. */
export async function GET(_request: Request, context: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await context.params;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const student = await resolveAccessibleStudent(auth, studentId);
  if (!student) return notFound("Certificat introuvable.");

  const buffer = await generateEnrollmentCertificatePdf(student.schoolId, student.id);
  return pdfResponse(buffer, `certificat-scolarite-${studentId}.pdf`);
}
