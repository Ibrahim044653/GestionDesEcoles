import { percentOf } from "@/lib/money";

/**
 * Reglages financiers de l'etablissement (penalites de retard, remise
 * fratrie). Stockes en JSON dans `School.accountingSettings`.
 *
 * Module PUR : aucun acces base, entierement testable.
 *
 * Choix de conception : rien n'est active par defaut. Une penalite de retard
 * et une remise fratrie engagent la relation avec les familles ; elles doivent
 * resulter d'une decision explicite de l'etablissement, pas d'un reglage
 * herite a son insu.
 */

export type LateFeeMode =
  /** Montant fixe, quelle que soit la duree du retard. */
  | "FIXE"
  /** Pourcentage du reste du, applique une seule fois. */
  | "POURCENTAGE"
  /** Pourcentage du reste du par jour de retard. */
  | "POURCENTAGE_PAR_JOUR";

export type LateFeeSettings = {
  enabled: boolean;
  mode: LateFeeMode;
  /** Jours de tolerance apres l'echeance avant toute penalite. */
  graceDays: number;
  /** Montant en unites mineures, pour le mode FIXE. */
  fixedMinor: number;
  /** Taux en centiemes de pourcent (1000 = 10,00 %). */
  percentCenti: number;
  /**
   * Plafond de la penalite, en centiemes de pourcent du montant de l'echeance.
   * null = pas de plafond. Sans plafond, un mode « par jour » devient vite
   * disproportionne.
   */
  capPercentCenti: number | null;
};

export type SiblingTier = {
  /** Nombre d'enfants scolarises a partir duquel le palier s'applique. */
  minChildren: number;
  /** Remise en centiemes de pourcent. */
  percentCenti: number;
};

export type SiblingDiscountSettings = {
  enabled: boolean;
  tiers: SiblingTier[];
  /** Categories de frais concernees (SCOLARITE, INSCRIPTION...). */
  categories: string[];
};

export type FinanceSettings = {
  lateFee: LateFeeSettings;
  siblingDiscount: SiblingDiscountSettings;
};

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  lateFee: {
    enabled: false,
    mode: "FIXE",
    graceDays: 7,
    fixedMinor: 0,
    percentCenti: 0,
    capPercentCenti: 2000, // 20 % du montant de l'echeance
  },
  siblingDiscount: {
    enabled: false,
    tiers: [
      { minChildren: 2, percentCenti: 500 },
      { minChildren: 3, percentCenti: 1000 },
    ],
    categories: ["SCOLARITE"],
  },
};

const LATE_FEE_MODES: LateFeeMode[] = ["FIXE", "POURCENTAGE", "POURCENTAGE_PAR_JOUR"];

/** Lecture tolerante : un reglage corrompu retombe sur les valeurs par defaut. */
export function parseFinanceSettings(raw: string | null | undefined): FinanceSettings {
  if (!raw) return DEFAULT_FINANCE_SETTINGS;

  let parsed: Partial<FinanceSettings>;
  try {
    parsed = JSON.parse(raw) as Partial<FinanceSettings>;
  } catch {
    return DEFAULT_FINANCE_SETTINGS;
  }

  const lateFee = { ...DEFAULT_FINANCE_SETTINGS.lateFee, ...(parsed.lateFee ?? {}) };
  if (!LATE_FEE_MODES.includes(lateFee.mode)) lateFee.mode = DEFAULT_FINANCE_SETTINGS.lateFee.mode;
  lateFee.graceDays = Math.max(0, Math.round(lateFee.graceDays || 0));
  lateFee.fixedMinor = Math.max(0, Math.round(lateFee.fixedMinor || 0));
  lateFee.percentCenti = Math.max(0, Math.round(lateFee.percentCenti || 0));
  lateFee.capPercentCenti =
    lateFee.capPercentCenti === null || lateFee.capPercentCenti === undefined
      ? null
      : Math.max(0, Math.round(lateFee.capPercentCenti));

  const sibling = {
    ...DEFAULT_FINANCE_SETTINGS.siblingDiscount,
    ...(parsed.siblingDiscount ?? {}),
  };

  sibling.tiers = Array.isArray(sibling.tiers)
    ? sibling.tiers
        .filter(
          (tier) =>
            tier && Number.isFinite(tier.minChildren) && Number.isFinite(tier.percentCenti),
        )
        .map((tier) => ({
          minChildren: Math.max(1, Math.round(tier.minChildren)),
          percentCenti: Math.max(0, Math.round(tier.percentCenti)),
        }))
        // Tri croissant : `resolveSiblingPercentCenti` retient le dernier palier atteint.
        .sort((a, b) => a.minChildren - b.minChildren)
    : [];

  sibling.categories = Array.isArray(sibling.categories)
    ? sibling.categories.filter((category) => typeof category === "string" && category.length > 0)
    : [];

  return { lateFee, siblingDiscount: sibling };
}

export function serializeFinanceSettings(settings: FinanceSettings): string {
  return JSON.stringify(settings);
}

/** Jours entiers de retard, bornes a 0. Compare des dates UTC, pas des heures. */
export function daysLate(dueDate: Date, asOf: Date): number {
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const now = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Math.max(0, Math.floor((now - due) / 86_400_000));
}

/**
 * Penalite de retard d'une echeance, en unites mineures.
 *
 * Elle porte sur le RESTE DU, pas sur le montant initial : une famille qui a
 * deja paye l'essentiel ne doit pas etre penalisee comme si elle n'avait rien
 * verse. Une echeance soldee ne genere jamais de penalite, meme payee en
 * retard : la penalite se decide avant l'encaissement, pas apres.
 */
export function computeLatePenaltyMinor(
  installment: { amountMinor: number; dueDate: Date; paidMinor: number },
  asOf: Date,
  settings: LateFeeSettings,
): number {
  if (!settings.enabled) return 0;

  const outstanding = installment.amountMinor - installment.paidMinor;
  if (outstanding <= 0) return 0;

  const late = daysLate(installment.dueDate, asOf) - settings.graceDays;
  if (late <= 0) return 0;

  let penalty: number;
  switch (settings.mode) {
    case "FIXE":
      penalty = settings.fixedMinor;
      break;
    case "POURCENTAGE":
      penalty = percentOf(outstanding, settings.percentCenti);
      break;
    case "POURCENTAGE_PAR_JOUR":
      penalty = percentOf(outstanding, settings.percentCenti * late);
      break;
  }

  if (settings.capPercentCenti !== null) {
    penalty = Math.min(penalty, percentOf(installment.amountMinor, settings.capPercentCenti));
  }

  return Math.max(0, penalty);
}

/**
 * Taux de remise fratrie applicable, en centiemes de pourcent.
 * Retourne 0 si la remise est desactivee ou si aucun palier n'est atteint.
 */
export function resolveSiblingPercentCenti(
  childCount: number,
  settings: SiblingDiscountSettings,
): number {
  if (!settings.enabled) return 0;

  let applicable = 0;
  for (const tier of settings.tiers) {
    if (childCount >= tier.minChildren) applicable = tier.percentCenti;
  }
  return applicable;
}
