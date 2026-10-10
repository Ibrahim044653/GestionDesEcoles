"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import {
  PERMISSIONS,
  NON_GRANTABLE_PERMISSIONS,
  effectivePermissions,
} from "@/lib/permissions";
import { fail, ok, ConflictError, NotFoundError, ValidationError, type ActionResult } from "@/lib/errors";
import { hashPassword, generateToken } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { emailSchema, parseInput } from "@/lib/validation";
import { ROLES } from "@/lib/constants";

/** Gestion des rattachements utilisateur-etablissement. */

export async function createMembershipAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ temporaryPassword?: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.MEMBERSHIP_MANAGE);

    const email = parseInput(emailSchema, String(formData.get("email") ?? ""));
    const roleCode = String(formData.get("roleCode") ?? "");
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();

    // Le role de super-administrateur ne s'attribue pas depuis un etablissement.
    if (roleCode === ROLES.SUPER_ADMIN) {
      throw new ConflictError(
        "Le role de super-administrateur se gere depuis l'espace d'administration de la plateforme.",
      );
    }

    const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
    if (!role) throw new NotFoundError("Role introuvable.");

    let temporaryPassword: string | undefined;

    await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email }, select: { id: true } });

      if (!user) {
        if (!firstName || !lastName) {
          throw new ValidationError("Ce compte n'existe pas : renseignez le nom et le prenom.", {
            lastName: ["Obligatoire pour creer un nouveau compte."],
          });
        }

        temporaryPassword = generateToken(9);
        user = await tx.user.create({
          data: {
            email,
            passwordHash: await hashPassword(temporaryPassword),
            firstName,
            lastName,
            mustChangePassword: true,
          },
          select: { id: true },
        });
      }

      const existing = await tx.membership.findFirst({
        where: { userId: user.id, schoolId: context.school.id },
        select: { id: true, roleId: true },
      });

      if (existing) {
        if (existing.roleId === role.id) {
          throw new ConflictError("Ce compte est deja rattache a cet etablissement avec ce role.");
        }
        // Un utilisateur a UN role par etablissement : on remplace.
        await tx.membership.update({
          where: { id: existing.id },
          data: { roleId: role.id, status: "ACTIVE" },
        });
      } else {
        await tx.membership.create({
          data: {
            userId: user.id,
            schoolId: context.school.id,
            roleId: role.id,
            isDefault: true,
            status: "ACTIVE",
          },
        });
      }
    });

    await recordAudit({
      action: "membership.created",
      schoolId: context.school.id,
      userId: context.user.id,
      metadata: { email, roleCode },
    });

    revalidatePath("/parametres/utilisateurs");

    return ok(
      { temporaryPassword },
      temporaryPassword
        ? `Compte cree et rattache. Mot de passe provisoire a transmettre : ${temporaryPassword}`
        : "Compte rattache a l'etablissement.",
    );
  } catch (error) {
    return fail(error);
  }
}

/** Suspend ou reactive un rattachement. */
export async function toggleMembershipAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const context = await requirePermission(PERMISSIONS.MEMBERSHIP_MANAGE);
    const membershipId = String(formData.get("membershipId") ?? "");
    const suspend = String(formData.get("suspend") ?? "") === "true";

    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      select: { id: true, schoolId: true, userId: true },
    });
    await assertSameSchool(context, membership, "membership");

    if (membership!.userId === context.user.id) {
      throw new ConflictError("Vous ne pouvez pas suspendre votre propre acces.");
    }

    await prisma.membership.update({
      where: { id: membershipId },
      data: { status: suspend ? "SUSPENDED" : "ACTIVE" },
    });

    if (suspend) {
      // Les sessions ouvertes sont immediatement invalidees.
      await revokeAllSessions(membership!.userId);
    }

    await recordAudit({
      action: suspend ? "membership.suspended" : "membership.reactivated",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "membership",
      entityId: membershipId,
    });

    revalidatePath("/parametres/utilisateurs");
    return ok(
      undefined,
      suspend ? "Acces suspendu et sessions fermees." : "Acces reactive.",
    );
  } catch (error) {
    return fail(error);
  }
}

/**
 * Reinitialise le mot de passe d'un utilisateur.
 * Le nouveau mot de passe est affiche UNE SEULE FOIS a l'administrateur, qui
 * le transmet par un canal distinct. Il n'est jamais stocke en clair.
 */
export async function resetUserPasswordAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.USER_UPDATE);
    const userId = String(formData.get("userId") ?? "");

    // L'utilisateur vise doit etre rattache a CET etablissement.
    const membership = await prisma.membership.findFirst({
      where: { userId, schoolId: context.school.id },
      select: { id: true },
    });
    if (!membership) throw new NotFoundError("Utilisateur introuvable dans cet etablissement.");

    if (userId === context.user.id) {
      throw new ConflictError(
        "Utilisez la page « Mon compte » pour changer votre propre mot de passe.",
      );
    }

    const temporaryPassword = generateToken(9);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    await revokeAllSessions(userId);

    await recordAudit({
      action: "user.password_reset",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "user",
      entityId: userId,
      // Le mot de passe genere n'est JAMAIS journalise.
    });

    revalidatePath("/parametres/utilisateurs");

    return ok(
      { temporaryPassword },
      `Mot de passe reinitialise. A transmettre a l'interesse : ${temporaryPassword} ` +
        "(il devra le changer a la premiere connexion). Ce code ne sera plus affiche.",
    );
  } catch (error) {
    return fail(error);
  }
}

/**
 * Surcharges de permissions d'un rattachement.
 *
 * Le formulaire envoie l'etat SOUHAITE de chaque permission ; l'action en
 * deduit les ecarts par rapport a la matrice du role. Une permission conforme
 * au role n'est jamais stockee : les surcharges restent courtes et lisibles,
 * et un changement futur de la matrice du role continue de s'appliquer.
 *
 * Deux garde-fous :
 *  - `saas.admin` n'est jamais accordable depuis l'ecran d'un etablissement ;
 *  - un administrateur ne peut pas modifier ses propres permissions, sinon il
 *    pourrait se les etendre sans controle.
 */
export async function updateMembershipPermissionsAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ grant: number; revoke: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.MEMBERSHIP_MANAGE);

    const membershipId = String(formData.get("membershipId") ?? "");
    const membership = await prisma.membership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        schoolId: true,
        userId: true,
        role: { select: { code: true } },
        user: { select: { firstName: true, lastName: true } },
      },
    });
    await assertSameSchool(context, membership, "membership");

    if (membership!.userId === context.user.id) {
      throw new ConflictError(
        "Vous ne pouvez pas modifier vos propres permissions. Demandez a un autre administrateur.",
      );
    }

    const wanted = new Set(
      formData
        .getAll("permissions")
        .map((value) => String(value))
        .filter((code) => !NON_GRANTABLE_PERMISSIONS.includes(code)),
    );

    const known = new Set<string>(Object.values(PERMISSIONS));
    for (const code of wanted) {
      if (!known.has(code)) throw new ValidationError(`Permission inconnue : ${code}.`);
    }

    // Base du role, sans aucune surcharge : c'est la reference des ecarts.
    const base = effectivePermissions(membership!.role.code, null);

    const grant = [...wanted].filter((code) => !base.has(code)).sort();
    const revoke = [...base]
      .filter((code) => !wanted.has(code) && !NON_GRANTABLE_PERMISSIONS.includes(code))
      .sort();

    await prisma.membership.update({
      where: { id: membershipId },
      data: {
        overrides:
          grant.length === 0 && revoke.length === 0 ? "{}" : JSON.stringify({ grant, revoke }),
      },
    });

    await recordAudit({
      action: "membership.permissions_updated",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "membership",
      entityId: membershipId,
      metadata: {
        agent: `${membership!.user.lastName} ${membership!.user.firstName}`,
        role: membership!.role.code,
        accordees: grant,
        retirees: revoke,
      },
    });

    revalidatePath("/parametres/utilisateurs");
    return ok(
      { grant: grant.length, revoke: revoke.length },
      grant.length === 0 && revoke.length === 0
        ? "Permissions alignees sur le role : aucune surcharge conservee."
        : `${grant.length} permission(s) ajoutee(s) et ${revoke.length} retiree(s) par rapport au role.`,
    );
  } catch (error) {
    return fail(error);
  }
}
