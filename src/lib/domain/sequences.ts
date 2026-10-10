import type { Db } from "@/lib/prisma";
import { ConflictError } from "@/lib/errors";

/**
 * Generation des identifiants lisibles : matricules, references de paiement,
 * numeros de recu, references d'ecriture.
 *
 * Exigence : unicite PAR ETABLISSEMENT, sans trou exploitable et sans collision
 * en cas d'operations simultanees. Le compteur est incremente en base (et non
 * calcule par un COUNT) : deux caisses qui encaissent en meme temps ne peuvent
 * pas obtenir le meme numero.
 *
 * Ces fonctions DOIVENT etre appelees a l'interieur d'une transaction.
 */

/**
 * Developpe un motif de matricule.
 * Jetons : {SCHOOL} code ecole, {YEAR} annee sur 4, {YY} sur 2, {SEQ:n} compteur.
 */
export function renderMatricule(
  pattern: string,
  values: { schoolCode: string; year: number; sequence: number },
): string {
  return pattern
    .replace(/\{SCHOOL\}/g, values.schoolCode.toUpperCase())
    .replace(/\{YEAR\}/g, String(values.year))
    .replace(/\{YY\}/g, String(values.year).slice(-2))
    .replace(/\{SEQ:(\d+)\}/g, (_match, width: string) =>
      String(values.sequence).padStart(Number.parseInt(width, 10), "0"),
    )
    .replace(/\{SEQ\}/g, String(values.sequence));
}

/**
 * Attribue le prochain matricule d'un etablissement.
 * L'increment et la lecture se font dans la meme requete atomique.
 */
export async function nextMatricule(db: Db, schoolId: string, year?: number): Promise<string> {
  const school = await db.school.update({
    where: { id: schoolId },
    data: { matriculeCounter: { increment: 1 } },
    select: { code: true, matriculePattern: true, matriculeCounter: true },
  });

  return renderMatricule(school.matriculePattern, {
    schoolCode: school.code,
    year: year ?? new Date().getFullYear(),
    sequence: school.matriculeCounter,
  });
}

/**
 * Prochain numero sequentiel d'une serie documentaire.
 *
 * Implementation : on lit le plus grand numero existant pour le prefixe et on
 * ajoute 1, le tout dans la transaction appelante. La contrainte d'unicite
 * @@unique([schoolId, reference]) en base reste le garde-fou final : si deux
 * transactions concurrentes produisaient le meme numero, la seconde echouerait
 * a l'ecriture plutot que de creer un doublon silencieux.
 */
async function nextNumbered(
  db: Db,
  options: {
    schoolId: string;
    prefix: string;
    width: number;
    existing: (prefix: string) => Promise<string | null>;
  },
): Promise<string> {
  const last = await options.existing(options.prefix);
  const lastSequence = last
    ? Number.parseInt(last.slice(options.prefix.length).replace(/\D/g, ""), 10) || 0
    : 0;
  return `${options.prefix}${String(lastSequence + 1).padStart(options.width, "0")}`;
}

function yearMonthPrefix(base: string, date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${base}-${year}${month}-`;
}

/** Reference de paiement : PAY-202610-00042 */
export async function nextPaymentReference(db: Db, schoolId: string, date = new Date()): Promise<string> {
  const prefix = yearMonthPrefix("PAY", date);
  return nextNumbered(db, {
    schoolId,
    prefix,
    width: 5,
    existing: async (p) => {
      const found = await db.payment.findFirst({
        where: { schoolId, reference: { startsWith: p } },
        orderBy: { reference: "desc" },
        select: { reference: true },
      });
      return found?.reference ?? null;
    },
  });
}

/** Numero de recu : REC-202610-00042 */
export async function nextReceiptNumber(db: Db, schoolId: string, date = new Date()): Promise<string> {
  const prefix = yearMonthPrefix("REC", date);
  return nextNumbered(db, {
    schoolId,
    prefix,
    width: 5,
    existing: async (p) => {
      const found = await db.receipt.findFirst({
        where: { schoolId, number: { startsWith: p } },
        orderBy: { number: "desc" },
        select: { number: true },
      });
      return found?.number ?? null;
    },
  });
}

/** Reference de depense : DEP-202610-00042 */
export async function nextExpenseReference(db: Db, schoolId: string, date = new Date()): Promise<string> {
  const prefix = yearMonthPrefix("DEP", date);
  return nextNumbered(db, {
    schoolId,
    prefix,
    width: 5,
    existing: async (p) => {
      const found = await db.expense.findFirst({
        where: { schoolId, reference: { startsWith: p } },
        orderBy: { reference: "desc" },
        select: { reference: true },
      });
      return found?.reference ?? null;
    },
  });
}

/** Reference d'ecriture comptable : OD-202610-00042 (prefixee par le journal). */
export async function nextJournalReference(
  db: Db,
  schoolId: string,
  journalCode: string,
  date = new Date(),
): Promise<string> {
  const prefix = yearMonthPrefix(journalCode, date);
  return nextNumbered(db, {
    schoolId,
    prefix,
    width: 5,
    existing: async (p) => {
      const found = await db.journalEntry.findFirst({
        where: { schoolId, reference: { startsWith: p } },
        orderBy: { reference: "desc" },
        select: { reference: true },
      });
      return found?.reference ?? null;
    },
  });
}

/** Numero de facture d'abonnement SaaS (global, pas par ecole). */
export async function nextSaasInvoiceNumber(db: Db, date = new Date()): Promise<string> {
  const prefix = yearMonthPrefix("SAAS", date);
  const found = await db.saasInvoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastSequence = found ? Number.parseInt(found.number.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastSequence + 1).padStart(5, "0")}`;
}

/** Numero de personnel : PERS-0042 */
export async function nextStaffNumber(db: Db, schoolId: string): Promise<string> {
  const found = await db.staff.findFirst({
    where: { schoolId, staffNumber: { startsWith: "PERS-" } },
    orderBy: { staffNumber: "desc" },
    select: { staffNumber: true },
  });
  const lastSequence = found ? Number.parseInt(found.staffNumber.slice(5), 10) || 0 : 0;
  return `PERS-${String(lastSequence + 1).padStart(4, "0")}`;
}

/**
 * Traduit une violation de contrainte d'unicite Prisma (P2002) en message
 * metier comprehensible, au lieu d'exposer une erreur technique.
 */
export function translateUniqueViolation(error: unknown, fallbackMessage: string): never {
  const prismaError = error as { code?: string; meta?: { target?: string[] | string } };
  if (prismaError?.code === "P2002") {
    const target = Array.isArray(prismaError.meta?.target)
      ? prismaError.meta.target.join(", ")
      : String(prismaError.meta?.target ?? "");
    throw new ConflictError(
      `${fallbackMessage}${target ? ` (champ concerne : ${target})` : ""}`,
    );
  }
  throw error;
}
