import { prisma } from "@/lib/prisma";

/**
 * Acces aux elements de contexte d'un etablissement, partages par la plupart
 * des pages : annee en cours, periode d'evaluation active, listes de reference.
 * Toutes les requetes sont filtrees par schoolId.
 */

export async function getCurrentAcademicYear(schoolId: string) {
  return (
    (await prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true, startDate: true, endDate: true, status: true },
    })) ??
    // Repli : la plus recente si aucune n'est marquee comme courante.
    prisma.academicYear.findFirst({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true, status: true },
    })
  );
}

export async function listAcademicYears(schoolId: string) {
  return prisma.academicYear.findMany({
    where: { schoolId },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isCurrent: true, status: true },
  });
}

export async function listClassRooms(schoolId: string, academicYearId?: string) {
  return prisma.classRoom.findMany({
    where: { schoolId, status: "ACTIVE", ...(academicYearId ? { academicYearId } : {}) },
    orderBy: [{ level: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      capacity: true,
      levelId: true,
      level: { select: { name: true, code: true } },
      track: { select: { name: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
}

export async function listLevels(schoolId: string) {
  return prisma.level.findMany({
    where: { schoolId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, code: true },
  });
}

export async function listSubjects(schoolId: string) {
  return prisma.subject.findMany({
    where: { schoolId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, defaultCoefficient: true, credits: true },
  });
}

export async function listGradingPeriods(schoolId: string, academicYearId?: string) {
  return prisma.gradingPeriod.findMany({
    where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  });
}

export async function listFinancialAccounts(schoolId: string) {
  return prisma.financialAccount.findMany({
    where: { schoolId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, kind: true },
  });
}

/** Periode d'evaluation couvrant aujourd'hui, sinon la premiere encore ouverte. */
export async function getActiveGradingPeriod(schoolId: string, academicYearId: string) {
  const now = new Date();
  return (
    (await prisma.gradingPeriod.findFirst({
      where: { schoolId, academicYearId, startDate: { lte: now }, endDate: { gte: now } },
      select: { id: true, name: true, status: true },
    })) ??
    prisma.gradingPeriod.findFirst({
      where: { schoolId, academicYearId, status: "OPEN" },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, status: true },
    })
  );
}

/** Modules optionnels actives pour l'etablissement. */
export function isModuleEnabled(enabledModules: string[], moduleCode: string): boolean {
  return enabledModules.includes(moduleCode);
}
