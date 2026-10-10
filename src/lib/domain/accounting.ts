import { prisma, type Db } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { ACCOUNT_NORMAL_SIDE, type AccountType } from "@/lib/constants";
import { nextJournalReference } from "./sequences";

/**
 * Comptabilite en partie double.
 *
 * PRINCIPES APPLIQUES (cahier des charges 10) :
 *  - toute ecriture est equilibree : somme des debits = somme des credits ;
 *  - une ecriture VALIDEE (POSTED) n'est JAMAIS supprimee ni modifiee : on
 *    enregistre une contrepassation tracee qui pointe vers l'originale ;
 *  - une periode CLOTUREE refuse toute nouvelle ecriture ;
 *  - un bilan n'est jamais deduit des seuls encaissements et depenses : il est
 *    produit a partir des soldes du grand livre.
 */

export type JournalLineInput = {
  accountCode: string;
  label?: string;
  debitMinor?: number;
  creditMinor?: number;
};

/** Verifie l'equilibre et la coherence des lignes avant toute ecriture. */
export function assertBalanced(lines: readonly JournalLineInput[]): {
  totalDebitMinor: number;
  totalCreditMinor: number;
} {
  if (lines.length < 2) {
    throw new ValidationError("Une ecriture comptable comporte au moins deux lignes.");
  }

  let totalDebitMinor = 0;
  let totalCreditMinor = 0;

  for (const [index, line] of lines.entries()) {
    const debit = line.debitMinor ?? 0;
    const credit = line.creditMinor ?? 0;

    if (!Number.isInteger(debit) || !Number.isInteger(credit)) {
      throw new ValidationError(
        `Ligne ${index + 1} : les montants doivent etre des entiers en unites mineures.`,
      );
    }
    if (debit < 0 || credit < 0) {
      throw new ValidationError(
        `Ligne ${index + 1} : un montant comptable ne peut pas etre negatif. Inversez le sens debit/credit.`,
      );
    }
    if (debit > 0 && credit > 0) {
      throw new ValidationError(
        `Ligne ${index + 1} : une ligne porte soit un debit, soit un credit, jamais les deux.`,
      );
    }
    if (debit === 0 && credit === 0) {
      throw new ValidationError(`Ligne ${index + 1} : montant nul.`);
    }

    totalDebitMinor += debit;
    totalCreditMinor += credit;
  }

  if (totalDebitMinor !== totalCreditMinor) {
    throw new ValidationError(
      `Ecriture desequilibree : total debit ${totalDebitMinor} / total credit ${totalCreditMinor}.`,
    );
  }

  return { totalDebitMinor, totalCreditMinor };
}

/** Periode comptable contenant la date, si elle existe. Leve si elle est cloturee. */
async function resolveOpenPeriod(db: Db, schoolId: string, date: Date): Promise<string | null> {
  const period = await db.accountingPeriod.findFirst({
    where: { schoolId, startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true, name: true, status: true },
  });

  if (!period) return null;
  if (period.status === "CLOSED") {
    throw new ConflictError(
      `La periode comptable "${period.name}" est cloturee : aucune ecriture ne peut y etre ajoutee. ` +
        "Passez par une ecriture sur la periode ouverte suivante.",
    );
  }
  return period.id;
}

export type PostEntryInput = {
  schoolId: string;
  journalCode: string;
  date: Date;
  label: string;
  lines: JournalLineInput[];
  sourceType?: string;
  sourceId?: string;
  postedById?: string | null;
  /** DRAFT pour preparer sans valider ; POSTED valide immediatement. */
  status?: "DRAFT" | "POSTED";
};

/**
 * Cree (et valide) une ecriture. A appeler dans une transaction lorsqu'elle
 * accompagne une operation metier (encaissement, depense), afin que les deux
 * soient enregistrees ensemble ou pas du tout.
 */
export async function postJournalEntry(db: Db, input: PostEntryInput): Promise<{ id: string; reference: string }> {
  assertBalanced(input.lines);

  const periodId = await resolveOpenPeriod(db, input.schoolId, input.date);
  const reference = await nextJournalReference(db, input.schoolId, input.journalCode, input.date);
  const status = input.status ?? "POSTED";

  const accountCodes = Array.from(new Set(input.lines.map((line) => line.accountCode)));
  const accounts = await db.ledgerAccount.findMany({
    where: { schoolId: input.schoolId, code: { in: accountCodes } },
    select: { id: true, code: true },
  });

  const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
  const missing = accountCodes.filter((code) => !accountByCode.has(code));
  if (missing.length > 0) {
    throw new ValidationError(
      `Compte(s) absent(s) du plan comptable de cet etablissement : ${missing.join(", ")}.`,
    );
  }

  const entry = await db.journalEntry.create({
    data: {
      schoolId: input.schoolId,
      periodId,
      journalCode: input.journalCode,
      reference,
      date: input.date,
      label: input.label,
      status,
      sourceType: input.sourceType ?? "MANUAL",
      sourceId: input.sourceId ?? "",
      postedById: status === "POSTED" ? input.postedById ?? null : null,
      postedAt: status === "POSTED" ? new Date() : null,
      lines: {
        create: input.lines.map((line, index) => ({
          accountId: accountByCode.get(line.accountCode)!,
          label: line.label ?? input.label,
          debitMinor: line.debitMinor ?? 0,
          creditMinor: line.creditMinor ?? 0,
          sortOrder: index,
        })),
      },
    },
    select: { id: true, reference: true },
  });

  return entry;
}

/**
 * Contrepasse une ecriture validee : cree une ecriture miroir (debits et
 * credits inverses) et marque l'originale REVERSED. L'originale reste en base,
 * consultable, conformement a la piste d'audit.
 */
export async function reverseJournalEntry(
  db: Db,
  input: { schoolId: string; entryId: string; reason: string; postedById?: string | null; date?: Date },
): Promise<{ id: string; reference: string }> {
  const original = await db.journalEntry.findUnique({
    where: { id: input.entryId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });

  if (!original || original.schoolId !== input.schoolId) throw new NotFoundError("Ecriture introuvable.");
  if (original.status === "REVERSED") {
    throw new ConflictError("Cette ecriture a deja ete contrepassee.");
  }
  if (original.status !== "POSTED") {
    throw new ConflictError("Seule une ecriture validee peut etre contrepassee.");
  }

  const date = input.date ?? new Date();

  const reversal = await postJournalEntry(db, {
    schoolId: input.schoolId,
    journalCode: original.journalCode,
    date,
    label: `Contrepassation ${original.reference} - ${input.reason}`,
    sourceType: original.sourceType,
    sourceId: original.sourceId,
    postedById: input.postedById,
    // Inversion stricte : chaque debit devient credit et reciproquement.
    lines: original.lines.map((line) => ({
      accountCode: line.account.code,
      label: line.label,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
    })),
  });

  await db.journalEntry.update({
    where: { id: original.id },
    data: { status: "REVERSED" },
  });

  await db.journalEntry.update({
    where: { id: reversal.id },
    data: { reversalOfId: original.id },
  });

  return reversal;
}

// ---------------------------------------------------------------------------
// Etats comptables
// ---------------------------------------------------------------------------

export type AccountBalance = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  accountClass: number;
  debitMinor: number;
  creditMinor: number;
  /** Solde dans le sens naturel du compte (toujours positif si "normal"). */
  balanceMinor: number;
};

/**
 * Statuts d'ecriture pris en compte dans les etats comptables.
 *
 * POSTED et REVERSED sont tous deux inclus : une ecriture contrepassee a
 * REELLEMENT ete passee, elle reste au grand livre. C'est l'ecriture miroir
 * (elle-meme POSTED) qui l'annule, et la somme des deux vaut zero. Exclure
 * l'originale fausserait la balance du montant de la contrepassation.
 * Seuls les brouillons (DRAFT) sont ignores.
 */
const ACCOUNTED_STATUSES = ["POSTED", "REVERSED"];

/**
 * Balance generale : totaux debit/credit et solde par compte, pour les
 * ecritures comptabilisees (brouillons exclus).
 */
export async function computeTrialBalance(
  schoolId: string,
  options: { from?: Date; to?: Date; db?: Db } = {},
): Promise<AccountBalance[]> {
  const db = options.db ?? prisma;

  const lines = await db.journalLine.findMany({
    where: {
      entry: {
        schoolId,
        status: { in: ACCOUNTED_STATUSES },
        ...(options.from || options.to
          ? { date: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
          : {}),
      },
    },
    select: {
      debitMinor: true,
      creditMinor: true,
      account: { select: { id: true, code: true, name: true, type: true, accountClass: true } },
    },
  });

  const byAccount = new Map<string, AccountBalance>();

  for (const line of lines) {
    const existing = byAccount.get(line.account.id) ?? {
      accountId: line.account.id,
      code: line.account.code,
      name: line.account.name,
      type: line.account.type as AccountType,
      accountClass: line.account.accountClass,
      debitMinor: 0,
      creditMinor: 0,
      balanceMinor: 0,
    };

    existing.debitMinor += line.debitMinor;
    existing.creditMinor += line.creditMinor;
    byAccount.set(line.account.id, existing);
  }

  for (const balance of byAccount.values()) {
    balance.balanceMinor =
      ACCOUNT_NORMAL_SIDE[balance.type] === "DEBIT"
        ? balance.debitMinor - balance.creditMinor
        : balance.creditMinor - balance.debitMinor;
  }

  return Array.from(byAccount.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export type IncomeStatement = {
  revenues: AccountBalance[];
  expenses: AccountBalance[];
  totalRevenueMinor: number;
  totalExpenseMinor: number;
  /** Benefice si positif, perte si negatif. */
  resultMinor: number;
};

/**
 * Compte de resultat : produits (classe 7) moins charges (classe 6).
 * C'est la seule definition du RESULTAT utilisee par les tableaux de bord ;
 * il ne doit jamais etre confondu avec la tresorerie.
 */
export async function computeIncomeStatement(
  schoolId: string,
  options: { from?: Date; to?: Date; db?: Db } = {},
): Promise<IncomeStatement> {
  const balances = await computeTrialBalance(schoolId, options);

  const revenues = balances.filter((balance) => balance.type === "PRODUIT");
  const expenses = balances.filter((balance) => balance.type === "CHARGE");

  const totalRevenueMinor = revenues.reduce((total, item) => total + item.balanceMinor, 0);
  const totalExpenseMinor = expenses.reduce((total, item) => total + item.balanceMinor, 0);

  return {
    revenues,
    expenses,
    totalRevenueMinor,
    totalExpenseMinor,
    resultMinor: totalRevenueMinor - totalExpenseMinor,
  };
}

export type BalanceSheet = {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  totalAssetsMinor: number;
  totalLiabilitiesMinor: number;
  totalEquityMinor: number;
  /** Resultat de la periode, rattache aux capitaux propres. */
  resultMinor: number;
  /** Ecart actif - (passif + capitaux + resultat). Doit valoir 0. */
  differenceMinor: number;
  isBalanced: boolean;
};

/**
 * Bilan, produit exclusivement a partir des soldes du grand livre.
 * `isBalanced` permet a l'interface de signaler honnetement une anomalie
 * plutot que d'afficher un bilan faux.
 */
export async function computeBalanceSheet(
  schoolId: string,
  options: { from?: Date; to?: Date; db?: Db } = {},
): Promise<BalanceSheet> {
  const balances = await computeTrialBalance(schoolId, options);
  const income = await computeIncomeStatement(schoolId, options);

  const assets = balances.filter((balance) => balance.type === "ACTIF");
  const liabilities = balances.filter((balance) => balance.type === "PASSIF");
  const equity = balances.filter((balance) => balance.type === "CAPITAUX");

  const totalAssetsMinor = assets.reduce((total, item) => total + item.balanceMinor, 0);
  const totalLiabilitiesMinor = liabilities.reduce((total, item) => total + item.balanceMinor, 0);
  const totalEquityMinor = equity.reduce((total, item) => total + item.balanceMinor, 0);

  const differenceMinor =
    totalAssetsMinor - (totalLiabilitiesMinor + totalEquityMinor + income.resultMinor);

  return {
    assets,
    liabilities,
    equity,
    totalAssetsMinor,
    totalLiabilitiesMinor,
    totalEquityMinor,
    resultMinor: income.resultMinor,
    differenceMinor,
    isBalanced: differenceMinor === 0,
  };
}

/**
 * Grand livre d'un compte : mouvements detailles et solde progressif.
 */
export async function computeGeneralLedger(
  schoolId: string,
  accountCode: string,
  options: { from?: Date; to?: Date; db?: Db } = {},
): Promise<{
  account: { code: string; name: string; type: AccountType } | null;
  movements: {
    entryId: string;
    reference: string;
    date: Date;
    label: string;
    journalCode: string;
    debitMinor: number;
    creditMinor: number;
    runningBalanceMinor: number;
  }[];
}> {
  const db = options.db ?? prisma;

  const account = await db.ledgerAccount.findFirst({
    where: { schoolId, code: accountCode },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!account) return { account: null, movements: [] };

  const lines = await db.journalLine.findMany({
    where: {
      accountId: account.id,
      entry: {
        schoolId,
        status: { in: ACCOUNTED_STATUSES },
        ...(options.from || options.to
          ? { date: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
          : {}),
      },
    },
    select: {
      debitMinor: true,
      creditMinor: true,
      label: true,
      entry: { select: { id: true, reference: true, date: true, label: true, journalCode: true } },
    },
    orderBy: [{ entry: { date: "asc" } }, { entry: { reference: "asc" } }, { sortOrder: "asc" }],
  });

  const normalSide = ACCOUNT_NORMAL_SIDE[account.type as AccountType];
  let running = 0;

  const movements = lines.map((line) => {
    running +=
      normalSide === "DEBIT"
        ? line.debitMinor - line.creditMinor
        : line.creditMinor - line.debitMinor;

    return {
      entryId: line.entry.id,
      reference: line.entry.reference,
      date: line.entry.date,
      label: line.label || line.entry.label,
      journalCode: line.entry.journalCode,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      runningBalanceMinor: running,
    };
  });

  return {
    account: { code: account.code, name: account.name, type: account.type as AccountType },
    movements,
  };
}

/**
 * Plan comptable minimal inspire du SYSCOHADA revise, adapte a un
 * etablissement scolaire. Il est cree au seed et reste entierement modifiable
 * par l'etablissement.
 */
export const DEFAULT_CHART_OF_ACCOUNTS: {
  code: string;
  name: string;
  type: AccountType;
  accountClass: number;
}[] = [
  // Classe 1 - Ressources durables
  { code: "101", name: "Capital social", type: "CAPITAUX", accountClass: 1 },
  { code: "110", name: "Report a nouveau", type: "CAPITAUX", accountClass: 1 },
  { code: "120", name: "Resultat de l'exercice", type: "CAPITAUX", accountClass: 1 },
  { code: "162", name: "Emprunts aupres des etablissements de credit", type: "PASSIF", accountClass: 1 },

  // Classe 2 - Actif immobilise
  { code: "231", name: "Batiments", type: "ACTIF", accountClass: 2 },
  { code: "244", name: "Materiel et mobilier scolaire", type: "ACTIF", accountClass: 2 },
  { code: "245", name: "Materiel de transport", type: "ACTIF", accountClass: 2 },

  // Classe 3 - Stocks
  { code: "311", name: "Fournitures scolaires en stock", type: "ACTIF", accountClass: 3 },

  // Classe 4 - Tiers
  { code: "411", name: "Eleves et familles - creances", type: "ACTIF", accountClass: 4 },
  { code: "419", name: "Eleves et familles - avances recues", type: "PASSIF", accountClass: 4 },
  { code: "401", name: "Fournisseurs", type: "PASSIF", accountClass: 4 },
  { code: "422", name: "Personnel - remunerations dues", type: "PASSIF", accountClass: 4 },
  { code: "431", name: "Organismes sociaux", type: "PASSIF", accountClass: 4 },
  { code: "441", name: "Etat - impots et taxes", type: "PASSIF", accountClass: 4 },

  // Classe 5 - Tresorerie
  { code: "521", name: "Banque", type: "ACTIF", accountClass: 5 },
  { code: "531", name: "Mobile Money", type: "ACTIF", accountClass: 5 },
  { code: "571", name: "Caisse", type: "ACTIF", accountClass: 5 },

  // Classe 6 - Charges
  { code: "601", name: "Achats de fournitures scolaires", type: "CHARGE", accountClass: 6 },
  { code: "605", name: "Eau et electricite", type: "CHARGE", accountClass: 6 },
  { code: "622", name: "Locations et charges locatives", type: "CHARGE", accountClass: 6 },
  { code: "624", name: "Entretien, reparations et maintenance", type: "CHARGE", accountClass: 6 },
  { code: "625", name: "Primes d'assurance", type: "CHARGE", accountClass: 6 },
  { code: "627", name: "Transport", type: "CHARGE", accountClass: 6 },
  { code: "628", name: "Telecommunications et frais divers", type: "CHARGE", accountClass: 6 },
  { code: "641", name: "Impots et taxes", type: "CHARGE", accountClass: 6 },
  { code: "661", name: "Remunerations du personnel", type: "CHARGE", accountClass: 6 },
  { code: "664", name: "Charges sociales", type: "CHARGE", accountClass: 6 },

  // Classe 7 - Produits
  { code: "701", name: "Frais de scolarite", type: "PRODUIT", accountClass: 7 },
  { code: "702", name: "Frais d'inscription", type: "PRODUIT", accountClass: 7 },
  { code: "703", name: "Frais d'examen", type: "PRODUIT", accountClass: 7 },
  { code: "706", name: "Cantine, transport et services annexes", type: "PRODUIT", accountClass: 7 },
  { code: "709", name: "Remises et bourses accordees", type: "PRODUIT", accountClass: 7 },
  { code: "758", name: "Produits divers", type: "PRODUIT", accountClass: 7 },
];

/** Compte de tresorerie correspondant a un mode de reglement. */
export function treasuryAccountForMethod(method: string): string {
  switch (method) {
    case "ESPECES":
      return "571";
    case "VIREMENT":
    case "CHEQUE":
      return "521";
    case "MOBILE_MONEY":
    case "EN_LIGNE":
      return "531";
    default:
      return "571";
  }
}

/** Journal correspondant a un mode de reglement. */
export function journalForMethod(method: string): string {
  switch (method) {
    case "VIREMENT":
    case "CHEQUE":
      return "BQ";
    case "MOBILE_MONEY":
    case "EN_LIGNE":
      return "BQ";
    default:
      return "CA";
  }
}

/** Compte de produit correspondant a une categorie de frais. */
export function revenueAccountForCategory(category: string): string {
  switch (category) {
    case "INSCRIPTION":
      return "702";
    case "EXAMEN":
      return "703";
    case "CANTINE":
    case "TRANSPORT":
    case "LOGEMENT":
    case "TENUE":
    case "BIBLIOTHEQUE":
      return "706";
    case "SCOLARITE":
      return "701";
    default:
      return "758";
  }
}
