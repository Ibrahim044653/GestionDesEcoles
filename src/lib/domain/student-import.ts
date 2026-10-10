import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseCsv, pick, parseFlexibleDate, type CsvRow } from "@/lib/csv";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { nextMatricule } from "./sequences";
import { applyAutomaticFees } from "./fees";

/**
 * Import d'eleves par CSV / Excel, en deux temps (cahier des charges 3) :
 *
 *   1. APERCU  - le fichier est analyse, chaque ligne validee, les doublons
 *                detectes ; rien n'est ecrit en base hormis le rapport.
 *   2. VALIDATION - l'utilisateur confirme, et seules les lignes valides et
 *                non dupliquees sont importees.
 *
 * Aucun import partiel silencieux : le rapport indique precisement ce qui a
 * ete ecarte et pourquoi.
 */

export type ImportIssue = {
  /** Numero de ligne dans le fichier, en-tete comprise (1 = en-tete). */
  line: number;
  column: string;
  message: string;
  severity: "ERREUR" | "DOUBLON" | "AVERTISSEMENT";
};

export type ParsedStudentRow = {
  line: number;
  firstName: string;
  lastName: string;
  gender: string;
  birthDate: Date | null;
  birthPlace: string;
  matricule: string;
  email: string;
  phone: string;
  address: string;
  classCode: string;
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianRelation: string;
  issues: ImportIssue[];
  isValid: boolean;
  isDuplicate: boolean;
};

export type ImportPreview = {
  batchId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  headers: string[];
  /** Les 50 premieres lignes, pour l'apercu a l'ecran. */
  sample: ParsedStudentRow[];
  issues: ImportIssue[];
  unknownClassCodes: string[];
};

const GENDER_MAP: Record<string, string> = {
  m: "M",
  masculin: "M",
  homme: "M",
  garcon: "M",
  h: "M",
  f: "F",
  feminin: "F",
  femme: "F",
  fille: "F",
};

function normalizeGender(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return GENDER_MAP[key] ?? "UNSPECIFIED";
}

/** Cle de rapprochement : nom + prenom + date de naissance, insensible a la casse. */
function identityKey(lastName: string, firstName: string, birthDate: Date | null): string {
  return [
    lastName.trim().toLowerCase(),
    firstName.trim().toLowerCase(),
    birthDate ? birthDate.toISOString().slice(0, 10) : "",
  ].join("|");
}

/** Analyse et valide un fichier sans rien importer. */
export async function previewStudentImport(input: {
  schoolId: string;
  userId: string;
  fileName: string;
  content: string;
  academicYearId: string;
}): Promise<ImportPreview> {
  const { headers, rows } = parseCsv(input.content);

  if (headers.length === 0 || rows.length === 0) {
    throw new ValidationError(
      "Le fichier est vide ou illisible. Verifiez qu'il contient une ligne d'en-tete et au moins un eleve.",
    );
  }

  const [existingStudents, classRooms] = await Promise.all([
    prisma.student.findMany({
      where: { schoolId: input.schoolId },
      select: { matricule: true, firstName: true, lastName: true, birthDate: true },
    }),
    prisma.classRoom.findMany({
      where: { schoolId: input.schoolId, academicYearId: input.academicYearId },
      select: { id: true, code: true, name: true, capacity: true, _count: { select: { enrollments: true } } },
    }),
  ]);

  const existingMatricules = new Set(existingStudents.map((student) => student.matricule.toLowerCase()));
  const existingIdentities = new Set(
    existingStudents.map((student) => identityKey(student.lastName, student.firstName, student.birthDate)),
  );
  const classByCode = new Map(classRooms.map((room) => [room.code.toLowerCase(), room]));

  // Doublons internes au fichier lui-meme.
  const seenInFile = new Set<string>();
  const seenMatriculesInFile = new Set<string>();
  const unknownClassCodes = new Set<string>();

  const parsed: ParsedStudentRow[] = rows.map((row: CsvRow, index) => {
    const line = index + 2; // +1 pour l'en-tete, +1 pour passer en base 1
    const issues: ImportIssue[] = [];

    const lastName = pick(row, "nom", "last_name", "nom_de_famille");
    const firstName = pick(row, "prenom", "prenoms", "first_name");
    const matricule = pick(row, "matricule", "numero", "immatriculation", "student_id");
    const birthDateRaw = pick(row, "date_de_naissance", "date_naissance", "naissance", "birth_date", "ddn");
    const classCode = pick(row, "classe", "code_classe", "class", "class_code");

    if (!lastName) issues.push({ line, column: "nom", message: "Le nom est obligatoire.", severity: "ERREUR" });
    if (!firstName)
      issues.push({ line, column: "prenom", message: "Le prenom est obligatoire.", severity: "ERREUR" });

    const birthDate = birthDateRaw ? parseFlexibleDate(birthDateRaw) : null;
    if (birthDateRaw && !birthDate) {
      issues.push({
        line,
        column: "date_de_naissance",
        message: `Date illisible : "${birthDateRaw}". Formats acceptes : JJ/MM/AAAA ou AAAA-MM-JJ.`,
        severity: "ERREUR",
      });
    }
    if (birthDate && birthDate.getTime() > Date.now()) {
      issues.push({
        line,
        column: "date_de_naissance",
        message: "La date de naissance est dans le futur.",
        severity: "ERREUR",
      });
    }

    const email = pick(row, "email", "courriel", "mail");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ line, column: "email", message: `Adresse e-mail invalide : "${email}".`, severity: "ERREUR" });
    }

    // Classe : facultative, mais si elle est renseignee elle doit exister.
    if (classCode) {
      const classRoom = classByCode.get(classCode.toLowerCase());
      if (!classRoom) {
        unknownClassCodes.add(classCode);
        issues.push({
          line,
          column: "classe",
          message: `Classe inconnue pour cette annee : "${classCode}".`,
          severity: "ERREUR",
        });
      } else if (classRoom._count.enrollments >= classRoom.capacity) {
        issues.push({
          line,
          column: "classe",
          message: `La classe ${classRoom.name} est complete (${classRoom.capacity} places).`,
          severity: "AVERTISSEMENT",
        });
      }
    }

    // Detection des doublons : matricule explicite, puis identite.
    let isDuplicate = false;

    if (matricule) {
      const key = matricule.toLowerCase();
      if (existingMatricules.has(key)) {
        isDuplicate = true;
        issues.push({
          line,
          column: "matricule",
          message: `Un eleve porte deja le matricule ${matricule} dans cet etablissement.`,
          severity: "DOUBLON",
        });
      } else if (seenMatriculesInFile.has(key)) {
        isDuplicate = true;
        issues.push({
          line,
          column: "matricule",
          message: `Le matricule ${matricule} apparait plusieurs fois dans le fichier.`,
          severity: "DOUBLON",
        });
      }
      seenMatriculesInFile.add(key);
    }

    if (!isDuplicate && lastName && firstName) {
      const key = identityKey(lastName, firstName, birthDate);
      if (existingIdentities.has(key)) {
        isDuplicate = true;
        issues.push({
          line,
          column: "nom",
          message: `${lastName} ${firstName}${birthDate ? ` (ne le ${birthDate.toLocaleDateString("fr-FR")})` : ""} existe deja.`,
          severity: "DOUBLON",
        });
      } else if (seenInFile.has(key)) {
        isDuplicate = true;
        issues.push({
          line,
          column: "nom",
          message: "Cette identite apparait plusieurs fois dans le fichier.",
          severity: "DOUBLON",
        });
      }
      seenInFile.add(key);
    }

    const hasError = issues.some((issue) => issue.severity === "ERREUR");

    return {
      line,
      firstName,
      lastName,
      gender: normalizeGender(pick(row, "sexe", "genre", "gender")),
      birthDate,
      birthPlace: pick(row, "lieu_de_naissance", "lieu_naissance", "birth_place"),
      matricule,
      email,
      phone: pick(row, "telephone", "tel", "phone", "contact"),
      address: pick(row, "adresse", "address", "domicile"),
      classCode,
      guardianFirstName: pick(row, "prenom_parent", "prenom_tuteur", "guardian_first_name"),
      guardianLastName: pick(row, "nom_parent", "nom_tuteur", "guardian_last_name"),
      guardianPhone: pick(row, "telephone_parent", "tel_parent", "contact_parent", "guardian_phone"),
      guardianEmail: pick(row, "email_parent", "mail_parent", "guardian_email"),
      guardianRelation: pick(row, "lien_de_parente", "lien", "relation") || "TUTEUR",
      issues,
      isValid: !hasError && !isDuplicate,
      isDuplicate,
    };
  });

  const allIssues = parsed.flatMap((row) => row.issues);
  const validRows = parsed.filter((row) => row.isValid).length;
  const duplicateRows = parsed.filter((row) => row.isDuplicate).length;
  const errorRows = parsed.filter((row) => !row.isValid && !row.isDuplicate).length;

  const batch = await prisma.importBatch.create({
    data: {
      schoolId: input.schoolId,
      userId: input.userId,
      kind: "STUDENTS",
      fileName: input.fileName,
      totalRows: parsed.length,
      validRows,
      errorRows,
      duplicateRows,
      status: "PREVIEW",
      // Le rapport complet est conserve : il permet de rejouer la validation
      // sans redemander le fichier a l'utilisateur.
      report: JSON.stringify({
        academicYearId: input.academicYearId,
        headers,
        rows: parsed.map((row) => ({ ...row, birthDate: row.birthDate?.toISOString() ?? null })),
      }),
    },
    select: { id: true },
  });

  return {
    batchId: batch.id,
    fileName: input.fileName,
    totalRows: parsed.length,
    validRows,
    errorRows,
    duplicateRows,
    headers,
    sample: parsed.slice(0, 50),
    issues: allIssues.slice(0, 200),
    unknownClassCodes: Array.from(unknownClassCodes),
  };
}

/**
 * Valide un apercu : importe les lignes valides.
 * Chaque eleve est cree avec son inscription, son responsable legal eventuel
 * et ses frais obligatoires, dans une transaction par eleve (un echec isole
 * n'annule pas l'ensemble de l'import).
 */
export async function commitStudentImport(input: {
  schoolId: string;
  batchId: string;
  userId: string;
}): Promise<{ imported: number; skipped: number; failures: { line: number; message: string }[] }> {
  const batch = await prisma.importBatch.findUnique({ where: { id: input.batchId } });

  if (!batch || batch.schoolId !== input.schoolId) throw new NotFoundError("Import introuvable.");
  if (batch.status !== "PREVIEW") {
    throw new ValidationError("Cet import a deja ete traite.");
  }

  const report = JSON.parse(batch.report) as {
    academicYearId: string;
    rows: (Omit<ParsedStudentRow, "birthDate"> & { birthDate: string | null })[];
  };

  const classRooms = await prisma.classRoom.findMany({
    where: { schoolId: input.schoolId, academicYearId: report.academicYearId },
    select: { id: true, code: true },
  });
  const classByCode = new Map(classRooms.map((room) => [room.code.toLowerCase(), room.id]));

  const failures: { line: number; message: string }[] = [];
  let imported = 0;

  for (const row of report.rows) {
    if (!row.isValid) continue;

    try {
      // Delai elargi : la creation d'un eleve entraine inscription, responsable
      // legal, frais obligatoires et ecritures comptables. Le defaut de 5 s de
      // Prisma est trop court pour un import en masse sur une base chargee.
      await prisma.$transaction(async (tx) => {
        const matricule = row.matricule || (await nextMatricule(tx, input.schoolId));

        const student = await tx.student.create({
          data: {
            schoolId: input.schoolId,
            matricule,
            firstName: row.firstName,
            lastName: row.lastName,
            gender: row.gender,
            birthDate: row.birthDate ? new Date(row.birthDate) : null,
            birthPlace: row.birthPlace,
            email: row.email,
            phone: row.phone,
            address: row.address,
          },
          select: { id: true },
        });

        // Responsable legal : rapproche par telephone ou e-mail avant creation,
        // pour qu'une fratrie partage le meme parent.
        if (row.guardianLastName || row.guardianPhone) {
          const existingGuardian = await tx.guardian.findFirst({
            where: {
              schoolId: input.schoolId,
              OR: [
                ...(row.guardianPhone ? [{ phone: row.guardianPhone }] : []),
                ...(row.guardianEmail ? [{ email: row.guardianEmail }] : []),
              ],
            },
            select: { id: true },
          });

          const guardianId =
            existingGuardian?.id ??
            (
              await tx.guardian.create({
                data: {
                  schoolId: input.schoolId,
                  firstName: row.guardianFirstName || "—",
                  lastName: row.guardianLastName || row.lastName,
                  phone: row.guardianPhone,
                  email: row.guardianEmail,
                },
                select: { id: true },
              })
            ).id;

          await tx.studentGuardian.create({
            data: {
              studentId: student.id,
              guardianId,
              relation: row.guardianRelation.toUpperCase().slice(0, 20),
              isPrimary: true,
            },
          });
        }

        const classRoomId = row.classCode ? classByCode.get(row.classCode.toLowerCase()) : undefined;

        if (classRoomId) {
          await tx.enrollment.create({
            data: {
              schoolId: input.schoolId,
              studentId: student.id,
              academicYearId: report.academicYearId,
              classRoomId,
              kind: "INSCRIPTION",
              status: "ACTIVE",
            },
          });

          await applyAutomaticFees({
            schoolId: input.schoolId,
            studentId: student.id,
            academicYearId: report.academicYearId,
            classRoomId,
            userId: input.userId,
            db: tx,
          });
        }
      }, { timeout: 30_000, maxWait: 10_000 });

      imported += 1;
    } catch (error) {
      failures.push({
        line: row.line,
        message: error instanceof Error ? error.message : "Erreur inattendue.",
      });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMMITTED",
      importedRows: imported,
      report: JSON.stringify({ ...report, failures }),
    },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.STUDENT_IMPORTED,
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "importBatch",
    entityId: batch.id,
    metadata: { imported, failures: failures.length, fileName: batch.fileName },
  });

  return {
    imported,
    skipped: report.rows.length - imported - failures.length,
    failures,
  };
}

/** Modele CSV telechargeable, avec une ligne d'exemple. */
export const STUDENT_IMPORT_TEMPLATE = [
  "matricule;nom;prenom;sexe;date_de_naissance;lieu_de_naissance;telephone;email;adresse;classe;nom_parent;prenom_parent;telephone_parent;email_parent;lien_de_parente",
  ";KOUASSI;Awa;F;12/03/2014;Abidjan;;;Cocody;CM2-A;KOUASSI;Jean;0701020304;jean.kouassi@exemple.test;PERE",
].join("\r\n");
