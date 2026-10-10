"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { parseFormData, studentSchema, guardianSchema, enrollmentSchema } from "@/lib/validation";
import { fail, ok, ConflictError, NotFoundError, type ActionResult } from "@/lib/errors";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { nextMatricule, translateUniqueViolation } from "@/lib/domain/sequences";
import { applyAutomaticFees } from "@/lib/domain/fees";
import { hashPassword, generateToken } from "@/lib/auth/password";
import { ROLES } from "@/lib/constants";

/**
 * Actions sur les dossiers eleves.
 *
 * Chaque action commence par requirePermission (qui exige un etablissement
 * actif) puis verifie que la ressource visee appartient bien a cet
 * etablissement avant toute ecriture.
 */

export async function createStudentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ studentId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_CREATE);
    const input = parseFormData(studentSchema, formData);

    const classRoomId = String(formData.get("classRoomId") ?? "");
    const academicYearId = String(formData.get("academicYearId") ?? "");

    const student = await prisma.$transaction(async (tx) => {
      const matricule = input.matricule || (await nextMatricule(tx, context.school.id));

      const created = await tx.student
        .create({
          data: {
            schoolId: context.school.id,
            matricule,
            firstName: input.firstName,
            lastName: input.lastName,
            gender: input.gender,
            birthDate: input.birthDate ? new Date(input.birthDate) : null,
            birthPlace: input.birthPlace,
            nationality: input.nationality,
            email: input.email,
            phone: input.phone,
            address: input.address,
            emergencyContactName: input.emergencyContactName,
            emergencyContactPhone: input.emergencyContactPhone,
            previousSchool: input.previousSchool,
            bloodGroup: input.bloodGroup,
            medicalNotes: input.medicalNotes,
          },
          select: { id: true, matricule: true },
        })
        .catch((error) =>
          translateUniqueViolation(error, "Un eleve porte deja ce matricule dans cet etablissement."),
        );

      // Inscription immediate si une classe est choisie.
      if (classRoomId && academicYearId) {
        const classRoom = await tx.classRoom.findUnique({
          where: { id: classRoomId },
          select: {
            id: true,
            schoolId: true,
            name: true,
            capacity: true,
            _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
          },
        });

        if (!classRoom || classRoom.schoolId !== context.school.id) {
          throw new NotFoundError("Classe introuvable dans cet etablissement.");
        }
        if (classRoom._count.enrollments >= classRoom.capacity) {
          throw new ConflictError(
            `La classe ${classRoom.name} est complete (${classRoom.capacity} places). ` +
              "Augmentez la capacite ou choisissez une autre classe.",
          );
        }

        await tx.enrollment.create({
          data: {
            schoolId: context.school.id,
            studentId: created.id,
            academicYearId,
            classRoomId,
            kind: "INSCRIPTION",
            status: "ACTIVE",
          },
        });

        await applyAutomaticFees({
          schoolId: context.school.id,
          studentId: created.id,
          academicYearId,
          classRoomId,
          userId: context.user.id,
          db: tx,
        });
      }

      return created;
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "student",
      entityId: student.id,
      metadata: { matricule: student.matricule },
    });

    revalidatePath("/eleves");
    return ok({ studentId: student.id }, `Eleve enregistre sous le matricule ${student.matricule}.`);
  } catch (error) {
    return fail(error);
  }
}

export async function updateStudentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_UPDATE);
    const studentId = String(formData.get("studentId") ?? "");
    const input = parseFormData(studentSchema, formData);

    const existing = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, existing, "student");

    await prisma.student.update({
      where: { id: studentId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        birthPlace: input.birthPlace,
        nationality: input.nationality,
        email: input.email,
        phone: input.phone,
        address: input.address,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        previousSchool: input.previousSchool,
        bloodGroup: input.bloodGroup,
        medicalNotes: input.medicalNotes,
      },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "student",
      entityId: studentId,
    });

    revalidatePath(`/eleves/${studentId}`);
    return ok(undefined, "Dossier mis a jour.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Archive un eleve (depart, abandon, transfert).
 * Aucune suppression : l'historique financier et pedagogique est conserve,
 * conformement aux regles de conservation des donnees.
 */
export async function archiveStudentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_ARCHIVE);
    const studentId = String(formData.get("studentId") ?? "");
    const status = String(formData.get("status") ?? "ARCHIVED");
    const reason = String(formData.get("reason") ?? "").trim();

    if (!reason) {
      return { ok: false, error: "Un motif est obligatoire.", fieldErrors: { reason: ["Indiquez le motif du depart."] } };
    }

    const existing = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, existing, "student");

    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: { status, statusReason: reason, archivedAt: new Date() },
      });
      await tx.enrollment.updateMany({
        where: { studentId, status: "ACTIVE" },
        data: {
          status: status === "TRANSFERRED" ? "TRANSFERRED_OUT" : "WITHDRAWN",
          endedAt: new Date(),
          endReason: reason,
        },
      });
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STUDENT_ARCHIVED,
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "student",
      entityId: studentId,
      metadata: { status, reason },
    });

    revalidatePath(`/eleves/${studentId}`);
    return ok(undefined, "Statut de l'eleve mis a jour. Son historique reste consultable.");
  } catch (error) {
    return fail(error);
  }
}

/** Inscrit (ou reinscrit) un eleve dans une classe. */
export async function enrollStudentAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ENROLLMENT_MANAGE);
    const input = parseFormData(enrollmentSchema, formData);

    const [student, classRoom, year] = await Promise.all([
      prisma.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, schoolId: true },
      }),
      prisma.classRoom.findUnique({
        where: { id: input.classRoomId },
        select: {
          id: true,
          schoolId: true,
          name: true,
          capacity: true,
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      }),
      prisma.academicYear.findUnique({
        where: { id: input.academicYearId },
        select: { id: true, schoolId: true, status: true, name: true },
      }),
    ]);

    await assertSameSchool(context, student, "student");
    await assertSameSchool(context, classRoom, "classRoom");
    await assertSameSchool(context, year, "academicYear");

    if (year!.status === "CLOSED") {
      throw new ConflictError(`L'annee ${year!.name} est cloturee : aucune inscription n'y est possible.`);
    }
    if (classRoom!._count.enrollments >= classRoom!.capacity) {
      throw new ConflictError(`La classe ${classRoom!.name} est complete (${classRoom!.capacity} places).`);
    }

    const existing = await prisma.enrollment.findUnique({
      where: { studentId_academicYearId: { studentId: input.studentId, academicYearId: input.academicYearId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError(
        `Cet eleve est deja inscrit pour l'annee ${year!.name}. Utilisez un transfert de classe.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.enrollment.create({
        data: {
          schoolId: context.school.id,
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          classRoomId: input.classRoomId,
          kind: input.kind,
          status: "ACTIVE",
        },
      });

      if (input.applyFees) {
        await applyAutomaticFees({
          schoolId: context.school.id,
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          classRoomId: input.classRoomId,
          userId: context.user.id,
          db: tx,
        });
      }
    });

    revalidatePath(`/eleves/${input.studentId}`);
    return ok(undefined, "Inscription enregistree.");
  } catch (error) {
    return fail(error);
  }
}

/** Change un eleve de classe au sein de la meme annee. */
export async function transferClassAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.ENROLLMENT_MANAGE);
    const enrollmentId = String(formData.get("enrollmentId") ?? "");
    const classRoomId = String(formData.get("classRoomId") ?? "");

    const [enrollment, classRoom] = await Promise.all([
      prisma.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { id: true, schoolId: true, studentId: true },
      }),
      prisma.classRoom.findUnique({
        where: { id: classRoomId },
        select: {
          id: true,
          schoolId: true,
          name: true,
          capacity: true,
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      }),
    ]);

    await assertSameSchool(context, enrollment, "enrollment");
    await assertSameSchool(context, classRoom, "classRoom");

    if (classRoom!._count.enrollments >= classRoom!.capacity) {
      throw new ConflictError(`La classe ${classRoom!.name} est complete.`);
    }

    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { classRoomId } });

    revalidatePath(`/eleves/${enrollment!.studentId}`);
    return ok(undefined, `Eleve transfere en ${classRoom!.name}.`);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Rattache un responsable legal a un eleve, avec creation optionnelle d'un
 * acces a l'espace parent.
 */
export async function addGuardianAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ temporaryPassword?: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STUDENT_UPDATE);
    const studentId = String(formData.get("studentId") ?? "");
    const input = parseFormData(guardianSchema, formData);

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, schoolId: true },
    });
    await assertSameSchool(context, student, "student");

    if (input.createAccount && !input.email) {
      return {
        ok: false,
        error: "Une adresse e-mail est necessaire pour creer un acces parent.",
        fieldErrors: { email: ["Renseignez l'adresse e-mail du responsable."] },
      };
    }

    let temporaryPassword: string | undefined;

    await prisma.$transaction(async (tx) => {
      // Rapprochement : un meme responsable peut deja exister (fratrie).
      let guardian = await tx.guardian.findFirst({
        where: {
          schoolId: context.school.id,
          OR: [
            ...(input.email ? [{ email: input.email }] : []),
            ...(input.phone ? [{ phone: input.phone }] : []),
          ],
        },
        select: { id: true, userId: true },
      });

      if (!guardian) {
        guardian = await tx.guardian.create({
          data: {
            schoolId: context.school.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            phoneAlt: input.phoneAlt,
            address: input.address,
            profession: input.profession,
          },
          select: { id: true, userId: true },
        });
      }

      if (input.createAccount && !guardian.userId && input.email) {
        const existingUser = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });

        let userId = existingUser?.id;

        if (!userId) {
          // Mot de passe provisoire : a changer a la premiere connexion.
          temporaryPassword = generateToken(9);
          const created = await tx.user.create({
            data: {
              email: input.email,
              passwordHash: await hashPassword(temporaryPassword),
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              mustChangePassword: true,
            },
            select: { id: true },
          });
          userId = created.id;
        }

        const role = await tx.role.findUnique({ where: { code: ROLES.GUARDIAN }, select: { id: true } });
        if (role) {
          await tx.membership.upsert({
            where: {
              userId_schoolId_roleId: { userId, schoolId: context.school.id, roleId: role.id },
            },
            create: { userId, schoolId: context.school.id, roleId: role.id, isDefault: true },
            update: { status: "ACTIVE" },
          });
        }

        await tx.guardian.update({ where: { id: guardian.id }, data: { userId } });
      }

      await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId, guardianId: guardian.id } },
        create: {
          studentId,
          guardianId: guardian.id,
          relation: input.relation,
          canViewGrades: input.canViewGrades,
          canViewFinance: input.canViewFinance,
        },
        update: {
          relation: input.relation,
          canViewGrades: input.canViewGrades,
          canViewFinance: input.canViewFinance,
        },
      });
    });

    revalidatePath(`/eleves/${studentId}`);
    return ok(
      { temporaryPassword },
      temporaryPassword
        ? `Responsable rattache. Mot de passe provisoire a transmettre : ${temporaryPassword}`
        : "Responsable rattache a l'eleve.",
    );
  } catch (error) {
    return fail(error);
  }
}
