import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

/**
 * Export complet des donnees d'un etablissement, en un seul fichier JSON.
 *
 * Objectif : la REVERSIBILITE. Un etablissement qui quitte la plateforme doit
 * pouvoir repartir avec ses donnees dans un format lisible et reimportable,
 * sans dependre de l'editeur.
 *
 * Ce qui est volontairement EXCLU :
 *  - les empreintes de mots de passe, jetons de session et jetons de
 *    reinitialisation : ce sont des secrets d'authentification, pas des
 *    donnees de l'ecole ; les exporter creerait un fichier dont la fuite
 *    compromettrait des comptes ;
 *  - le contenu binaire des fichiers televerses : seules les metadonnees des
 *    documents figurent ici, les fichiers eux-memes se recuperent par
 *    sauvegarde du repertoire de stockage (voir docs/DEPLOIEMENT.md).
 *
 * L'export est reserve aux profils habilites a modifier l'etablissement, et
 * l'operation est tracee : un export complet est un evenement sensible.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (
    !auth.permissions.has(PERMISSIONS.SCHOOL_UPDATE) ||
    !auth.permissions.has(PERMISSIONS.REPORT_EXPORT)
  ) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const schoolId = auth.school.id;
  const where = { schoolId };

  const [
    school,
    academicYears,
    cycles,
    levels,
    tracks,
    classRooms,
    subjects,
    teachingUnits,
    classSubjects,
    gradingPeriods,
    students,
    guardians,
    studentGuardians,
    enrollments,
    staff,
    memberships,
    evaluations,
    grades,
    gradeRevisions,
    reportCards,
    subjectAppreciations,
    attendances,
    assignments,
    submissions,
    timetableSlots,
    feeItems,
    feeAssignments,
    discounts,
    installments,
    payments,
    paymentAllocations,
    receipts,
    paymentProofs,
    refunds,
    ledgerAccounts,
    journalEntries,
    journalLines,
    accountingPeriods,
    financialAccounts,
    reconciliations,
    expenseCategories,
    suppliers,
    expenses,
    budgets,
    documents,
    announcements,
    documentRequests,
    appointmentRequests,
    staffAttendances,
    staffLeaves,
  ] = await Promise.all([
    prisma.school.findUniqueOrThrow({ where: { id: schoolId } }),
    prisma.academicYear.findMany({ where }),
    prisma.cycle.findMany({ where }),
    prisma.level.findMany({ where }),
    prisma.track.findMany({ where }),
    prisma.classRoom.findMany({ where }),
    prisma.subject.findMany({ where }),
    prisma.teachingUnit.findMany({ where }),
    prisma.classSubject.findMany({ where: { classRoom: { schoolId } } }),
    prisma.gradingPeriod.findMany({ where }),
    prisma.student.findMany({ where }),
    prisma.guardian.findMany({ where }),
    prisma.studentGuardian.findMany({ where: { student: { schoolId } } }),
    prisma.enrollment.findMany({ where }),
    prisma.staff.findMany({ where }),
    // Les rattachements sont exportes SANS le compte : ni mot de passe, ni
    // jeton. Seules l'identite et le role sont utiles a une reprise.
    prisma.membership.findMany({
      where,
      select: {
        id: true,
        userId: true,
        status: true,
        overrides: true,
        isDefault: true,
        createdAt: true,
        role: { select: { code: true, name: true } },
        user: { select: { email: true, firstName: true, lastName: true, phone: true } },
      },
    }),
    prisma.evaluation.findMany({ where }),
    prisma.grade.findMany({ where }),
    prisma.gradeRevision.findMany({ where: { grade: { schoolId } } }),
    prisma.reportCard.findMany({ where: { student: { schoolId } } }),
    prisma.subjectAppreciation.findMany({ where }),
    prisma.attendance.findMany({ where }),
    prisma.assignment.findMany({ where }),
    prisma.submission.findMany({ where: { assignment: { schoolId } } }),
    prisma.timetableSlot.findMany({ where }),
    prisma.feeItem.findMany({ where }),
    prisma.feeAssignment.findMany({ where }),
    prisma.discount.findMany({ where: { feeAssignment: { schoolId } } }),
    prisma.installment.findMany({ where }),
    prisma.payment.findMany({ where }),
    prisma.paymentAllocation.findMany({ where: { payment: { schoolId } } }),
    prisma.receipt.findMany({ where: { payment: { schoolId } } }),
    prisma.paymentProof.findMany({ where }),
    prisma.refund.findMany({ where }),
    prisma.ledgerAccount.findMany({ where }),
    prisma.journalEntry.findMany({ where }),
    prisma.journalLine.findMany({ where: { entry: { schoolId } } }),
    prisma.accountingPeriod.findMany({ where }),
    prisma.financialAccount.findMany({ where }),
    prisma.bankReconciliation.findMany({ where: { financialAccount: { schoolId } } }),
    prisma.expenseCategory.findMany({ where }),
    prisma.supplier.findMany({ where }),
    prisma.expense.findMany({ where }),
    prisma.budget.findMany({ where }),
    // Metadonnees uniquement : le contenu des fichiers n'est pas inline.
    prisma.document.findMany({
      where,
      select: {
        id: true,
        kind: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        visibility: true,
        studentId: true,
        createdAt: true,
      },
    }),
    prisma.announcement.findMany({ where }),
    prisma.documentRequest.findMany({ where }),
    prisma.appointmentRequest.findMany({ where }),
    prisma.staffAttendance.findMany({ where: { staff: { schoolId } } }),
    prisma.staffLeave.findMany({ where: { staff: { schoolId } } }),
  ]);

  const archive = {
    format: "gestion-ecole/export-etablissement",
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: auth.user.email,
    avertissement:
      "Ce fichier contient des donnees personnelles d'eleves, de familles et de personnel. " +
      "Il doit etre conserve et transmis de maniere securisee. Les mots de passe et jetons " +
      "d'authentification n'y figurent pas. Le contenu binaire des fichiers televerses n'y " +
      "figure pas non plus : sauvegardez separement le repertoire de stockage.",
    school,
    structure: {
      academicYears,
      cycles,
      levels,
      tracks,
      classRooms,
      subjects,
      teachingUnits,
      classSubjects,
      gradingPeriods,
    },
    personnes: { students, guardians, studentGuardians, enrollments, staff, memberships },
    pedagogie: {
      evaluations,
      grades,
      gradeRevisions,
      reportCards,
      subjectAppreciations,
      attendances,
      assignments,
      submissions,
      timetableSlots,
    },
    finances: {
      feeItems,
      feeAssignments,
      discounts,
      installments,
      payments,
      paymentAllocations,
      receipts,
      paymentProofs,
      refunds,
    },
    comptabilite: {
      ledgerAccounts,
      journalEntries,
      journalLines,
      accountingPeriods,
      financialAccounts,
      reconciliations,
      expenseCategories,
      suppliers,
      expenses,
      budgets,
    },
    communication: { announcements, documentRequests, appointmentRequests },
    rh: { staffAttendances, staffLeaves },
    documents,
  };

  await recordAudit({
    action: "school.full_export",
    schoolId,
    userId: auth.user.id,
    entityType: "school",
    entityId: schoolId,
    metadata: {
      eleves: students.length,
      paiements: payments.length,
      ecritures: journalEntries.length,
    },
  });

  const fileName = `export-${school.code}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(archive, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
