import { prisma, type Db } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

/**
 * Module optionnel BIBLIOTHEQUE : fonds documentaire et prets.
 *
 * Deux regles structurent tout le module :
 *
 *  1. La DISPONIBILITE est calculee, jamais stockee. Un compteur
 *     « exemplaires disponibles » que l'on incremente et decremente finit
 *     toujours par deriver (pret annule, retour oublie, suppression). Ici,
 *     disponible = exemplaires detenus − prets en cours. Le chiffre affiche
 *     ne peut donc pas mentir.
 *
 *  2. Un pret est attribue a UN emprunteur : un eleve ou un membre du
 *     personnel, jamais les deux ni aucun. Sans cela, un ouvrage perdu
 *     n'aurait personne a qui etre rattache.
 */

export const LOAN_STATUSES = ["EN_COURS", "RENDU", "PERDU"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

/** Duree de pret par defaut, en jours. */
export const DEFAULT_LOAN_DAYS = 14;

/** Exemplaires encore empruntables pour un ouvrage. */
export async function availableCopies(itemId: string, db: Db = prisma): Promise<number> {
  const [item, active] = await Promise.all([
    db.libraryItem.findUnique({ where: { id: itemId }, select: { totalCopies: true } }),
    db.libraryLoan.count({ where: { itemId, status: "EN_COURS" } }),
  ]);

  if (!item) return 0;
  // Jamais negatif : un fonds reduit alors que des prets courent afficherait
  // sinon un nombre absurde.
  return Math.max(0, item.totalCopies - active);
}

/**
 * Enregistre un pret.
 *
 * Refuse si plus aucun exemplaire n'est disponible : preter un livre qu'on n'a
 * pas cree une dette invisible envers le lecteur suivant.
 */
export async function lendItem(input: {
  schoolId: string;
  itemId: string;
  studentId?: string | null;
  staffId?: string | null;
  dueDate: Date;
  notes?: string;
  userId: string;
}): Promise<{ loanId: string }> {
  const studentId = input.studentId || null;
  const staffId = input.staffId || null;

  if (Boolean(studentId) === Boolean(staffId)) {
    throw new ValidationError(
      "Choisissez exactement un emprunteur : un eleve ou un membre du personnel.",
      { studentId: ["Un seul emprunteur est attendu."] },
    );
  }

  if (Number.isNaN(input.dueDate.getTime())) {
    throw new ValidationError("Date de retour invalide.", { dueDate: ["Date non reconnue."] });
  }

  const item = await prisma.libraryItem.findUnique({
    where: { id: input.itemId },
    select: { id: true, schoolId: true, title: true, isActive: true },
  });

  if (!item || item.schoolId !== input.schoolId) throw new NotFoundError("Ouvrage introuvable.");
  if (!item.isActive) throw new ConflictError("Cet ouvrage est retire du fonds.");

  // Verrou de tenant sur l'emprunteur : on ne prete pas a un eleve d'une
  // autre ecole, meme avec un identifiant valide.
  if (studentId) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, schoolId: input.schoolId },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Eleve introuvable.");
  } else {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId!, schoolId: input.schoolId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundError("Membre du personnel introuvable.");
  }

  const loanId = await prisma.$transaction(async (tx) => {
    // Le controle de disponibilite est fait DANS la transaction : deux agents
    // qui pretent le dernier exemplaire au meme instant ne doivent pas
    // reussir tous les deux.
    const available = await availableCopies(input.itemId, tx);
    if (available <= 0) {
      throw new ConflictError(`Aucun exemplaire disponible de « ${item.title} ».`);
    }

    // Un meme emprunteur ne garde pas deux exemplaires du meme titre.
    const duplicate = await tx.libraryLoan.findFirst({
      where: {
        itemId: input.itemId,
        status: "EN_COURS",
        ...(studentId ? { studentId } : { staffId }),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictError("Cet emprunteur detient deja un exemplaire de cet ouvrage.");
    }

    const loan = await tx.libraryLoan.create({
      data: {
        schoolId: input.schoolId,
        itemId: input.itemId,
        studentId,
        staffId,
        dueDate: input.dueDate,
        status: "EN_COURS",
        notes: (input.notes ?? "").slice(0, 300),
      },
      select: { id: true },
    });

    return loan.id;
  });

  await recordAudit({
    action: "library.loaned",
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "libraryLoan",
    entityId: loanId,
    metadata: { ouvrage: item.title, retourPrevu: input.dueDate.toISOString().slice(0, 10) },
  });

  return { loanId };
}

/**
 * Cloture un pret : retour ou perte.
 *
 * Le pret n'est pas supprime. Un exemplaire perdu doit rester visible dans
 * l'historique de l'emprunteur et dans l'etat du fonds.
 */
export async function closeLoan(input: {
  schoolId: string;
  loanId: string;
  status: Extract<LoanStatus, "RENDU" | "PERDU">;
  condition?: string;
  userId: string;
}): Promise<void> {
  const loan = await prisma.libraryLoan.findUnique({
    where: { id: input.loanId },
    include: { item: { select: { title: true, schoolId: true } } },
  });

  if (!loan || loan.item.schoolId !== input.schoolId) {
    throw new NotFoundError("Pret introuvable.");
  }

  if (loan.status !== "EN_COURS") {
    throw new ConflictError("Ce pret est deja cloture.");
  }

  await prisma.libraryLoan.update({
    where: { id: input.loanId },
    data: {
      status: input.status,
      returnedAt: new Date(),
      condition: (input.condition ?? "").slice(0, 200),
    },
  });

  await recordAudit({
    action: input.status === "RENDU" ? "library.returned" : "library.lost",
    schoolId: input.schoolId,
    userId: input.userId,
    entityType: "libraryLoan",
    entityId: input.loanId,
    metadata: { ouvrage: loan.item.title, etat: input.condition ?? "" },
  });
}

/**
 * Fonds documentaire avec disponibilite calculee.
 *
 * La disponibilite est obtenue par un comptage groupe plutot qu'une requete
 * par ouvrage : un fonds de plusieurs milliers de titres ne doit pas produire
 * autant de requetes.
 */
export async function listCatalog(
  schoolId: string,
  options: { query?: string; onlyAvailable?: boolean; db?: Db } = {},
) {
  const db = options.db ?? prisma;
  const query = (options.query ?? "").trim();

  const items = await db.libraryItem.findMany({
    where: {
      schoolId,
      isActive: true,
      ...(query
        ? {
            OR: [
              { title: { contains: query } },
              { author: { contains: query } },
              { reference: { contains: query } },
              { isbn: { contains: query } },
            ],
          }
        : {}),
    },
    orderBy: { title: "asc" },
    take: 300,
  });

  const counts = await db.libraryLoan.groupBy({
    by: ["itemId"],
    where: { schoolId, status: "EN_COURS" },
    _count: { _all: true },
  });

  const loanedByItem = new Map(counts.map((row) => [row.itemId, row._count._all]));

  const catalog = items.map((item) => {
    const loaned = loanedByItem.get(item.id) ?? 0;
    return { ...item, loanedCopies: loaned, availableCopies: Math.max(0, item.totalCopies - loaned) };
  });

  return options.onlyAvailable
    ? catalog.filter((item) => item.availableCopies > 0)
    : catalog;
}

/** Prets en cours, les plus en retard d'abord. */
export async function listActiveLoans(schoolId: string, db: Db = prisma) {
  const loans = await db.libraryLoan.findMany({
    where: { schoolId, status: "EN_COURS" },
    orderBy: { dueDate: "asc" },
    take: 300,
    include: {
      item: { select: { title: true, reference: true } },
      student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
      staff: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const today = new Date();
  return loans.map((loan) => ({
    ...loan,
    // Le retard se mesure au jour pres : un retour prevu aujourd'hui n'est
    // pas encore en retard.
    overdueDays: Math.max(
      0,
      Math.floor(
        (Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) -
          Date.UTC(
            loan.dueDate.getUTCFullYear(),
            loan.dueDate.getUTCMonth(),
            loan.dueDate.getUTCDate(),
          )) /
          86_400_000,
      ),
    ),
  }));
}
