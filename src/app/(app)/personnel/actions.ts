"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { parseFormData, staffSchema } from "@/lib/validation";
import { fail, ok, ConflictError, type ActionResult } from "@/lib/errors";
import { hashPassword, generateToken } from "@/lib/auth/password";
import { nextStaffNumber, translateUniqueViolation } from "@/lib/domain/sequences";
import { STAFF_ROLES, ROLES } from "@/lib/constants";

/** Gestion du personnel et de leurs acces a l'application. */

export async function createStaffAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ staffId: string; temporaryPassword?: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STAFF_CREATE);
    const input = parseFormData(staffSchema, formData);

    if (input.createAccount && !input.email) {
      return {
        ok: false,
        error: "Une adresse e-mail est necessaire pour creer un acces.",
        fieldErrors: { email: ["Renseignez l'adresse e-mail professionnelle."] },
      };
    }

    // Un membre du personnel ne peut recevoir qu'un role de personnel.
    const roleCode = input.roleCode ?? ROLES.TEACHER;
    if (input.createAccount && !STAFF_ROLES.includes(roleCode as (typeof STAFF_ROLES)[number])) {
      return {
        ok: false,
        error: "Ce role ne peut pas etre attribue a un membre du personnel.",
        fieldErrors: { roleCode: ["Choisissez un role de personnel."] },
      };
    }

    let temporaryPassword: string | undefined;

    const staff = await prisma.$transaction(async (tx) => {
      let userId: string | null = null;

      if (input.createAccount && input.email) {
        const existing = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });

        if (existing) {
          userId = existing.id;
        } else {
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

        const role = await tx.role.findUnique({ where: { code: roleCode }, select: { id: true } });
        if (!role) throw new ConflictError("Role introuvable.");

        await tx.membership.upsert({
          where: {
            userId_schoolId_roleId: { userId, schoolId: context.school.id, roleId: role.id },
          },
          create: { userId, schoolId: context.school.id, roleId: role.id, isDefault: true },
          update: { status: "ACTIVE" },
        });
      }

      const staffNumber = await nextStaffNumber(tx, context.school.id);

      return tx.staff
        .create({
          data: {
            schoolId: context.school.id,
            userId,
            staffNumber,
            firstName: input.firstName,
            lastName: input.lastName,
            gender: input.gender,
            birthDate: input.birthDate ? new Date(input.birthDate) : null,
            email: input.email,
            phone: input.phone,
            address: input.address,
            jobTitle: input.jobTitle,
            qualification: input.qualification,
            contractType: input.contractType,
            contractStart: input.contractStart ? new Date(input.contractStart) : null,
            contractEnd: input.contractEnd ? new Date(input.contractEnd) : null,
          },
          select: { id: true, staffNumber: true },
        })
        .catch((error) =>
          translateUniqueViolation(error, "Un membre du personnel porte deja ce numero."),
        );
    });

    revalidatePath("/personnel");

    return ok(
      { staffId: staff.id, temporaryPassword },
      temporaryPassword
        ? `Personnel enregistre (${staff.staffNumber}). Mot de passe provisoire a transmettre : ${temporaryPassword}`
        : `Personnel enregistre sous le numero ${staff.staffNumber}.`,
    );
  } catch (error) {
    return fail(error);
  }
}

/** Affecte une matiere et une classe a un enseignant. */
export async function assignTeachingAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.SUBJECT_MANAGE);
    const staffId = String(formData.get("staffId") ?? "");
    const classRoomId = String(formData.get("classRoomId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const coefficient = Number.parseInt(String(formData.get("coefficient") ?? "1"), 10) || 1;

    const [staff, classRoom, subject] = await Promise.all([
      prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, schoolId: true } }),
      prisma.classRoom.findUnique({ where: { id: classRoomId }, select: { id: true, schoolId: true } }),
      prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, schoolId: true } }),
    ]);

    await assertSameSchool(context, staff, "staff");
    await assertSameSchool(context, classRoom, "classRoom");
    await assertSameSchool(context, subject, "subject");

    await prisma.classSubject.upsert({
      where: { classRoomId_subjectId: { classRoomId, subjectId } },
      create: { classRoomId, subjectId, teacherId: staffId, coefficient },
      update: { teacherId: staffId, coefficient },
    });

    revalidatePath("/personnel");
    return ok(undefined, "Affectation enregistree.");
  } catch (error) {
    return fail(error);
  }
}

/** Active ou suspend l'acces applicatif d'un membre du personnel. */
export async function toggleStaffAccessAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.USER_DISABLE);
    const staffId = String(formData.get("staffId") ?? "");
    const enable = String(formData.get("enable") ?? "") === "true";

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, schoolId: true, userId: true },
    });
    await assertSameSchool(context, staff, "staff");

    if (!staff!.userId) throw new ConflictError("Ce membre du personnel n'a pas de compte.");
    if (staff!.userId === context.user.id) {
      throw new ConflictError("Vous ne pouvez pas suspendre votre propre acces.");
    }

    await prisma.membership.updateMany({
      where: { userId: staff!.userId, schoolId: context.school.id },
      data: { status: enable ? "ACTIVE" : "SUSPENDED" },
    });

    // Suspendre coupe immediatement les sessions en cours.
    if (!enable) {
      await prisma.session.updateMany({
        where: { userId: staff!.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    revalidatePath("/personnel");
    return ok(
      undefined,
      enable
        ? "Acces reactive."
        : "Acces suspendu. Les sessions en cours de cet utilisateur ont ete fermees.",
    );
  } catch (error) {
    return fail(error);
  }
}
