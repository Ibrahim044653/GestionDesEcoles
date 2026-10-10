"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { OPTIONAL_MODULES } from "@/lib/constants";
import { fail, ok, ConflictError, ValidationError, type ActionResult } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { closeLoan, lendItem, DEFAULT_LOAN_DAYS } from "@/lib/domain/library";

/**
 * Module bibliotheque.
 *
 * Chaque action verifie d'abord que le module est ACTIVE pour cet
 * etablissement. Une ecole qui n'a pas souscrit au module ne doit pas pouvoir
 * y ecrire en appelant l'action directement : masquer l'entree de menu ne
 * suffit pas.
 */
async function requireLibraryModule() {
  const context = await requirePermission(PERMISSIONS.STUDENT_VIEW);

  const school = await prisma.school.findUniqueOrThrow({
    where: { id: context.school.id },
    select: { enabledModules: true },
  });

  let modules: string[] = [];
  try {
    const parsed = JSON.parse(school.enabledModules || "[]");
    modules = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    modules = [];
  }

  if (!modules.includes(OPTIONAL_MODULES.BIBLIOTHEQUE)) {
    throw new ConflictError(
      "Le module Bibliotheque n'est pas active pour cet etablissement. Activez-le dans les parametres.",
    );
  }

  return context;
}

const ITEM_KINDS = ["LIVRE", "MANUEL", "REVUE", "MULTIMEDIA", "AUTRE"];

/** Ajoute ou met a jour un ouvrage du fonds. */
export async function saveLibraryItemAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ itemId: string }>> {
  try {
    const context = await requireLibraryModule();

    const itemId = String(formData.get("itemId") ?? "").trim();
    const reference = String(formData.get("reference") ?? "").trim().slice(0, 50);
    const title = String(formData.get("title") ?? "").trim().slice(0, 300);
    const kind = String(formData.get("kind") ?? "LIVRE");

    if (!reference) {
      throw new ValidationError("La cote est obligatoire.", {
        reference: ["Indiquez une cote ou un code interne."],
      });
    }
    if (!title) {
      throw new ValidationError("Le titre est obligatoire.", { title: ["Indiquez un titre."] });
    }
    if (!ITEM_KINDS.includes(kind)) throw new ValidationError(`Type inconnu : ${kind}.`);

    const totalCopies = Math.max(
      1,
      Math.min(10_000, Number.parseInt(String(formData.get("totalCopies") ?? "1"), 10) || 1),
    );

    const data = {
      reference,
      title,
      kind,
      author: String(formData.get("author") ?? "").slice(0, 200),
      publisher: String(formData.get("publisher") ?? "").slice(0, 200),
      isbn: String(formData.get("isbn") ?? "").slice(0, 20),
      category: String(formData.get("category") ?? "").slice(0, 100),
      shelf: String(formData.get("shelf") ?? "").slice(0, 50),
      notes: String(formData.get("notes") ?? "").slice(0, 500),
      totalCopies,
    };

    // Cote deja prise : message explicite plutot qu'une erreur de contrainte.
    const clash = await prisma.libraryItem.findFirst({
      where: { schoolId: context.school.id, reference, ...(itemId ? { id: { not: itemId } } : {}) },
      select: { id: true, title: true },
    });
    if (clash) {
      throw new ValidationError(`La cote « ${reference} » est deja utilisee par « ${clash.title} ».`, {
        reference: ["Cette cote existe deja."],
      });
    }

    let savedId: string;

    if (itemId) {
      const existing = await prisma.libraryItem.findUnique({
        where: { id: itemId },
        select: { id: true, schoolId: true },
      });
      if (!existing || existing.schoolId !== context.school.id) {
        throw new ValidationError("Ouvrage introuvable.");
      }

      // Reduire le fonds sous le nombre d'exemplaires actuellement pretes
      // rendrait la disponibilite incoherente.
      const active = await prisma.libraryLoan.count({ where: { itemId, status: "EN_COURS" } });
      if (totalCopies < active) {
        throw new ValidationError(
          `${active} exemplaire(s) sont actuellement pretes : le fonds ne peut pas descendre en dessous.`,
          { totalCopies: [`Minimum : ${active}.`] },
        );
      }

      await prisma.libraryItem.update({ where: { id: itemId }, data });
      savedId = itemId;
    } else {
      const created = await prisma.libraryItem.create({
        data: { ...data, schoolId: context.school.id },
        select: { id: true },
      });
      savedId = created.id;
    }

    await recordAudit({
      action: itemId ? "library.item_updated" : "library.item_created",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "libraryItem",
      entityId: savedId,
      metadata: { cote: reference, titre: title, exemplaires: totalCopies },
    });

    revalidatePath("/bibliotheque");
    return ok({ itemId: savedId }, itemId ? "Ouvrage mis a jour." : "Ouvrage ajoute au fonds.");
  } catch (error) {
    return fail(error);
  }
}

/** Retire un ouvrage du fonds sans effacer son historique de prets. */
export async function retireLibraryItemAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requireLibraryModule();

    const itemId = String(formData.get("itemId") ?? "");
    const item = await prisma.libraryItem.findUnique({
      where: { id: itemId },
      select: { id: true, schoolId: true, title: true },
    });

    if (!item || item.schoolId !== context.school.id) {
      throw new ValidationError("Ouvrage introuvable.");
    }

    const active = await prisma.libraryLoan.count({ where: { itemId, status: "EN_COURS" } });
    if (active > 0) {
      throw new ConflictError(
        `${active} exemplaire(s) sont encore pretes : attendez leur retour avant de retirer cet ouvrage.`,
      );
    }

    // Desactivation, pas suppression : l'historique des prets reste lisible.
    await prisma.libraryItem.update({ where: { id: itemId }, data: { isActive: false } });

    await recordAudit({
      action: "library.item_retired",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "libraryItem",
      entityId: itemId,
      metadata: { titre: item.title },
    });

    revalidatePath("/bibliotheque");
    return ok(undefined, "Ouvrage retire du fonds. Son historique de prets est conserve.");
  } catch (error) {
    return fail(error);
  }
}

/** Enregistre un pret. */
export async function lendItemAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ loanId: string }>> {
  try {
    const context = await requireLibraryModule();

    const borrower = String(formData.get("borrower") ?? "");
    const dueDateRaw = String(formData.get("dueDate") ?? "").trim();

    // Sans date saisie, la duree standard s'applique. Le calcul est fait cote
    // serveur : l'horloge du poste emprunteur n'intervient pas.
    const dueDate = dueDateRaw
      ? new Date(`${dueDateRaw}T00:00:00.000Z`)
      : new Date(Date.now() + DEFAULT_LOAN_DAYS * 86_400_000);

    const result = await lendItem({
      schoolId: context.school.id,
      itemId: String(formData.get("itemId") ?? ""),
      studentId: borrower.startsWith("student:") ? borrower.slice(8) : null,
      staffId: borrower.startsWith("staff:") ? borrower.slice(6) : null,
      dueDate,
      notes: String(formData.get("notes") ?? ""),
      userId: context.user.id,
    });

    revalidatePath("/bibliotheque");
    return ok(result, `Pret enregistre. Retour attendu le ${dueDate.toLocaleDateString("fr-FR")}.`);
  } catch (error) {
    return fail(error);
  }
}

/** Cloture un pret : retour ou perte declaree. */
export async function closeLoanAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requireLibraryModule();

    const status = String(formData.get("status") ?? "RENDU");
    if (status !== "RENDU" && status !== "PERDU") {
      throw new ValidationError(`Statut inconnu : ${status}.`);
    }

    await closeLoan({
      schoolId: context.school.id,
      loanId: String(formData.get("loanId") ?? ""),
      status,
      condition: String(formData.get("condition") ?? ""),
      userId: context.user.id,
    });

    revalidatePath("/bibliotheque");
    return ok(
      undefined,
      status === "RENDU" ? "Retour enregistre." : "Perte enregistree. Le pret reste a l'historique.",
    );
  } catch (error) {
    return fail(error);
  }
}
