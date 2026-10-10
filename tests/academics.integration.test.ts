import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase, seedTwoSchools } from "./helpers/db";
import {
  computeClassResults,
  generateReportCards,
  publishPeriodResults,
  reviseGrade,
} from "@/lib/domain/report-cards";
import { previewStudentImport, commitStudentImport } from "@/lib/domain/student-import";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Tests d'integration du parcours pedagogique et de l'import d'eleves.
 *
 * Couvre les sections 3, 6 et 21 du cahier des charges : moyennes ponderees,
 * publication verrouillante, corrections tracees, import avec detection des
 * doublons.
 */

type Fixtures = Awaited<ReturnType<typeof seedTwoSchools>>;
let fixtures: Fixtures;

beforeEach(async () => {
  await resetDatabase();
  fixtures = await seedTwoSchools();
});

/** Classe de 3 eleves, 2 matieres (coef. 4 et 2), une periode ouverte. */
async function setupClass() {
  const level = await prisma.level.create({
    data: { schoolId: fixtures.schoolA.id, code: "6EME", name: "Sixieme", sortOrder: 1 },
  });

  const classRoom = await prisma.classRoom.create({
    data: {
      schoolId: fixtures.schoolA.id,
      academicYearId: fixtures.yearA.id,
      levelId: level.id,
      name: "6EME-A",
      code: "6EME-A",
      capacity: 30,
    },
  });

  const period = await prisma.gradingPeriod.create({
    data: {
      schoolId: fixtures.schoolA.id,
      academicYearId: fixtures.yearA.id,
      name: "Trimestre 1",
      kind: "TRIMESTRE",
      sortOrder: 1,
      startDate: new Date("2025-09-01"),
      endDate: new Date("2025-12-20"),
    },
  });

  const [french, maths] = await Promise.all([
    prisma.subject.create({
      data: { schoolId: fixtures.schoolA.id, code: "FRA", name: "Francais", defaultCoefficient: 4 },
    }),
    prisma.subject.create({
      data: { schoolId: fixtures.schoolA.id, code: "MATH", name: "Mathematiques", defaultCoefficient: 2 },
    }),
  ]);

  await prisma.classSubject.createMany({
    data: [
      { classRoomId: classRoom.id, subjectId: french.id, coefficient: 4, maxScore: 20 },
      { classRoomId: classRoom.id, subjectId: maths.id, coefficient: 2, maxScore: 20 },
    ],
  });

  // Trois eleves : le premier est studentA du jeu de base.
  const students = [fixtures.studentA];
  for (const [index, name] of [["Kone", "Awa"], ["Traore", "Moussa"]].entries()) {
    students.push(
      await prisma.student.create({
        data: {
          schoolId: fixtures.schoolA.id,
          matricule: `A-100${index}`,
          lastName: name[0].toUpperCase(),
          firstName: name[1],
        },
      }),
    );
  }

  for (const student of students) {
    await prisma.enrollment.create({
      data: {
        schoolId: fixtures.schoolA.id,
        studentId: student.id,
        academicYearId: fixtures.yearA.id,
        classRoomId: classRoom.id,
        status: "ACTIVE",
      },
    });
  }

  return { classRoom, period, french, maths, students, level };
}

/** Cree une evaluation validee avec les notes fournies (en centiemes). */
async function createEvaluation(
  context: Awaited<ReturnType<typeof setupClass>>,
  subjectId: string,
  scores: (number | null)[],
  options: { coefficient?: number; maxScore?: number; status?: string } = {},
) {
  const evaluation = await prisma.evaluation.create({
    data: {
      schoolId: fixtures.schoolA.id,
      academicYearId: fixtures.yearA.id,
      gradingPeriodId: context.period.id,
      classRoomId: context.classRoom.id,
      subjectId,
      title: "Evaluation",
      kind: "DEVOIR",
      date: new Date("2025-10-10"),
      maxScore: options.maxScore ?? 20,
      coefficient: options.coefficient ?? 1,
      status: options.status ?? "VALIDATED",
    },
  });

  await prisma.grade.createMany({
    data: context.students.map((student, index) => ({
      schoolId: fixtures.schoolA.id,
      evaluationId: evaluation.id,
      studentId: student.id,
      scoreCenti: scores[index] ?? null,
      isAbsent: scores[index] === null,
    })),
  });

  return evaluation;
}

describe("computeClassResults", () => {
  it("calcule une moyenne generale ponderee par les coefficients de matiere", async () => {
    const context = await setupClass();
    // Francais (coef. 4) : 16 ; Mathematiques (coef. 2) : 10.
    await createEvaluation(context, context.french.id, [1600, 1200, 800]);
    await createEvaluation(context, context.maths.id, [1000, 1400, 600]);

    const { results } = await computeClassResults(
      fixtures.schoolA.id,
      context.classRoom.id,
      context.period.id,
    );

    const first = results.find((r) => r.studentId === context.students[0].id)!;
    // (16*4 + 10*2) / 6 = 14,00
    expect(first.averageCenti).toBe(1400);
    expect(first.totalCoefficient).toBe(6);
  });

  it("ignore les evaluations en brouillon", async () => {
    const context = await setupClass();
    await createEvaluation(context, context.french.id, [1600, 1600, 1600], { status: "DRAFT" });

    const { results } = await computeClassResults(
      fixtures.schoolA.id,
      context.classRoom.id,
      context.period.id,
    );

    // Aucune evaluation retenue : pas de moyenne, et surtout pas un zero.
    expect(results[0].averageCenti).toBeNull();
  });

  it("classe les eleves et gere les ex aequo", async () => {
    const context = await setupClass();
    await createEvaluation(context, context.french.id, [1600, 1600, 800]);

    const { ranks } = await computeClassResults(
      fixtures.schoolA.id,
      context.classRoom.id,
      context.period.id,
    );

    expect(ranks.get(context.students[0].id)).toBe(1);
    expect(ranks.get(context.students[1].id)).toBe(1);
    expect(ranks.get(context.students[2].id)).toBe(3);
  });

  it("calcule la moyenne de classe", async () => {
    const context = await setupClass();
    await createEvaluation(context, context.french.id, [1800, 1200, 600]);

    const { classAverageCenti } = await computeClassResults(
      fixtures.schoolA.id,
      context.classRoom.id,
      context.period.id,
    );
    expect(classAverageCenti).toBe(1200);
  });

  it("refuse une classe d'un autre etablissement", async () => {
    const context = await setupClass();
    await expect(
      computeClassResults(fixtures.schoolB.id, context.classRoom.id, context.period.id),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("generateReportCards", () => {
  it("fige les moyennes, les rangs et le detail par matiere", async () => {
    const context = await setupClass();
    await createEvaluation(context, context.french.id, [1600, 1200, 800]);
    await createEvaluation(context, context.maths.id, [1000, 1400, 600]);

    const result = await generateReportCards({
      schoolId: fixtures.schoolA.id,
      classRoomId: context.classRoom.id,
      gradingPeriodId: context.period.id,
      userId: fixtures.cashier.id,
    });

    expect(result.generated).toBe(3);

    const card = await prisma.reportCard.findUnique({
      where: {
        studentId_gradingPeriodId: {
          studentId: context.students[0].id,
          gradingPeriodId: context.period.id,
        },
      },
    });

    expect(card).not.toBeNull();
    expect(card!.averageCenti).toBe(1400);
    expect(card!.rank).toBe(1);
    expect(card!.classSize).toBe(3);

    const detail = JSON.parse(card!.detail) as { subjectName: string; averageCenti: number }[];
    expect(detail).toHaveLength(2);
    expect(detail.find((line) => line.subjectName === "Francais")?.averageCenti).toBe(1600);
  });

  it("peut etre regenere sans creer de doublon", async () => {
    const context = await setupClass();
    await createEvaluation(context, context.french.id, [1600, 1200, 800]);

    await generateReportCards({
      schoolId: fixtures.schoolA.id,
      classRoomId: context.classRoom.id,
      gradingPeriodId: context.period.id,
      userId: fixtures.cashier.id,
    });
    await generateReportCards({
      schoolId: fixtures.schoolA.id,
      classRoomId: context.classRoom.id,
      gradingPeriodId: context.period.id,
      userId: fixtures.cashier.id,
    });

    expect(await prisma.reportCard.count()).toBe(3);
  });

  it("conserve les valeurs figees si les notes changent apres generation", async () => {
    const context = await setupClass();
    const evaluation = await createEvaluation(context, context.french.id, [1600, 1200, 800]);

    await generateReportCards({
      schoolId: fixtures.schoolA.id,
      classRoomId: context.classRoom.id,
      gradingPeriodId: context.period.id,
      userId: fixtures.cashier.id,
    });

    // Modification d'une note APRES generation du bulletin.
    await prisma.grade.updateMany({
      where: { evaluationId: evaluation.id, studentId: context.students[0].id },
      data: { scoreCenti: 400 },
    });

    const card = await prisma.reportCard.findUnique({
      where: {
        studentId_gradingPeriodId: {
          studentId: context.students[0].id,
          gradingPeriodId: context.period.id,
        },
      },
    });
    // Le bulletin garde la valeur de l'instant de sa generation.
    expect(card!.averageCenti).toBe(1600);
  });
});

describe("publication des resultats", () => {
  it("publie les evaluations validees, verrouille la periode et notifie", async () => {
    const context = await setupClass();
    await createEvaluation(context, context.french.id, [1600, 1200, 800]);

    // Un parent rattache au premier eleve, avec un compte.
    const guardianUser = await prisma.user.create({
      data: {
        email: `parent-${Date.now()}@test.local`,
        passwordHash: "scrypt$placeholder",
        firstName: "Jean",
        lastName: "KOUASSI",
      },
    });
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: fixtures.schoolA.id,
        userId: guardianUser.id,
        firstName: "Jean",
        lastName: "KOUASSI",
      },
    });
    await prisma.studentGuardian.create({
      data: { studentId: context.students[0].id, guardianId: guardian.id, canViewGrades: true },
    });

    const result = await publishPeriodResults({
      schoolId: fixtures.schoolA.id,
      gradingPeriodId: context.period.id,
      userId: fixtures.cashier.id,
    });

    expect(result.publishedEvaluations).toBe(1);
    expect(result.notifiedUsers).toBeGreaterThan(0);

    const period = await prisma.gradingPeriod.findUnique({ where: { id: context.period.id } });
    expect(period!.status).toBe("LOCKED");
    expect(period!.resultsPublishedAt).not.toBeNull();

    const notification = await prisma.notification.findFirst({
      where: { userId: guardianUser.id, kind: "NOTES_PUBLIEES" },
    });
    expect(notification).not.toBeNull();
  });

  it("refuse une seconde publication", async () => {
    const context = await setupClass();
    await createEvaluation(context, context.french.id, [1600, 1200, 800]);

    await publishPeriodResults({
      schoolId: fixtures.schoolA.id,
      gradingPeriodId: context.period.id,
      userId: fixtures.cashier.id,
    });

    await expect(
      publishPeriodResults({
        schoolId: fixtures.schoolA.id,
        gradingPeriodId: context.period.id,
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("refuse de publier la periode d'un autre etablissement", async () => {
    const context = await setupClass();
    await expect(
      publishPeriodResults({
        schoolId: fixtures.schoolB.id,
        gradingPeriodId: context.period.id,
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("correction d'une note publiee", () => {
  it("trace la correction et exige un motif", async () => {
    const context = await setupClass();
    const evaluation = await createEvaluation(context, context.french.id, [1600, 1200, 800]);

    const grade = await prisma.grade.findFirst({
      where: { evaluationId: evaluation.id, studentId: context.students[0].id },
    });

    await expect(
      reviseGrade({
        schoolId: fixtures.schoolA.id,
        gradeId: grade!.id,
        newScoreCenti: 1800,
        newIsAbsent: false,
        reason: "   ",
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ConflictError);

    await reviseGrade({
      schoolId: fixtures.schoolA.id,
      gradeId: grade!.id,
      newScoreCenti: 1800,
      newIsAbsent: false,
      reason: "Erreur de report depuis la copie.",
      userId: fixtures.cashier.id,
    });

    const updated = await prisma.grade.findUnique({ where: { id: grade!.id } });
    expect(updated!.scoreCenti).toBe(1800);

    const revision = await prisma.gradeRevision.findFirst({ where: { gradeId: grade!.id } });
    expect(revision).not.toBeNull();
    expect(revision!.previousScoreCenti).toBe(1600);
    expect(revision!.newScoreCenti).toBe(1800);
    expect(revision!.reason).toContain("Erreur de report");

    const audit = await prisma.auditEvent.findFirst({ where: { action: "grade.revised" } });
    expect(audit).not.toBeNull();
  });

  it("refuse de corriger une note d'un autre etablissement", async () => {
    const context = await setupClass();
    const evaluation = await createEvaluation(context, context.french.id, [1600, 1200, 800]);
    const grade = await prisma.grade.findFirst({ where: { evaluationId: evaluation.id } });

    await expect(
      reviseGrade({
        schoolId: fixtures.schoolB.id,
        gradeId: grade!.id,
        newScoreCenti: 2000,
        newIsAbsent: false,
        reason: "Tentative inter-ecoles",
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("import d'eleves", () => {
  const header =
    "matricule;nom;prenom;sexe;date_de_naissance;classe;nom_parent;prenom_parent;telephone_parent";

  async function preview(content: string) {
    return previewStudentImport({
      schoolId: fixtures.schoolA.id,
      userId: fixtures.cashier.id,
      fileName: "import.csv",
      content,
      academicYearId: fixtures.yearA.id,
    });
  }

  it("analyse un fichier valide sans rien ecrire", async () => {
    const result = await preview(
      [header, ";DIALLO;Fatou;F;12/03/2014;;DIALLO;Moussa;0701020304"].join("\r\n"),
    );

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(0);

    // Apercu : aucun eleve cree a ce stade.
    expect(await prisma.student.count({ where: { schoolId: fixtures.schoolA.id } })).toBe(1);
  });

  it("signale les champs obligatoires manquants", async () => {
    const result = await preview([header, ";;Fatou;F;12/03/2014;;;;"].join("\r\n"));

    expect(result.validRows).toBe(0);
    expect(result.errorRows).toBe(1);
    expect(result.issues.some((issue) => issue.column === "nom")).toBe(true);
  });

  it("signale une date illisible", async () => {
    const result = await preview([header, ";DIALLO;Fatou;F;32/13/2014;;;;"].join("\r\n"));

    expect(result.errorRows).toBe(1);
    expect(
      result.issues.some(
        (issue) => issue.column === "date_de_naissance" && issue.severity === "ERREUR",
      ),
    ).toBe(true);
  });

  it("detecte un doublon avec un eleve deja enregistre", async () => {
    const result = await preview([header, "A-0001;KOUASSI;Awa;F;;;;;"].join("\r\n"));

    expect(result.duplicateRows).toBe(1);
    expect(result.validRows).toBe(0);
    expect(result.issues.some((issue) => issue.severity === "DOUBLON")).toBe(true);
  });

  it("detecte un doublon interne au fichier", async () => {
    const result = await preview(
      [header, ";DIALLO;Fatou;F;12/03/2014;;;;", ";DIALLO;Fatou;F;12/03/2014;;;;"].join("\r\n"),
    );

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
  });

  it("signale une classe inconnue", async () => {
    const result = await preview([header, ";DIALLO;Fatou;F;;CLASSE-INEXISTANTE;;;"].join("\r\n"));

    expect(result.unknownClassCodes).toContain("CLASSE-INEXISTANTE");
    expect(result.validRows).toBe(0);
  });

  it("accepte le separateur virgule et les accents", async () => {
    const result = await preview(
      ["nom,prenom,sexe", "DIALLO,Fatou,F", "KONÉ,Aminata,F"].join("\n"),
    );

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
  });

  it("refuse un fichier vide", async () => {
    await expect(preview("")).rejects.toThrow(ValidationError);
    await expect(preview(header)).rejects.toThrow(ValidationError);
  });

  it("n'importe que les lignes valides a la validation", async () => {
    const result = await preview(
      [
        header,
        ";DIALLO;Fatou;F;12/03/2014;;DIALLO;Moussa;0701020304",
        ";;SansNom;F;;;;;",
        "A-0001;KOUASSI;Awa;F;;;;;",
      ].join("\r\n"),
    );

    expect(result.validRows).toBe(1);

    const committed = await commitStudentImport({
      schoolId: fixtures.schoolA.id,
      batchId: result.batchId,
      userId: fixtures.cashier.id,
    });

    expect(committed.imported).toBe(1);
    expect(committed.failures).toHaveLength(0);

    const students = await prisma.student.findMany({ where: { schoolId: fixtures.schoolA.id } });
    expect(students).toHaveLength(2);
    expect(students.some((student) => student.lastName === "DIALLO")).toBe(true);

    // Le responsable legal a ete cree et rattache.
    const link = await prisma.studentGuardian.findFirst({
      include: { guardian: true },
    });
    expect(link?.guardian.lastName).toBe("DIALLO");
  });

  it("attribue un matricule automatique si la colonne est vide", async () => {
    const result = await preview([header, ";DIALLO;Fatou;F;;;;;"].join("\r\n"));
    await commitStudentImport({
      schoolId: fixtures.schoolA.id,
      batchId: result.batchId,
      userId: fixtures.cashier.id,
    });

    const student = await prisma.student.findFirst({ where: { lastName: "DIALLO" } });
    expect(student!.matricule).toMatch(/^ECOLE-A-\d{4}$/);
  });

  it("rattache la fratrie au meme responsable", async () => {
    const result = await preview(
      [
        header,
        ";DIALLO;Fatou;F;;;DIALLO;Moussa;0701020304",
        ";DIALLO;Ibrahim;M;;;DIALLO;Moussa;0701020304",
      ].join("\r\n"),
    );
    await commitStudentImport({
      schoolId: fixtures.schoolA.id,
      batchId: result.batchId,
      userId: fixtures.cashier.id,
    });

    // Un seul responsable cree malgre deux enfants.
    expect(await prisma.guardian.count({ where: { schoolId: fixtures.schoolA.id } })).toBe(1);
    expect(await prisma.studentGuardian.count()).toBe(2);
  });

  it("refuse de valider deux fois le meme import", async () => {
    const result = await preview([header, ";DIALLO;Fatou;F;;;;;"].join("\r\n"));
    await commitStudentImport({
      schoolId: fixtures.schoolA.id,
      batchId: result.batchId,
      userId: fixtures.cashier.id,
    });

    await expect(
      commitStudentImport({
        schoolId: fixtures.schoolA.id,
        batchId: result.batchId,
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("refuse de valider l'import d'un autre etablissement", async () => {
    const result = await preview([header, ";DIALLO;Fatou;F;;;;;"].join("\r\n"));

    await expect(
      commitStudentImport({
        schoolId: fixtures.schoolB.id,
        batchId: result.batchId,
        userId: fixtures.cashier.id,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("inscrit l'eleve et applique les frais quand la classe est fournie", async () => {
    const context = await setupClass();

    await prisma.feeItem.create({
      data: {
        schoolId: fixtures.schoolA.id,
        academicYearId: fixtures.yearA.id,
        code: "INSC",
        name: "Frais d'inscription",
        category: "INSCRIPTION",
        amountMinor: 50_000,
        autoAssign: true,
      },
    });

    const result = await preview([header, `;DIALLO;Fatou;F;;${context.classRoom.code};;;`].join("\r\n"));
    expect(result.validRows).toBe(1);

    await commitStudentImport({
      schoolId: fixtures.schoolA.id,
      batchId: result.batchId,
      userId: fixtures.cashier.id,
    });

    const student = await prisma.student.findFirst({ where: { lastName: "DIALLO" } });
    const enrollment = await prisma.enrollment.findFirst({ where: { studentId: student!.id } });
    expect(enrollment).not.toBeNull();

    const fee = await prisma.feeAssignment.findFirst({ where: { studentId: student!.id } });
    expect(fee?.grossAmountMinor).toBe(50_000);
  });
});
