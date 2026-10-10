/**
 * Arithmetique monetaire.
 *
 * REGLE ABSOLUE : aucun montant n'est jamais represente par un flottant binaire.
 * Tout montant est un entier exprime en UNITES MINEURES de sa devise :
 *   - XOF (franc CFA) : decimals = 0  -> 1 unite mineure = 1 franc
 *   - EUR / USD       : decimals = 2  -> 1 unite mineure = 1 centime
 *
 * Les pourcentages sont exprimes en CENTIEMES DE POURCENT (percentCenti) :
 *   10,00 % -> 1000 ; 33,33 % -> 3333. Cela evite 0.1 + 0.2 !== 0.3.
 */

/** Limite de securite : au-dela, les produits intermediaires sortent de Number.MAX_SAFE_INTEGER. */
const MAX_SAFE_MINOR = 9_007_199_254_740 / 10_000; // ~900 milliards d'unites mineures

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Valide qu'une valeur est un montant exploitable (entier, fini, dans les bornes). */
export function assertMinor(value: number, label = "montant"): number {
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `Le ${label} doit etre un entier en unites mineures (recu: ${value}).`,
    );
  }
  if (Math.abs(value) > MAX_SAFE_MINOR) {
    throw new MoneyError(`Le ${label} depasse la limite de precision supportee.`);
  }
  return value;
}

export function addMinor(...values: number[]): number {
  return values.reduce<number>((total, value) => total + assertMinor(value), 0);
}

export function subMinor(a: number, b: number): number {
  return assertMinor(a) - assertMinor(b);
}

/** Somme d'une liste d'objets via un selecteur. */
export function sumBy<T>(items: readonly T[], select: (item: T) => number): number {
  return items.reduce<number>((total, item) => total + assertMinor(select(item)), 0);
}

/** Ne descend jamais sous zero (utile pour un solde restant du). */
export function clampPositive(value: number): number {
  return value > 0 ? value : 0;
}

/**
 * Applique un pourcentage exprime en centiemes de pourcent.
 * Arrondi au demi-superieur (round-half-up) sur la valeur absolue, pour que
 * -x produise exactement l'oppose de +x.
 */
export function percentOf(amountMinor: number, percentCenti: number): number {
  assertMinor(amountMinor);
  if (!Number.isInteger(percentCenti)) {
    throw new MoneyError("Un pourcentage doit etre exprime en centiemes entiers (1000 = 10,00 %).");
  }
  const sign = amountMinor < 0 !== percentCenti < 0 ? -1 : 1;
  const product = Math.abs(amountMinor) * Math.abs(percentCenti);
  return sign * Math.round(product / 10_000);
}

/**
 * Repartit un montant en parts selon des poids entiers, SANS perdre ni creer
 * d'unite : la somme des parts est toujours exactement egale au montant.
 * Le reste de la division est distribue aux premieres parts (plus gros restes
 * d'abord), methode dite du "plus fort reste".
 */
export function allocate(amountMinor: number, weights: readonly number[]): number[] {
  assertMinor(amountMinor);
  if (weights.length === 0) throw new MoneyError("Aucune part a repartir.");
  if (weights.some((w) => w < 0)) throw new MoneyError("Les poids de repartition doivent etre positifs.");

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) {
    // Poids tous nuls : on met tout sur la premiere part pour ne rien perdre.
    return weights.map((_, index) => (index === 0 ? amountMinor : 0));
  }

  const base = weights.map((w) => Math.floor((amountMinor * w) / totalWeight));
  let remainder = amountMinor - base.reduce((a, b) => a + b, 0);

  const order = weights
    .map((w, index) => ({
      index,
      fraction: amountMinor * w - Math.floor((amountMinor * w) / totalWeight) * totalWeight,
    }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    base[order[cursor % order.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  while (remainder < 0 && order.length > 0) {
    base[order[cursor % order.length].index] -= 1;
    remainder += 1;
    cursor += 1;
  }
  return base;
}

/**
 * Impute un montant sur une liste de dettes dans l'ordre fourni
 * (typiquement : echeances par date). Retourne l'imputation et le trop-percu.
 */
export function allocateToDebts(
  amountMinor: number,
  debts: readonly { id: string; remainingMinor: number }[],
): { allocations: { id: string; amountMinor: number }[]; overpaidMinor: number } {
  assertMinor(amountMinor);
  if (amountMinor < 0) throw new MoneyError("Impossible d'imputer un montant negatif.");

  let left = amountMinor;
  const allocations: { id: string; amountMinor: number }[] = [];

  for (const debt of debts) {
    if (left <= 0) break;
    const due = clampPositive(assertMinor(debt.remainingMinor));
    if (due === 0) continue;
    const applied = Math.min(due, left);
    allocations.push({ id: debt.id, amountMinor: applied });
    left -= applied;
  }

  return { allocations, overpaidMinor: left };
}

// ---------------------------------------------------------------------------
// Conversion & formatage
// ---------------------------------------------------------------------------

/** Nombre de decimales d'une devise. XOF/XAF n'en ont aucune. */
export function currencyDecimals(currency: string): number {
  const zeroDecimal = ["XOF", "XAF", "JPY", "KRW", "CLP", "VND", "GNF", "RWF", "UGX", "DJF", "KMF"];
  return zeroDecimal.includes(currency.toUpperCase()) ? 0 : 2;
}

/** "12 500,75" ou "12500.75" -> unites mineures. Rejette les saisies invalides. */
export function parseAmountToMinor(input: string, decimals: number): number {
  const cleaned = String(input)
    .replace(/\s| | /g, "")
    .replace(/,/g, ".")
    .trim();

  if (cleaned === "") throw new MoneyError("Montant vide.");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new MoneyError(`Montant invalide : "${input}".`);
  }

  const negative = cleaned.startsWith("-");
  const [whole, fraction = ""] = cleaned.replace("-", "").split(".");

  if (fraction.length > decimals) {
    throw new MoneyError(
      decimals === 0
        ? "Cette devise n'accepte pas de decimales."
        : `Cette devise accepte au maximum ${decimals} decimale(s).`,
    );
  }

  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const minor = Number(whole) * 10 ** decimals + (decimals > 0 ? Number(padded || "0") : 0);
  return assertMinor(negative ? -minor : minor);
}

/** Unites mineures -> nombre "humain" (uniquement pour l'affichage, jamais pour calculer). */
export function minorToMajor(amountMinor: number, decimals: number): number {
  return amountMinor / 10 ** decimals;
}

/** Formate un montant selon la devise et la locale de l'etablissement. */
export function formatMoney(
  amountMinor: number,
  currency = "XOF",
  locale = "fr-CI",
  options: { withSymbol?: boolean } = {},
): string {
  const decimals = currencyDecimals(currency);
  const value = minorToMajor(amountMinor, decimals);
  const withSymbol = options.withSymbol ?? true;

  try {
    return new Intl.NumberFormat(locale, {
      style: withSymbol ? "currency" : "decimal",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    // Locale ou devise inconnue de l'environnement : repli lisible.
    const formatted = value.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return withSymbol ? `${formatted} ${currency}` : formatted;
  }
}

/** Formate un pourcentage stocke en centiemes de pourcent. */
export function formatPercent(percentCenti: number, locale = "fr-CI"): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: percentCenti % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(percentCenti / 10_000);
}

/** Taux de recouvrement en centiemes de pourcent (0 si rien n'est du). */
export function rateCenti(numeratorMinor: number, denominatorMinor: number): number {
  if (denominatorMinor <= 0) return 0;
  return Math.round((numeratorMinor * 10_000) / denominatorMinor);
}
