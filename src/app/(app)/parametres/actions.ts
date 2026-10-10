"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import {
  parseFormData,
  schoolSchema,
  academicYearSchema,
  classRoomSchema,
  subjectSchema,
} from "@/lib/validation";
import { fail, ok, ConflictError, type ActionResult } from "@/lib/errors";
import { translateUniqueViolation } from "@/lib/domain/sequences";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { OPTIONAL_MODULES } from "@/lib/constants";

/** Configuration de l'etablissement. */

export async function updateSchoolAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_UPDATE);
    const input = parseFormData(schoolSchema, formData);

    // Modules optionnels : cases cochees dans le formulaire.
    const enabledModules = Object.values(OPTIONAL_MODULES).filter(
      (moduleCode) => formData.get(`module_${moduleCode}`) === "on",
    );

    await prisma.school
      .update({
        where: { id: context.school.id },
        data: {
          name: input.name,
          code: input.code.toUpperCase(),
          type: input.type,
          address: input.address,
          city: input.city,
          country: input.country.toUpperCase(),
          phone: input.phone,
          email: input.email,
          website: input.website,
          currency: input.currency.toUpperCase(),
          locale: input.locale,
          matriculePattern: input.matriculePattern,
          enabledModules: JSON.stringify(enabledModules),
        },
      })
      .catch((error) =>
        translateUniqueViolation(error, "Ce code d'etablissement est deja utilise."),
      );

    revalidatePath("/parametres");
    return ok(undefined, "Parametres de l'etablissement enregistres.");
  } catch (error) {
    return fail(error);
  }
}

/** Reglages pedagogiques (bareme, absences, classement, moyenne de passage). */
export async function updateGradingSettingsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);

    const maxScore = Number.parseInt(String(formData.get("maxScore") ?? "20"), 10) || 20;
    const passMark = Number.parseFloat(String(formData.get("passMark") ?? "10").replace(",", "."));

    const settings = {
      maxScore,
      absenceRule: formData.get("absenceRule") === "ZERO" ? "ZERO" : "EXCLURE",
      excusedAlwaysExcluded: formData.get("excusedAlwaysExcluded") === "on",
      rankingEnabled: formData.get("rankingEnabled") === "on",
      passMarkCenti: Math.round((Number.isFinite(passMark) ? passMark : 10) * 100),
    };

    await prisma.school.update({
      where: { id: context.school.id },
      data: { gradingSettings: JSON.stringify(settings) },
    });

    revalidatePath("/parametres/pedagogie");
    return ok(
      undefined,
      "Reglages pedagogiques enregistres. Ils s'appliquent aux prochains calculs de moyennes ; " +
        "les bulletins deja generes conservent leurs valeurs figees.",
    );
  } catch (error) {
    return fail(error);
  }
}

export async function createAcademicYearAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);
    const input = parseFormData(academicYearSchema, formData);

    await prisma.$transaction(async (tx) => {
      // Une seule annee peut etre "en cours".
      if (input.isCurrent) {
        await tx.academicYear.updateMany({
          where: { schoolId: context.school.id },
          data: { isCurrent: false },
        });
      }

      await tx.academicYear
        .create({
          data: {
            schoolId: context.school.id,
            name: input.name,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            isCurrent: input.isCurrent,
          },
        })
        .catch((error) => translateUniqueViolation(error, "Cette annee scolaire existe deja."));
    });

    revalidatePath("/parametres/annees");
    return ok(undefined, "Annee scolaire creee.");
  } catch (error) {
    return fail(error);
  }
}

/** Cloture d'une annee scolaire : plus aucune inscription ni frais. */
export async function closeAcademicYearAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);
    const academicYearId = String(formData.get("academicYearId") ?? "");

    const year = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, schoolId: true, status: true, name: true },
    });
    await assertSameSchool(context, year, "academicYear");

    if (year!.status === "CLOSED") throw new ConflictError("Cette annee est deja cloturee.");

    await prisma.academicYear.update({
      where: { id: academicYearId },
      data: { status: "CLOSED", closedAt: new Date(), isCurrent: false },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.YEAR_CLOSED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "academicYear",
      entityId: academicYearId,
      metadata: { name: year!.name },
    });

    revalidatePath("/parametres/annees");
    return ok(
      undefined,
      `Annee ${year!.name} cloturee. Les donnees restent consultables et exportables.`,
    );
  } catch (error) {
    return fail(error);
  }
}

/** Creation d'une periode d'evaluation (trimestre, semestre). */
export async function createGradingPeriodAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);
    const academicYearId = String(formData.get("academicYearId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const kind = String(formData.get("kind") ?? "TRIMESTRE");
    const startDate = String(formData.get("startDate") ?? "");
    const endDate = String(formData.get("endDate") ?? "");
    const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "1"), 10) || 1;

    const year = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, year, "academicYear");

    await prisma.gradingPeriod
      .create({
        data: {
          schoolId: context.school.id,
          academicYearId,
          name,
          kind,
          sortOrder,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        },
      })
      .catch((error) =>
        translateUniqueViolation(error, "Une periode porte deja ce nom pour cette annee."),
      );

    revalidatePath("/parametres/annees");
    return ok(undefined, "Periode d'evaluation creee.");
  } catch (error) {
    return fail(error);
  }
}

export async function createLevelAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;

    await prisma.level
      .create({ data: { schoolId: context.school.id, code, name, sortOrder } })
      .catch((error) => translateUniqueViolation(error, "Ce code de niveau existe deja."));

    revalidatePath("/parametres/classes");
    return ok(undefined, "Niveau cree.");
  } catch (error) {
    return fail(error);
  }
}

export async function createClassRoomAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);
    const input = parseFormData(classRoomSchema, formData);

    const [level, year] = await Promise.all([
      prisma.level.findUnique({ where: { id: input.levelId }, select: { id: true, schoolId: true } }),
      prisma.academicYear.findUnique({
        where: { id: input.academicYearId },
        select: { id: true, schoolId: true, status: true },
      }),
    ]);

    await assertSameSchool(context, level, "level");
    await assertSameSchool(context, year, "academicYear");
    if (year!.status === "CLOSED") throw new ConflictError("Cette annee scolaire est cloturee.");

    await prisma.classRoom
      .create({
        data: {
          schoolId: context.school.id,
          academicYearId: input.academicYearId,
          levelId: input.levelId,
          trackId: input.trackId || null,
          name: input.name,
          code: input.code.toUpperCase(),
          capacity: input.capacity,
          roomLabel: input.roomLabel,
          mainTeacherId: input.mainTeacherId || null,
        },
      })
      .catch((error) =>
        translateUniqueViolation(error, "Une classe porte deja ce code pour cette annee."),
      );

    revalidatePath("/parametres/classes");
    return ok(undefined, "Classe creee.");
  } catch (error) {
    return fail(error);
  }
}

export async function createSubjectAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SUBJECT_MANAGE);
    const input = parseFormData(subjectSchema, formData);

    await prisma.subject
      .create({
        data: {
          schoolId: context.school.id,
          code: input.code.toUpperCase(),
          name: input.name,
          defaultCoefficient: input.defaultCoefficient,
          credits: input.credits,
          teachingUnitId: input.teachingUnitId || null,
        },
      })
      .catch((error) => translateUniqueViolation(error, "Ce code de matiere existe deja."));

    revalidatePath("/parametres/matieres");
    return ok(undefined, "Matiere creee.");
  } catch (error) {
    return fail(error);
  }
}

/** Creation d'une caisse ou d'un compte bancaire. */
export async function createFinancialAccountAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ACCOUNT_MANAGE);
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const kind = String(formData.get("kind") ?? "CAISSE");
    const bankName = String(formData.get("bankName") ?? "");
    const accountNumber = String(formData.get("accountNumber") ?? "");

    const ledgerAccountCode = kind === "BANQUE" ? "521" : kind === "MOBILE_MONEY" ? "531" : "571";

    await prisma.financialAccount
      .create({
        data: {
          schoolId: context.school.id,
          code,
          name,
          kind,
          bankName,
          accountNumber,
          currency: context.school.currency,
          ledgerAccountCode,
        },
      })
      .catch((error) => translateUniqueViolation(error, "Ce code de compte existe deja."));

    revalidatePath("/parametres/comptabilite");
    return ok(undefined, "Compte financier cree.");
  } catch (error) {
    return fail(error);
  }
}

/** Creation d'une categorie de depense, rattachee a un compte de charge. */
export async function createExpenseCategoryAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ACCOUNT_MANAGE);
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const defaultAccountCode = String(formData.get("defaultAccountCode") ?? "").trim();

    if (defaultAccountCode) {
      const account = await prisma.ledgerAccount.findFirst({
        where: { schoolId: context.school.id, code: defaultAccountCode },
        select: { id: true },
      });
      if (!account) {
        return {
          ok: false,
          error: "Compte comptable inconnu.",
          fieldErrors: { defaultAccountCode: ["Ce compte n'existe pas dans le plan comptable."] },
        };
      }
    }

    await prisma.expenseCategory
      .create({
        data: { schoolId: context.school.id, code, name, defaultAccountCode },
      })
      .catch((error) => translateUniqueViolation(error, "Cette categorie existe deja."));

    revalidatePath("/parametres/comptabilite");
    return ok(undefined, "Categorie de depense creee.");
  } catch (error) {
    return fail(error);
  }
}

/** Creation d'une periode comptable. */
export async function createAccountingPeriodAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ACCOUNT_MANAGE);
    const name = String(formData.get("name") ?? "").trim();
    const startDate = String(formData.get("startDate") ?? "");
    const endDate = String(formData.get("endDate") ?? "");

    if (new Date(endDate) <= new Date(startDate)) {
      return {
        ok: false,
        error: "Periode invalide.",
        fieldErrors: { endDate: ["La date de fin doit suivre la date de debut."] },
      };
    }

    await prisma.accountingPeriod
      .create({
        data: {
          schoolId: context.school.id,
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
        },
      })
      .catch((error) => translateUniqueViolation(error, "Cette periode comptable existe deja."));

    revalidatePath("/parametres/comptabilite");
    return ok(undefined, "Periode comptable creee.");
  } catch (error) {
    return fail(error);
  }
}

/** Creation d'un fournisseur. */
export async function createSupplierAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SUPPLIER_MANAGE);
    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();

    await prisma.supplier
      .create({
        data: {
          schoolId: context.school.id,
          code,
          name,
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          address: String(formData.get("address") ?? ""),
          taxId: String(formData.get("taxId") ?? ""),
        },
      })
      .catch((error) => translateUniqueViolation(error, "Ce code fournisseur existe deja."));

    revalidatePath("/parametres/comptabilite");
    return ok(undefined, "Fournisseur enregistre.");
  } catch (error) {
    return fail(error);
  }
}
