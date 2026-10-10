"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { createSession, destroySession, readSession, revokeAllSessions } from "@/lib/auth/session";
import { consumeRateLimit, resetRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { loginSchema, changePasswordSchema, parseFormData } from "@/lib/validation";
import { fail, ok, AppError, type ActionResult } from "@/lib/errors";

/**
 * Authentification.
 *
 * Choix de securite appliques ici :
 *  - message d'erreur IDENTIQUE que l'e-mail existe ou non (pas d'enumeration
 *    des comptes) ;
 *  - limitation des tentatives par adresse e-mail ET par adresse IP ;
 *  - verrouillage temporaire du compte apres plusieurs echecs ;
 *  - verification du mot de passe executee meme pour un compte inconnu, afin
 *    que le temps de reponse ne trahisse pas l'existence du compte.
 */

const GENERIC_LOGIN_ERROR = "Adresse e-mail ou mot de passe incorrect.";
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

/** Empreinte de reference utilisee pour egaliser le temps de reponse. */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function loginAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  let redirectTo = "/tableau-de-bord";

  try {
    const input = parseFormData(loginSchema, formData);
    const headerList = await headers();
    const ip = (headerList.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "inconnu";

    await consumeRateLimit(`login:email:${input.email}`, RATE_LIMITS.LOGIN);
    await consumeRateLimit(`login:ip:${ip}`, RATE_LIMITS.LOGIN);

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        failedAttempts: true,
        lockedUntil: true,
        mustChangePassword: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: { schoolId: true, isDefault: true, role: { select: { code: true } } },
        },
        isSuperAdmin: true,
      },
    });

    // Toujours executer une verification : le temps de reponse reste constant.
    const passwordValid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordValid) {
      if (user) {
        const failedAttempts = user.failedAttempts + 1;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts,
            lockedUntil:
              failedAttempts >= MAX_FAILED_ATTEMPTS
                ? new Date(Date.now() + LOCK_MINUTES * 60_000)
                : user.lockedUntil,
          },
        });
      }

      await recordAudit({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        userId: user?.id ?? null,
        metadata: { email: input.email, reason: user ? "mot de passe invalide" : "compte inconnu" },
        ipAddress: ip,
        userAgent: headerList.get("user-agent") ?? "",
      });

      return { ok: false, error: GENERIC_LOGIN_ERROR, code: "INVALID_CREDENTIALS" };
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordAudit({
        action: AUDIT_ACTIONS.LOGIN_LOCKED,
        userId: user.id,
        ipAddress: ip,
      });
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      return {
        ok: false,
        error: `Ce compte est temporairement bloque apres plusieurs tentatives. Reessayez dans ${minutes} minute(s).`,
        code: "LOCKED",
      };
    }

    if (user.status !== "ACTIVE") {
      return {
        ok: false,
        error: "Ce compte est desactive. Contactez l'administration de l'etablissement.",
        code: "DISABLED",
      };
    }

    const defaultSchoolId =
      user.memberships.find((membership) => membership.isDefault)?.schoolId ??
      user.memberships[0]?.schoolId ??
      null;

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await createSession(user.id, defaultSchoolId);
    await resetRateLimit(`login:email:${input.email}`);

    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      userId: user.id,
      schoolId: defaultSchoolId,
      ipAddress: ip,
      userAgent: headerList.get("user-agent") ?? "",
    });

    // Chaque role atterrit sur son espace, pas sur un tableau de bord generique.
    const roleCode = user.memberships.find((m) => m.schoolId === defaultSchoolId)?.role.code;
    redirectTo = user.mustChangePassword
      ? "/mon-compte"
      : landingPageFor(roleCode, user.isSuperAdmin);
  } catch (error) {
    return fail(error);
  }

  // redirect() leve une exception de controle : elle doit rester hors du try.
  redirect(redirectTo);
}

function landingPageFor(roleCode: string | undefined, isSuperAdmin: boolean): string {
  if (roleCode === "GUARDIAN") return "/parent";
  if (roleCode === "STUDENT") return "/eleve";
  if (!roleCode && isSuperAdmin) return "/admin-saas";
  return "/tableau-de-bord";
}

export async function logoutAction(): Promise<void> {
  const session = await readSession();

  if (session) {
    await recordAudit({ action: AUDIT_ACTIONS.LOGOUT, userId: session.userId });
  }
  await destroySession();
  redirect("/connexion");
}

export async function changePasswordAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  try {
    const session = await readSession();
    if (!session) throw new AppError("Session expiree. Reconnectez-vous.", "UNAUTHENTICATED", 401);

    const input = parseFormData(changePasswordSchema, formData);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new AppError("Compte introuvable.", "NOT_FOUND", 404);

    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) {
      return { ok: false, error: "Le mot de passe actuel est incorrect.", code: "INVALID_PASSWORD" };
    }

    const problems = validatePasswordStrength(input.newPassword);
    if (problems.length > 0) {
      return {
        ok: false,
        error: "Le nouveau mot de passe ne respecte pas la politique de securite.",
        fieldErrors: { newPassword: problems },
      };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        mustChangePassword: false,
      },
    });

    // Les autres appareils sont deconnectes : un mot de passe compromis ne
    // laisse pas de session active derriere lui.
    await revokeAllSessions(user.id);
    await createSession(user.id, session.activeSchoolId);

    await recordAudit({ action: AUDIT_ACTIONS.PASSWORD_CHANGED, userId: user.id });

    return ok(undefined, "Mot de passe modifie. Vos autres sessions ont ete fermees.");
  } catch (error) {
    return fail(error);
  }
}

export async function switchSchoolAction(formData: FormData): Promise<void> {
  const session = await readSession();
  if (!session) redirect("/connexion");

  const schoolId = String(formData.get("schoolId") ?? "");

  // Verification serveur : on ne bascule que vers une ecole ou l'utilisateur
  // possede reellement un membership actif.
  const membership = await prisma.membership.findFirst({
    where: { userId: session.userId, schoolId, status: "ACTIVE" },
    select: { id: true, role: { select: { code: true } } },
  });
  if (!membership) redirect("/tableau-de-bord");

  await prisma.session.update({
    where: { id: session.id },
    data: { activeSchoolId: schoolId },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.SCHOOL_SWITCHED,
    userId: session.userId,
    schoolId,
  });

  redirect(landingPageFor(membership.role.code, false));
}
