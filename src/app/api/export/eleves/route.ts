import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, STUDENT_STATUS_LABELS } from "@/lib/constants";
import { toCsv, csvResponse } from "@/lib/csv";
import { recordAudit } from "@/lib/audit";
import { getCurrentAcademicYear } from "@/lib/domain/school-context";
import { textContains } from "@/lib/search";

/**
 * Export CSV des eleves.
 *
 * L'export respecte exactement la meme portee que la liste a l'ecran :
 * un enseignant n'exporte que ses classes, et seuls les eleves de
 * l'etablissement actif sont inclus.
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!auth.permissions.has(PERMISSIONS.STUDENT_EXPORT)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const statusFilter = url.searchParams.get("statut") ?? "ACTIVE";
  const classRoomFilter = url.searchParams.get("classe");
  const levelFilter = url.searchParams.get("niveau");

  const academicYear = await getCurrentAcademicYear(auth.school.id);

  let allowedClassRoomIds: string[] | null = null;
  if (auth.membership?.roleCode === ROLES.TEACHER) {
    allowedClassRoomIds = (await teacherScope(auth)).classRoomIds;
  }

  const students = await prisma.student.findMany({
    where: {
      schoolId: auth.school.id,
      ...(statusFilter !== "TOUS" ? { status: statusFilter } : {}),
      ...(query
        ? {
            OR: [
              { lastName: textContains(query) },
              { firstName: textContains(query) },
              { matricule: textContains(query) },
            ],
          }
        : {}),
      ...(classRoomFilter || levelFilter || allowedClassRoomIds
        ? {
            enrollments: {
              some: {
                status: "ACTIVE",
                ...(academicYear ? { academicYearId: academicYear.id } : {}),
                ...(classRoomFilter ? { classRoomId: classRoomFilter } : {}),
                ...(levelFilter ? { classRoom: { levelId: levelFilter } } : {}),
                ...(allowedClassRoomIds ? { classRoomId: { in: allowedClassRoomIds } } : {}),
              },
            },
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      matricule: true,
      lastName: true,
      firstName: true,
      gender: true,
      birthDate: true,
      birthPlace: true,
      phone: true,
      email: true,
      address: true,
      status: true,
      enrollments: {
        where: { status: "ACTIVE" },
        select: { classRoom: { select: { name: true, level: { select: { name: true } } } } },
        take: 1,
      },
      guardians: {
        where: { isPrimary: true },
        select: { relation: true, guardian: { select: { lastName: true, firstName: true, phone: true, email: true } } },
        take: 1,
      },
    },
  });

  const rows = students.map((student) => {
    const guardian = student.guardians[0];
    return {
      matricule: student.matricule,
      nom: student.lastName,
      prenom: student.firstName,
      sexe: student.gender === "UNSPECIFIED" ? "" : student.gender,
      date_de_naissance: student.birthDate ? student.birthDate.toISOString().slice(0, 10) : "",
      lieu_de_naissance: student.birthPlace,
      niveau: student.enrollments[0]?.classRoom.level.name ?? "",
      classe: student.enrollments[0]?.classRoom.name ?? "",
      telephone: student.phone,
      email: student.email,
      adresse: student.address,
      statut: STUDENT_STATUS_LABELS[student.status] ?? student.status,
      nom_parent: guardian?.guardian.lastName ?? "",
      prenom_parent: guardian?.guardian.firstName ?? "",
      telephone_parent: guardian?.guardian.phone ?? "",
      email_parent: guardian?.guardian.email ?? "",
      lien_de_parente: guardian?.relation ?? "",
    };
  });

  await recordAudit({
    action: "student.exported",
    schoolId: auth.school.id,
    userId: auth.user.id,
    metadata: { count: rows.length, filters: { query, statusFilter, classRoomFilter, levelFilter } },
  });

  const csv = toCsv(rows, {
    columns: [
      { key: "matricule", header: "Matricule" },
      { key: "nom", header: "Nom" },
      { key: "prenom", header: "Prenom" },
      { key: "sexe", header: "Sexe" },
      { key: "date_de_naissance", header: "Date de naissance" },
      { key: "lieu_de_naissance", header: "Lieu de naissance" },
      { key: "niveau", header: "Niveau" },
      { key: "classe", header: "Classe" },
      { key: "telephone", header: "Telephone" },
      { key: "email", header: "Email" },
      { key: "adresse", header: "Adresse" },
      { key: "statut", header: "Statut" },
      { key: "nom_parent", header: "Nom du responsable" },
      { key: "prenom_parent", header: "Prenom du responsable" },
      { key: "telephone_parent", header: "Telephone du responsable" },
      { key: "email_parent", header: "Email du responsable" },
      { key: "lien_de_parente", header: "Lien de parente" },
    ],
  });

  return csvResponse(csv, `eleves-${auth.school.code}-${new Date().toISOString().slice(0, 10)}.csv`);
}
