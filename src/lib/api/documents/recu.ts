import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, guardianStudentIds } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { generateReceiptPdf } from "@/lib/pdf/documents";
import { pdfResponse, unauthorized, forbidden } from "@/lib/api/document-helpers";

/**
 * Recu de paiement au format PDF.
 * Accessible au personnel habilite et au parent de l'eleve concerne.
 */
export async function GET(_request: Request, context: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await context.params;
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.school) return forbidden();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, schoolId: true, studentId: true, reference: true, receipt: { select: { number: true } } },
  });

  // Tenant d'abord : un recu d'une autre ecole n'existe pas pour cet utilisateur.
  if (!payment || payment.schoolId !== auth.school.id) {
    return NextResponse.json({ error: "Recu introuvable." }, { status: 404 });
  }

  const isStaff = auth.permissions.has(PERMISSIONS.PAYMENT_VIEW);
  let allowed = isStaff;

  if (!allowed && auth.permissions.has(PERMISSIONS.RECEIPT_VIEW_OWN)) {
    const ownStudents = await guardianStudentIds(auth, { requireFinance: true });
    allowed = ownStudents.includes(payment.studentId);
  }

  if (!allowed) return NextResponse.json({ error: "Recu introuvable." }, { status: 404 });

  const buffer = await generateReceiptPdf(auth.school.id, payment.id);
  return pdfResponse(buffer, `recu-${payment.receipt?.number ?? payment.reference}.pdf`);
}
