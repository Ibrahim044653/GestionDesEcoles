import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase, seedTwoSchools } from "./helpers/db";
import {
  availableCopies,
  closeLoan,
  lendItem,
  listActiveLoans,
  listCatalog,
} from "@/lib/domain/library";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Module bibliotheque.
 *
 * La disponibilite est CALCULEE : les tests verifient surtout qu'elle reste
 * exacte dans les cas ou un compteur stocke aurait derive (pret, retour,
 * perte, ouvrage retire).
 */

let seed: Awaited<ReturnType<typeof seedTwoSchools>>;
let itemA: { id: string };
let userId: string;

beforeEach(async () => {
  await resetDatabase();
  seed = await seedTwoSchools();

  const user = await prisma.user.create({
    data: {
      email: `biblio-${Math.random().toString(36).slice(2, 10)}@test.local`,
      passwordHash: "scrypt$placeholder",
      firstName: "Test",
      lastName: "BIBLIO",
    },
  });
  userId = user.id;

  itemA = await prisma.libraryItem.create({
    data: {
      schoolId: seed.schoolA.id,
      reference: "LIT-0001",
      title: "Une si longue lettre",
      author: "Mariama BA",
      totalCopies: 2,
    },
    select: { id: true },
  });
});

const inTwoWeeks = () => new Date(Date.now() + 14 * 86_400_000);

describe("disponibilite", () => {
  it("part du nombre d'exemplaires detenus", async () => {
    expect(await availableCopies(itemA.id)).toBe(2);
  });

  it("diminue a chaque pret et remonte au retour", async () => {
    const first = await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });
    expect(await availableCopies(itemA.id)).toBe(1);

    await closeLoan({
      schoolId: seed.schoolA.id,
      loanId: first.loanId,
      status: "RENDU",
      userId,
    });
    expect(await availableCopies(itemA.id)).toBe(2);
  });

  it("ne remonte pas quand l'exemplaire est declare perdu", async () => {
    const loan = await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });

    await closeLoan({
      schoolId: seed.schoolA.id,
      loanId: loan.loanId,
      status: "PERDU",
      userId,
    });

    // Le pret ne pese plus sur la disponibilite (il est clos), mais il reste
    // a l'historique : c'est le fonds detenu qu'il faut corriger.
    expect(await availableCopies(itemA.id)).toBe(2);
    const stored = await prisma.libraryLoan.findUniqueOrThrow({ where: { id: loan.loanId } });
    expect(stored.status).toBe("PERDU");
    expect(stored.returnedAt).not.toBeNull();
  });

  it("n'est jamais negative si le fonds est reduit sous les prets en cours", async () => {
    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });

    await prisma.libraryItem.update({ where: { id: itemA.id }, data: { totalCopies: 0 } });
    expect(await availableCopies(itemA.id)).toBe(0);
  });
});

describe("pret", () => {
  it("refuse un pret sans exemplaire disponible", async () => {
    const student2 = await prisma.student.create({
      data: {
        schoolId: seed.schoolA.id,
        matricule: "A-0002",
        firstName: "Koffi",
        lastName: "YAO",
      },
    });
    const student3 = await prisma.student.create({
      data: {
        schoolId: seed.schoolA.id,
        matricule: "A-0003",
        firstName: "Aya",
        lastName: "BAMBA",
      },
    });

    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });
    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: student2.id,
      dueDate: inTwoWeeks(),
      userId,
    });

    await expect(
      lendItem({
        schoolId: seed.schoolA.id,
        itemId: itemA.id,
        studentId: student3.id,
        dueDate: inTwoWeeks(),
        userId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await prisma.libraryLoan.count({ where: { status: "EN_COURS" } })).toBe(2);
  });

  it("refuse deux exemplaires du meme titre au meme emprunteur", async () => {
    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });

    await expect(
      lendItem({
        schoolId: seed.schoolA.id,
        itemId: itemA.id,
        studentId: seed.studentA.id,
        dueDate: inTwoWeeks(),
        userId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("exige exactement un emprunteur", async () => {
    await expect(
      lendItem({
        schoolId: seed.schoolA.id,
        itemId: itemA.id,
        dueDate: inTwoWeeks(),
        userId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const staff = await prisma.staff.create({
      data: {
        schoolId: seed.schoolA.id,
        staffNumber: "P-001",
        firstName: "Ange",
        lastName: "KONE",
      },
    });

    await expect(
      lendItem({
        schoolId: seed.schoolA.id,
        itemId: itemA.id,
        studentId: seed.studentA.id,
        staffId: staff.id,
        dueDate: inTwoWeeks(),
        userId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse un ouvrage d'un autre etablissement", async () => {
    await expect(
      lendItem({
        schoolId: seed.schoolB.id,
        itemId: itemA.id,
        studentId: seed.studentB.id,
        dueDate: inTwoWeeks(),
        userId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuse un emprunteur d'un autre etablissement", async () => {
    await expect(
      lendItem({
        schoolId: seed.schoolA.id,
        itemId: itemA.id,
        // L'eleve existe, mais dans l'ecole B.
        studentId: seed.studentB.id,
        dueDate: inTwoWeeks(),
        userId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await prisma.libraryLoan.count()).toBe(0);
  });

  it("refuse un ouvrage retire du fonds", async () => {
    await prisma.libraryItem.update({ where: { id: itemA.id }, data: { isActive: false } });

    await expect(
      lendItem({
        schoolId: seed.schoolA.id,
        itemId: itemA.id,
        studentId: seed.studentA.id,
        dueDate: inTwoWeeks(),
        userId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("cloture d'un pret", () => {
  it("refuse de cloturer deux fois", async () => {
    const loan = await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });

    await closeLoan({ schoolId: seed.schoolA.id, loanId: loan.loanId, status: "RENDU", userId });

    await expect(
      closeLoan({ schoolId: seed.schoolA.id, loanId: loan.loanId, status: "RENDU", userId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuse une cloture depuis un autre etablissement", async () => {
    const loan = await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });

    await expect(
      closeLoan({ schoolId: seed.schoolB.id, loanId: loan.loanId, status: "RENDU", userId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stored = await prisma.libraryLoan.findUniqueOrThrow({ where: { id: loan.loanId } });
    expect(stored.status).toBe("EN_COURS");
  });
});

describe("catalogue et prets en cours", () => {
  it("ne montre que le fonds de l'etablissement", async () => {
    await prisma.libraryItem.create({
      data: {
        schoolId: seed.schoolB.id,
        reference: "LIT-0001",
        title: "Ouvrage de l'ecole B",
        totalCopies: 5,
      },
    });

    const catalogA = await listCatalog(seed.schoolA.id);
    expect(catalogA).toHaveLength(1);
    expect(catalogA[0].title).toBe("Une si longue lettre");

    const catalogB = await listCatalog(seed.schoolB.id);
    expect(catalogB).toHaveLength(1);
    expect(catalogB[0].title).toBe("Ouvrage de l'ecole B");
  });

  it("recherche sur le titre, l'auteur et la cote", async () => {
    expect(await listCatalog(seed.schoolA.id, { query: "longue" })).toHaveLength(1);
    expect(await listCatalog(seed.schoolA.id, { query: "Mariama" })).toHaveLength(1);
    expect(await listCatalog(seed.schoolA.id, { query: "LIT-0001" })).toHaveLength(1);
    expect(await listCatalog(seed.schoolA.id, { query: "introuvable" })).toHaveLength(0);
  });

  it("filtre les ouvrages indisponibles sur demande", async () => {
    const student2 = await prisma.student.create({
      data: { schoolId: seed.schoolA.id, matricule: "A-0002", firstName: "Koffi", lastName: "YAO" },
    });

    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: inTwoWeeks(),
      userId,
    });
    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: student2.id,
      dueDate: inTwoWeeks(),
      userId,
    });

    expect(await listCatalog(seed.schoolA.id, { onlyAvailable: true })).toHaveLength(0);
    expect(await listCatalog(seed.schoolA.id)).toHaveLength(1);
  });

  it("calcule le retard en jours entiers", async () => {
    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      // Retour attendu il y a 3 jours.
      dueDate: new Date(Date.now() - 3 * 86_400_000),
      userId,
    });

    const loans = await listActiveLoans(seed.schoolA.id);
    expect(loans).toHaveLength(1);
    expect(loans[0].overdueDays).toBe(3);
  });

  it("ne compte pas de retard pour un retour attendu aujourd'hui", async () => {
    await lendItem({
      schoolId: seed.schoolA.id,
      itemId: itemA.id,
      studentId: seed.studentA.id,
      dueDate: new Date(),
      userId,
    });

    const loans = await listActiveLoans(seed.schoolA.id);
    expect(loans[0].overdueDays).toBe(0);
  });
});
