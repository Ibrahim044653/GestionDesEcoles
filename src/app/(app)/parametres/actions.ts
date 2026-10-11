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
import { fail, ok, ConflictError, ValidationError, type ActionResult } from "@/lib/errors";
import { parseAmountToMinor, currencyDecimals } from "@/lib/money";
import { translateUniqueViolation } from "@/lib/domain/sequences";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { createSchoolInOrganization } from "@/lib/domain/provisioning";
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

    const resitRuleRaw = String(formData.get("resitRule") ?? "MEILLEURE");
    const resitRule = ["IGNORER", "MEILLEURE", "REMPLACE"].includes(resitRuleRaw)
      ? resitRuleRaw
      : "MEILLEURE";

    // Un plafond vide signifie « pas de plafond » : il ne doit pas devenir 0,
    // ce qui annulerait toutes les notes de rattrapage.
    const resitCapRaw = String(formData.get("resitCap") ?? "").trim();
    const resitCap = resitCapRaw ? Number.parseFloat(resitCapRaw.replace(",", ".")) : null;

    const settings = {
      maxScore,
      absenceRule: formData.get("absenceRule") === "ZERO" ? "ZERO" : "EXCLURE",
      excusedAlwaysExcluded: formData.get("excusedAlwaysExcluded") === "on",
      rankingEnabled: formData.get("rankingEnabled") === "on",
      passMarkCenti: Math.round((Number.isFinite(passMark) ? passMark : 10) * 100),
      resitRule,
      resitCapCenti:
        resitCap !== null && Number.isFinite(resitCap) ? Math.round(resitCap * 100) : null,
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

/**
 * Creation d'une filiere (serie au lycee, parcours a l'universite).
 * `requiredCredits` n'a de sens que dans l'enseignement superieur : il sert au
 * suivi de la diplomation.
 */
export async function createTrackAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);

    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "0"), 10) || 0;
    const rawCredits = String(formData.get("requiredCredits") ?? "").trim();

    if (!code || !name) {
      throw new ValidationError("Le code et le libelle sont obligatoires.", {
        ...(code ? {} : { code: ["Le code est obligatoire."] }),
        ...(name ? {} : { name: ["Le libelle est obligatoire."] }),
      });
    }

    const requiredCredits = rawCredits === "" ? null : Number.parseInt(rawCredits, 10);
    if (requiredCredits !== null && (!Number.isFinite(requiredCredits) || requiredCredits < 0)) {
      throw new ValidationError("Nombre de credits invalide.", {
        requiredCredits: ["Indiquez un nombre entier positif, ou laissez vide."],
      });
    }

    await prisma.track
      .create({ data: { schoolId: context.school.id, code, name, sortOrder, requiredCredits } })
      .catch((error) => translateUniqueViolation(error, "Ce code de filiere existe deja."));

    revalidatePath("/parametres/classes");
    return ok(undefined, "Filiere creee.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Creation d'une unite d'enseignement (universite).
 * Les matieres rattachees a une UE jouent le role d'elements constitutifs.
 */
export async function createTeachingUnitAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SUBJECT_MANAGE);

    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const name = String(formData.get("name") ?? "").trim();
    const credits = Number.parseInt(String(formData.get("credits") ?? "0"), 10) || 0;
    const semester = Number.parseInt(String(formData.get("semester") ?? "1"), 10) || 1;
    const levelId = String(formData.get("levelId") ?? "") || null;
    const trackId = String(formData.get("trackId") ?? "") || null;

    if (!code || !name) {
      throw new ValidationError("Le code et l'intitule sont obligatoires.");
    }
    if (credits < 0 || credits > 60) {
      throw new ValidationError("Nombre de credits invalide.", {
        credits: ["Indiquez une valeur entre 0 et 60."],
      });
    }
    if (semester < 1 || semester > 12) {
      throw new ValidationError("Semestre invalide.", {
        semester: ["Indiquez un semestre entre 1 et 12."],
      });
    }

    // Les references facultatives doivent appartenir a l'etablissement.
    if (levelId) {
      const level = await prisma.level.findUnique({
        where: { id: levelId },
        select: { id: true, schoolId: true },
      });
      await assertSameSchool(context, level, "level");
    }
    if (trackId) {
      const track = await prisma.track.findUnique({
        where: { id: trackId },
        select: { id: true, schoolId: true },
      });
      await assertSameSchool(context, track, "track");
    }

    await prisma.teachingUnit
      .create({
        data: { schoolId: context.school.id, code, name, credits, semester, levelId, trackId },
      })
      .catch((error) =>
        translateUniqueViolation(error, "Ce code d'unite d'enseignement existe deja."),
      );

    revalidatePath("/parametres/matieres");
    return ok(undefined, "Unite d'enseignement creee.");
  } catch (error) {
    return fail(error);
  }
}

/** Rattache (ou detache) une matiere a une unite d'enseignement. */
export async function assignSubjectToUnitAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SUBJECT_MANAGE);
    const subjectId = String(formData.get("subjectId") ?? "");
    const teachingUnitId = String(formData.get("teachingUnitId") ?? "") || null;

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, subject, "subject");

    if (teachingUnitId) {
      const unit = await prisma.teachingUnit.findUnique({
        where: { id: teachingUnitId },
        select: { id: true, schoolId: true },
      });
      await assertSameSchool(context, unit, "teachingUnit");
    }

    await prisma.subject.update({ where: { id: subjectId }, data: { teachingUnitId } });

    revalidatePath("/parametres/matieres");
    return ok(
      undefined,
      teachingUnitId ? "Matiere rattachee a l'unite d'enseignement." : "Matiere detachee.",
    );
  } catch (error) {
    return fail(error);
  }
}

/**
 * Definit un budget previsionnel pour une categorie de depense.
 * Rejouable : un budget existant pour le meme libelle est mis a jour.
 */
export async function setBudgetAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CONFIGURE_FINANCE);

    const academicYearId = String(formData.get("academicYearId") ?? "");
    const label = String(formData.get("label") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim().toUpperCase();
    const plannedMinor = parseAmountToMinor(
      String(formData.get("planned") ?? ""),
      currencyDecimals(context.school.currency),
    );

    if (!label) {
      throw new ValidationError("Le libelle est obligatoire.", { label: ["Indiquez un libelle."] });
    }
    if (plannedMinor < 0) {
      throw new ValidationError("Le montant budgete ne peut pas etre negatif.", {
        planned: ["Indiquez un montant positif ou nul."],
      });
    }

    const year = await prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, year, "academicYear");

    // La categorie doit exister : sinon le rapprochement budget/realise serait vide.
    const existingCategory = await prisma.expenseCategory.findFirst({
      where: { schoolId: context.school.id, code: category },
      select: { id: true },
    });
    if (!existingCategory) {
      throw new ValidationError("Categorie de depense inconnue.", {
        category: ["Choisissez une categorie existante."],
      });
    }

    await prisma.budget.upsert({
      where: {
        schoolId_academicYearId_label: { schoolId: context.school.id, academicYearId, label },
      },
      create: {
        schoolId: context.school.id,
        academicYearId,
        label,
        category,
        plannedMinor,
        currency: context.school.currency,
      },
      update: { category, plannedMinor },
    });

    revalidatePath("/parametres/comptabilite");
    revalidatePath("/rapports");
    return ok(undefined, "Budget enregistre.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Ajout d'un etablissement dans l'organisation du proprietaire.
 *
 * L'organisation visee est DEDUITE de l'etablissement actif, jamais prise
 * dans le formulaire : sans cela, un identifiant forge permettrait d'ajouter
 * une ecole chez un autre client.
 */
export async function createSchoolAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ schoolId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.SCHOOL_CREATE);

    const current = await prisma.school.findUniqueOrThrow({
      where: { id: context.school.id },
      select: { organizationId: true },
    });

    const result = await createSchoolInOrganization({
      organizationId: current.organizationId,
      school: {
        name: String(formData.get("name") ?? ""),
        type: String(formData.get("type") ?? "PRIMAIRE"),
        city: String(formData.get("city") ?? ""),
        address: String(formData.get("address") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        email: String(formData.get("email") ?? ""),
        matriculePattern: String(formData.get("matriculePattern") ?? ""),
      },
      userId: context.user.id,
    });

    revalidatePath("/parametres");
    return ok(
      result,
      "Etablissement cree avec son plan comptable. Basculez dessus par le selecteur du haut, " +
        "puis configurez l'annee scolaire, les classes, les matieres et les frais.",
    );
  } catch (error) {
    return fail(error);
  }
}
