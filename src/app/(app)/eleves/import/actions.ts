"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import {
  previewStudentImport,
  commitStudentImport,
  type ImportPreview,
} from "@/lib/domain/student-import";

/**
 * Import d'eleves en deux temps : apercu puis validation.
 * L'apercu n'ecrit aucun eleve ; il produit uniquement un rapport.
 */

export async function previewImportAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_IMPORT);
    await consumeRateLimit(`import:${context.user.id}`, RATE_LIMITS.UPLOAD);

    const file = formData.get("file");
    const academicYearId = String(formData.get("academicYearId") ?? "");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Selectionnez un fichier CSV a importer.", {
        file: ["Aucun fichier selectionne."],
      });
    }
    if (file.size > env.storage.maxUploadBytes) {
      throw new ValidationError(
        `Fichier trop volumineux. Maximum ${Math.round(env.storage.maxUploadBytes / 1024 / 1024)} Mo.`,
      );
    }
    if (!academicYearId) {
      throw new ValidationError("Choisissez l'annee scolaire d'inscription.", {
        academicYearId: ["Annee scolaire obligatoire."],
      });
    }

    // Decodage tolerant : les fichiers Excel francais sont souvent en Windows-1252.
    const buffer = Buffer.from(await file.arrayBuffer());
    let content = buffer.toString("utf8");
    if (content.includes("�")) {
      content = new TextDecoder("windows-1252").decode(buffer);
    }

    const preview = await previewStudentImport({
      schoolId: context.school.id,
      userId: context.user.id,
      fileName: file.name,
      content,
      academicYearId,
    });

    return ok(
      preview,
      `${preview.totalRows} ligne(s) analysee(s) : ${preview.validRows} importable(s), ` +
        `${preview.errorRows} en erreur, ${preview.duplicateRows} doublon(s).`,
    );
  } catch (error) {
    return fail(error);
  }
}

export async function commitImportAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ imported: number; failures: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_IMPORT);
    const batchId = String(formData.get("batchId") ?? "");

    if (!batchId) throw new ValidationError("Apercu introuvable. Recommencez l'import.");

    const result = await commitStudentImport({
      schoolId: context.school.id,
      batchId,
      userId: context.user.id,
    });

    revalidatePath("/eleves");

    const message =
      result.failures.length > 0
        ? `${result.imported} eleve(s) importe(s). ${result.failures.length} ligne(s) ont echoue : ` +
          result.failures
            .slice(0, 3)
            .map((failure) => `ligne ${failure.line} (${failure.message})`)
            .join(", ")
        : `${result.imported} eleve(s) importe(s) avec succes.`;

    return ok({ imported: result.imported, failures: result.failures.length }, message);
  } catch (error) {
    return fail(error);
  }
}
