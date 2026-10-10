import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession } from "./session";
import { effectivePermissions, type PermissionCode } from "@/lib/permissions";
import { ROLES, type RoleCode } from "@/lib/constants";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

/**
 * Point de controle unique des acces.
 *
 * Deux verifications INDEPENDANTES sont exigees a chaque operation :
 *   1. la PERMISSION (que l'utilisateur a-t-il le droit de faire ?)
 *   2. le TENANT (sur quelles donnees ?) - voir assertSameSchool / scope*.
 *
 * Masquer un bouton dans l'interface ne constitue jamais un controle d'acces.
 */

export type AuthContext = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
  };
  /** Etablissement actif. null pour un super-administrateur sans membership. */
  school: {
    id: string;
    name: string;
    code: string;
    type: string;
    currency: string;
    locale: string;
    enabledModules: string[];
    organizationId: string;
  } | null;
  membership: {
    id: string;
    roleCode: RoleCode;
    roleName: string;
  } | null;
  permissions: Set<string>;
  /** Toutes les ecoles accessibles, pour le selecteur d'etablissement. */
  availableSchools: { id: string; name: string; code: string; roleCode: string }[];
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Charge le contexte d'authentification.
 * `cache` de React : une seule requete par rendu, meme si dix composants l'appellent.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      isSuperAdmin: true,
      mustChangePassword: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          schoolId: true,
          overrides: true,
          isDefault: true,
          role: { select: { code: true, name: true } },
          school: {
            select: {
              id: true,
              name: true,
              code: true,
              type: true,
              status: true,
              currency: true,
              locale: true,
              enabledModules: true,
              organizationId: true,
            },
          },
        },
      },
    },
  });

  // Un compte desactive perd l'acces immediatement, meme si son cookie est valide.
  if (!user || user.status !== "ACTIVE") return null;

  const usableMemberships = user.memberships.filter((m) => m.school.status !== "ARCHIVED");

  const activeMembership =
    usableMemberships.find((m) => m.schoolId === session.activeSchoolId) ??
    usableMemberships.find((m) => m.isDefault) ??
    usableMemberships[0] ??
    null;

  const permissions = activeMembership
    ? effectivePermissions(
        activeMembership.role.code,
        parseJson<{ grant?: string[]; revoke?: string[] }>(activeMembership.overrides, {}),
      )
    : new Set<string>();

  // Le super-administrateur cumule ses permissions SaaS avec celles de son
  // eventuel membership : il n'herite jamais d'un acces tenant implicite.
  if (user.isSuperAdmin) {
    for (const code of effectivePermissions(ROLES.SUPER_ADMIN, null)) permissions.add(code);
  }

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      isSuperAdmin: user.isSuperAdmin,
      mustChangePassword: user.mustChangePassword,
    },
    school: activeMembership
      ? {
          id: activeMembership.school.id,
          name: activeMembership.school.name,
          code: activeMembership.school.code,
          type: activeMembership.school.type,
          currency: activeMembership.school.currency,
          locale: activeMembership.school.locale,
          enabledModules: parseJson<string[]>(activeMembership.school.enabledModules, []),
          organizationId: activeMembership.school.organizationId,
        }
      : null,
    membership: activeMembership
      ? {
          id: activeMembership.id,
          roleCode: activeMembership.role.code as RoleCode,
          roleName: activeMembership.role.name,
        }
      : null,
    permissions,
    availableSchools: usableMemberships.map((m) => ({
      id: m.school.id,
      name: m.school.name,
      code: m.school.code,
      roleCode: m.role.code,
    })),
  };
});

/** Exige une session valide. */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw new UnauthenticatedError();
  return context;
}

/** Exige une session rattachee a un etablissement actif. */
export async function requireSchool(): Promise<AuthContext & { school: NonNullable<AuthContext["school"]> }> {
  const context = await requireAuth();
  if (!context.school) {
    throw new ForbiddenError("Aucun etablissement n'est associe a votre compte.");
  }
  return context as AuthContext & { school: NonNullable<AuthContext["school"]> };
}

export function hasPermission(context: AuthContext, permission: PermissionCode): boolean {
  return context.permissions.has(permission);
}

export function hasAnyPermission(context: AuthContext, permissions: PermissionCode[]): boolean {
  return permissions.some((permission) => context.permissions.has(permission));
}

/**
 * Exige une permission precise. Trace tout refus dans le journal d'audit :
 * une tentative repetee est un signal de securite exploitable.
 */
export async function requirePermission(
  permission: PermissionCode,
): Promise<AuthContext & { school: NonNullable<AuthContext["school"]> }> {
  const context = await requireSchool();

  if (!context.permissions.has(permission)) {
    const headerList = await headers();
    await recordAudit({
      action: AUDIT_ACTIONS.ACCESS_DENIED,
      schoolId: context.school.id,
      userId: context.user.id,
      metadata: { permission, role: context.membership?.roleCode },
      ipAddress: (headerList.get("x-forwarded-for") ?? "").split(",")[0]?.trim(),
      userAgent: headerList.get("user-agent") ?? "",
    });
    throw new ForbiddenError();
  }

  return context;
}

/** Variante sans etablissement actif, pour l'espace super-administrateur. */
export async function requireSuperAdmin(): Promise<AuthContext> {
  const context = await requireAuth();
  if (!context.user.isSuperAdmin) throw new ForbiddenError();
  return context;
}

/**
 * Variante PAGE : redirige vers l'ecran d'explication plutot que de produire
 * une erreur technique, apres avoir trace le refus.
 */
export async function requireSuperAdminPage(): Promise<AuthContext> {
  const context = await requireAuth();

  if (!context.user.isSuperAdmin) {
    const headerList = await headers();
    await recordAudit({
      action: AUDIT_ACTIONS.ACCESS_DENIED,
      schoolId: context.school?.id ?? null,
      userId: context.user.id,
      metadata: { area: "admin-saas" },
      ipAddress: (headerList.get("x-forwarded-for") ?? "").split(",")[0]?.trim(),
      userAgent: headerList.get("user-agent") ?? "",
    });
    redirect("/acces-refuse?permission=saas.admin");
  }

  return context;
}

/**
 * ISOLATION MULTI-TENANT.
 *
 * Verifie qu'une ressource chargee appartient bien a l'etablissement actif.
 * Leve NotFoundError (et non ForbiddenError) : repondre "interdit" revelerait
 * l'existence de la ressource dans une autre ecole.
 */
export async function assertSameSchool(
  context: AuthContext,
  resource: { schoolId: string | null } | null | undefined,
  entityType = "ressource",
): Promise<void> {
  if (!resource) throw new NotFoundError();

  if (!context.school || resource.schoolId !== context.school.id) {
    const headerList = await headers();
    await recordAudit({
      action: AUDIT_ACTIONS.CROSS_TENANT_ATTEMPT,
      schoolId: context.school?.id ?? null,
      userId: context.user.id,
      entityType,
      metadata: { expectedSchoolId: context.school?.id, resourceSchoolId: resource.schoolId },
      ipAddress: (headerList.get("x-forwarded-for") ?? "").split(",")[0]?.trim(),
      userAgent: headerList.get("user-agent") ?? "",
    });
    throw new NotFoundError();
  }
}

/**
 * Variante PAGE de requireSchool : un compte sans etablissement actif (par
 * exemple un super-administrateur) est oriente vers un ecran d'explication
 * plutot que de declencher une erreur technique.
 */
export async function requireSchoolPage(): Promise<
  AuthContext & { school: NonNullable<AuthContext["school"]> }
> {
  const context = await requireAuth();
  if (!context.school) redirect("/acces-refuse?motif=etablissement");
  return context as AuthContext & { school: NonNullable<AuthContext["school"]> };
}

/**
 * Variante PAGE de requirePermission.
 *
 * Une page refusee ne doit pas se solder par une erreur technique : on
 * redirige vers un ecran d'explication, apres avoir trace le refus. Le
 * contenu protege n'est jamais rendu.
 */
export async function requirePagePermission(
  permission: PermissionCode,
): Promise<AuthContext & { school: NonNullable<AuthContext["school"]> }> {
  const context = await requireAuth();

  if (!context.school) {
    redirect("/acces-refuse?motif=etablissement");
  }
  if (!context.permissions.has(permission)) {
    const headerList = await headers();
    await recordAudit({
      action: AUDIT_ACTIONS.ACCESS_DENIED,
      schoolId: context.school.id,
      userId: context.user.id,
      metadata: { permission, role: context.membership?.roleCode },
      ipAddress: (headerList.get("x-forwarded-for") ?? "").split(",")[0]?.trim(),
      userAgent: headerList.get("user-agent") ?? "",
    });
    redirect(`/acces-refuse?permission=${encodeURIComponent(permission)}`);
  }

  return context as AuthContext & { school: NonNullable<AuthContext["school"]> };
}

/**
 * Variante destinee aux PAGES : au lieu de lever une exception (qui
 * produirait une 500), elle rend la page 404 de Next. Le controle et la trace
 * d'audit restent identiques a assertSameSchool.
 */
export async function assertSameSchoolOrNotFound(
  context: AuthContext,
  resource: { schoolId: string | null } | null | undefined,
  entityType = "ressource",
): Promise<void> {
  try {
    await assertSameSchool(context, resource, entityType);
  } catch {
    notFound();
  }
}

// ---------------------------------------------------------------------------
// Portees fines : au-dela de la permission, QUELLES lignes sont visibles.
// ---------------------------------------------------------------------------

/**
 * Identifiants des eleves qu'un parent a le droit de consulter.
 * Un parent ne voit QUE les enfants qui lui sont explicitement rattaches,
 * dans l'etablissement actif.
 */
export async function guardianStudentIds(
  context: AuthContext,
  options: { requireFinance?: boolean; requireGrades?: boolean } = {},
): Promise<string[]> {
  if (!context.school) return [];

  const links = await prisma.studentGuardian.findMany({
    where: {
      guardian: { userId: context.user.id, schoolId: context.school.id },
      ...(options.requireFinance ? { canViewFinance: true } : {}),
      ...(options.requireGrades ? { canViewGrades: true } : {}),
      student: { schoolId: context.school.id },
    },
    select: { studentId: true },
  });

  return links.map((link) => link.studentId);
}

/**
 * Verifie qu'un parent a bien acces a cet eleve precis.
 * Leve NotFoundError sinon : aucune information ne fuit sur les autres eleves.
 */
export async function assertGuardianOwnsStudent(
  context: AuthContext,
  studentId: string,
  options: { requireFinance?: boolean; requireGrades?: boolean } = {},
): Promise<void> {
  const allowed = await guardianStudentIds(context, options);
  if (!allowed.includes(studentId)) {
    const headerList = await headers();
    await recordAudit({
      action: AUDIT_ACTIONS.CROSS_TENANT_ATTEMPT,
      schoolId: context.school?.id ?? null,
      userId: context.user.id,
      entityType: "student",
      entityId: studentId,
      metadata: { reason: "parent non rattache a cet eleve" },
      ipAddress: (headerList.get("x-forwarded-for") ?? "").split(",")[0]?.trim(),
      userAgent: headerList.get("user-agent") ?? "",
    });
    throw new NotFoundError();
  }
}

/** Identifiant du profil eleve lie au compte connecte. */
export async function currentStudentId(context: AuthContext): Promise<string | null> {
  if (!context.school) return null;
  const student = await prisma.student.findFirst({
    where: { userId: context.user.id, schoolId: context.school.id },
    select: { id: true },
  });
  return student?.id ?? null;
}

/** Identifiant du profil personnel lie au compte connecte. */
export async function currentStaffId(context: AuthContext): Promise<string | null> {
  if (!context.school) return null;
  const staff = await prisma.staff.findFirst({
    where: { userId: context.user.id, schoolId: context.school.id },
    select: { id: true },
  });
  return staff?.id ?? null;
}

/**
 * Classes et matieres d'un enseignant.
 * Un enseignant ne voit QUE les classes/matieres qui lui sont affectees
 * (ClassSubject) ou dont il est professeur principal.
 */
export async function teacherScope(
  context: AuthContext,
): Promise<{ staffId: string | null; classRoomIds: string[]; classSubjectPairs: { classRoomId: string; subjectId: string }[] }> {
  const staffId = await currentStaffId(context);
  if (!staffId || !context.school) {
    return { staffId: null, classRoomIds: [], classSubjectPairs: [] };
  }

  const [assignments, mainClasses] = await Promise.all([
    prisma.classSubject.findMany({
      where: { teacherId: staffId, classRoom: { schoolId: context.school.id } },
      select: { classRoomId: true, subjectId: true },
    }),
    prisma.classRoom.findMany({
      where: { mainTeacherId: staffId, schoolId: context.school.id },
      select: { id: true },
    }),
  ]);

  const classRoomIds = Array.from(
    new Set([...assignments.map((a) => a.classRoomId), ...mainClasses.map((c) => c.id)]),
  );

  return { staffId, classRoomIds, classSubjectPairs: assignments };
}

/**
 * Verifie qu'un enseignant est bien affecte a ce couple classe/matiere.
 * Les roles de pilotage (direction, pedagogie, proprietaire) ne sont pas bornes.
 */
export async function assertTeacherCanTouch(
  context: AuthContext,
  classRoomId: string,
  subjectId: string,
): Promise<void> {
  if (context.membership?.roleCode !== ROLES.TEACHER) return;

  const scope = await teacherScope(context);
  const allowed = scope.classSubjectPairs.some(
    (pair) => pair.classRoomId === classRoomId && pair.subjectId === subjectId,
  );

  if (!allowed) {
    throw new ForbiddenError(
      "Vous n'enseignez pas cette matiere dans cette classe.",
    );
  }
}
