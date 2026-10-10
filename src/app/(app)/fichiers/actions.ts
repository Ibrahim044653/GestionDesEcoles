"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool, currentStudentId } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ConflictError, NotFoundError, ValidationError, type ActionResult } from "@/lib/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { storeUploadedFile, deleteStoredFile } from "@/lib/storage";
import { recordAudit } from "@/lib/audit";

/**
 * Televersements.
 *
 * Toutes ces actions s'appuient sur `storeUploadedFile`, qui verifie la taille
 * et le type REEL du fichier (signature binaire, pas l'extension) et l'ecrit
 * hors de la racine web. L'acces ulterieur passe par /api/files/[id].
 */

/** Recupere le fichier du formulaire, ou leve une erreur explicite. */
function requireFile(formData: FormData, champ = "file"): File {
  const file = formData.get(champ);
  if (!(file instanceof File) || file.size === 0) {
    throw new ValidationError("Aucun fichier n'a ete selectionne.", {
      [champ]: ["Choisissez un fichier."],
    });
  }
  return file;
}

/** Logo de l'etablissement (visible sur les documents officiels). */
export async function uploadSchoolLogoAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_UPDATE);
    await consumeRateLimit(`upload:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const file = requireFile(formData);

    const stored = await storeUploadedFile({
      file,
      schoolId: context.school.id,
      kind: "LOGO",
      // Le logo figure sur des documents remis aux familles.
      visibility: "PUBLIC_SCHOOL",
      uploadedById: context.user.id,
    });

    const previous = await prisma.school.findUnique({
      where: { id: context.school.id },
      select: { logoDocumentId: true },
    });

    await prisma.school.update({
      where: { id: context.school.id },
      data: { logoDocumentId: stored.documentId },
    });

    // L'ancien logo n'a plus d'usage : on libere l'espace disque.
    if (previous?.logoDocumentId) await deleteStoredFile(previous.logoDocumentId);

    revalidatePath("/parametres");
    return ok({ documentId: stored.documentId }, "Logo enregistre.");
  } catch (error) {
    return fail(error);
  }
}

/** Photographie d'un eleve (carte scolaire, dossier). */
export async function uploadStudentPhotoAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_UPDATE);
    await consumeRateLimit(`upload:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const studentId = String(formData.get("studentId") ?? "");
    const file = requireFile(formData);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true, photoDocumentId: true },
    });
    await assertSameSchool(context, student, "student");

    if (!file.type.startsWith("image/")) {
      throw new ValidationError("La photo doit etre une image (JPEG, PNG ou WebP).", {
        file: ["Format d'image attendu."],
      });
    }

    const stored = await storeUploadedFile({
      file,
      schoolId: context.school.id,
      kind: "PHOTO",
      visibility: "GUARDIAN",
      uploadedById: context.user.id,
      studentId,
    });

    await prisma.student.update({
      where: { id: studentId },
      data: { photoDocumentId: stored.documentId },
    });

    if (student!.photoDocumentId) await deleteStoredFile(student!.photoDocumentId);

    revalidatePath(`/eleves/${studentId}`);
    return ok({ documentId: stored.documentId }, "Photo enregistree.");
  } catch (error) {
    return fail(error);
  }
}

/** Document rattache au dossier d'un eleve (acte de naissance, bulletin anterieur...). */
export async function uploadStudentDocumentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_UPDATE);
    await consumeRateLimit(`upload:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const studentId = String(formData.get("studentId") ?? "");
    const kind = String(formData.get("kind") ?? "AUTRE");
    const file = requireFile(formData);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, student, "student");

    const stored = await storeUploadedFile({
      file,
      schoolId: context.school.id,
      kind,
      visibility: "STAFF",
      uploadedById: context.user.id,
      studentId,
    });

    revalidatePath(`/eleves/${studentId}`);
    return ok({ documentId: stored.documentId }, "Document ajoute au dossier.");
  } catch (error) {
    return fail(error);
  }
}

/** Piece jointe a un devoir (enonce, support). */
export async function uploadAssignmentAttachmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.ASSIGNMENT_MANAGE);
    await consumeRateLimit(`upload:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const assignmentId = String(formData.get("assignmentId") ?? "");
    const file = requireFile(formData);

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, assignment, "assignment");

    const stored = await storeUploadedFile({
      file,
      schoolId: context.school.id,
      kind: "DEVOIR",
      // Les eleves et leurs parents doivent pouvoir ouvrir l'enonce.
      visibility: "STUDENT",
      uploadedById: context.user.id,
      assignmentId,
    });

    revalidatePath("/pedagogie/devoirs");
    return ok({ documentId: stored.documentId }, "Piece jointe ajoutee au devoir.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Publication du corrige d'un devoir.
 *
 * Volontairement separee de l'enonce : le corrige n'est diffuse qu'une fois la
 * date limite passee, ce que l'action verifie.
 */
export async function publishAssignmentSolutionAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ASSIGNMENT_MANAGE);
    await consumeRateLimit(`upload:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const assignmentId = String(formData.get("assignmentId") ?? "");
    const file = requireFile(formData);

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, schoolId: true, dueAt: true, solutionDocumentId: true },
    });
    await assertSameSchool(context, assignment, "assignment");

    if (assignment!.dueAt.getTime() > Date.now()) {
      throw new ConflictError(
        "La date limite de remise n'est pas encore passee : publier le corrige maintenant le " +
          "rendrait accessible aux eleves qui n'ont pas encore rendu leur travail.",
      );
    }

    const stored = await storeUploadedFile({
      file,
      schoolId: context.school.id,
      kind: "DEVOIR",
      visibility: "STUDENT",
      uploadedById: context.user.id,
      assignmentId,
    });

    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { solutionDocumentId: stored.documentId, solutionPublishedAt: new Date() },
    });

    if (assignment!.solutionDocumentId) await deleteStoredFile(assignment!.solutionDocumentId);

    revalidatePath("/pedagogie/devoirs");
    revalidatePath("/eleve");
    return ok(undefined, "Corrige publie : les eleves de la classe peuvent le consulter.");
  } catch (error) {
    return fail(error);
  }
}

/** Depot d'un fichier par un eleve en complement de sa remise. */
export async function uploadSubmissionAttachmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.ASSIGNMENT_SUBMIT);
    await consumeRateLimit(`upload:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const assignmentId = String(formData.get("assignmentId") ?? "");
    const file = requireFile(formData);

    const studentId = await currentStudentId(context);
    if (!studentId) throw new NotFoundError("Profil eleve introuvable.");

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, schoolId: true, status: true, dueAt: true, classRoomId: true },
    });
    await assertSameSchool(context, assignment, "assignment");

    if (assignment!.status !== "PUBLISHED") {
      throw new ConflictError("Ce devoir n'est pas ouvert aux remises.");
    }

    // L'eleve doit etre inscrit dans la classe visee.
    const enrolled = await prisma.enrollment.findFirst({
      where: { studentId, classRoomId: assignment!.classRoomId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!enrolled) throw new NotFoundError("Ce devoir ne concerne pas votre classe.");

    const late = Date.now() > assignment!.dueAt.getTime();

    const submission = await prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      create: {
        assignmentId,
        studentId,
        status: late ? "EN_RETARD" : "REMIS",
        submittedAt: new Date(),
      },
      update: { status: late ? "EN_RETARD" : "REMIS", submittedAt: new Date() },
      select: { id: true },
    });

    const stored = await storeUploadedFile({
      file,
      schoolId: context.school.id,
      kind: "REMISE",
      visibility: "STUDENT",
      uploadedById: context.user.id,
      studentId,
      submissionId: submission.id,
    });

    revalidatePath("/eleve");
    return ok(
      { documentId: stored.documentId },
      late
        ? "Fichier remis apres la date limite : la remise est marquee en retard."
        : "Fichier remis.",
    );
  } catch (error) {
    return fail(error);
  }
}

/** Piece justificative d'une depense (facture, recu fournisseur). */
export async function uploadExpenseAttachmentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ documentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.EXPENSE_CREATE);
    await consumeRateLimit(`upload:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const expenseId = String(formData.get("expenseId") ?? "");
    const file = requireFile(formData);

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, expense, "expense");

    const stored = await storeUploadedFile({
      file,
      schoolId: context.school.id,
      kind: "PIECE_DEPENSE",
      visibility: "STAFF",
      uploadedById: context.user.id,
      expenseId,
    });

    revalidatePath("/finance/depenses");
    return ok({ documentId: stored.documentId }, "Piece justificative ajoutee.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Suppression logique d'un document.
 * Le fichier disque est retire, l'enregistrement est marque supprime et
 * l'operation est tracee.
 */
export async function deleteDocumentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_UPDATE);
    const documentId = String(formData.get("documentId") ?? "");

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, schoolId: true, fileName: true, studentId: true },
    });
    await assertSameSchool(context, document, "document");

    await deleteStoredFile(documentId);

    await recordAudit({
      action: "document.deleted",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "document",
      entityId: documentId,
      metadata: { fileName: document!.fileName },
    });

    if (document!.studentId) revalidatePath(`/eleves/${document!.studentId}`);
    return ok(undefined, "Document supprime.");
  } catch (error) {
    return fail(error);
  }
}
