import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINANCE_SETTINGS,
  computeLatePenaltyMinor,
  daysLate,
  parseFinanceSettings,
  resolveSiblingPercentCenti,
  serializeFinanceSettings,
  type LateFeeSettings,
} from "@/lib/domain/finance-settings";

/**
 * Penalites de retard et remise fratrie.
 *
 * Ces calculs touchent directement a ce qu'une famille doit payer : chaque
 * regle est verifiee, y compris les cas ou la penalite doit valoir zero.
 */

const lateFee = (overrides: Partial<LateFeeSettings> = {}): LateFeeSettings => ({
  ...DEFAULT_FINANCE_SETTINGS.lateFee,
  enabled: true,
  graceDays: 0,
  capPercentCenti: null,
  ...overrides,
});

const due = new Date("2026-01-10T00:00:00Z");

describe("daysLate", () => {
  it("compte les jours entiers de retard", () => {
    expect(daysLate(due, new Date("2026-01-10T23:59:00Z"))).toBe(0);
    expect(daysLate(due, new Date("2026-01-11T00:01:00Z"))).toBe(1);
    expect(daysLate(due, new Date("2026-02-09T12:00:00Z"))).toBe(30);
  });

  it("ne compte jamais de retard negatif avant l'echeance", () => {
    expect(daysLate(due, new Date("2026-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("computeLatePenaltyMinor", () => {
  const installment = { amountMinor: 100_000, dueDate: due, paidMinor: 0 };
  const asOf = new Date("2026-01-20T00:00:00Z"); // 10 jours de retard

  it("ne calcule rien quand les penalites sont desactivees", () => {
    expect(
      computeLatePenaltyMinor(installment, asOf, lateFee({ enabled: false, fixedMinor: 5_000 })),
    ).toBe(0);
  });

  it("ne penalise pas une echeance soldee, meme payee en retard", () => {
    expect(
      computeLatePenaltyMinor(
        { ...installment, paidMinor: 100_000 },
        asOf,
        lateFee({ mode: "FIXE", fixedMinor: 5_000 }),
      ),
    ).toBe(0);
  });

  it("ne penalise pas avant l'echeance", () => {
    expect(
      computeLatePenaltyMinor(
        installment,
        new Date("2026-01-05T00:00:00Z"),
        lateFee({ mode: "FIXE", fixedMinor: 5_000 }),
      ),
    ).toBe(0);
  });

  it("respecte les jours de tolerance", () => {
    const settings = lateFee({ mode: "FIXE", fixedMinor: 5_000, graceDays: 15 });
    // 10 jours de retard, tolerance de 15 : rien.
    expect(computeLatePenaltyMinor(installment, asOf, settings)).toBe(0);
    // 20 jours de retard : la penalite s'applique.
    expect(
      computeLatePenaltyMinor(installment, new Date("2026-01-30T00:00:00Z"), settings),
    ).toBe(5_000);
  });

  it("applique un montant fixe", () => {
    expect(
      computeLatePenaltyMinor(installment, asOf, lateFee({ mode: "FIXE", fixedMinor: 5_000 })),
    ).toBe(5_000);
  });

  it("applique un pourcentage du reste du, pas du montant initial", () => {
    // 5 % de 40 000 restants = 2 000, et non 5 % de 100 000.
    expect(
      computeLatePenaltyMinor(
        { ...installment, paidMinor: 60_000 },
        asOf,
        lateFee({ mode: "POURCENTAGE", percentCenti: 500 }),
      ),
    ).toBe(2_000);
  });

  it("applique un pourcentage par jour de retard", () => {
    // 0,5 % par jour pendant 10 jours = 5 % de 100 000 = 5 000.
    expect(
      computeLatePenaltyMinor(
        installment,
        asOf,
        lateFee({ mode: "POURCENTAGE_PAR_JOUR", percentCenti: 50 }),
      ),
    ).toBe(5_000);
  });

  it("plafonne la penalite en pourcentage du montant de l'echeance", () => {
    // Sans plafond : 0,5 %/jour sur 200 jours depasserait le montant du.
    const settings = lateFee({
      mode: "POURCENTAGE_PAR_JOUR",
      percentCenti: 50,
      capPercentCenti: 2000,
    });
    expect(
      computeLatePenaltyMinor(installment, new Date("2026-12-31T00:00:00Z"), settings),
    ).toBe(20_000);
  });

  it("ne renvoie jamais de penalite negative", () => {
    expect(
      computeLatePenaltyMinor(installment, asOf, lateFee({ mode: "FIXE", fixedMinor: 0 })),
    ).toBe(0);
  });
});

describe("resolveSiblingPercentCenti", () => {
  const settings = {
    enabled: true,
    tiers: [
      { minChildren: 2, percentCenti: 500 },
      { minChildren: 3, percentCenti: 1000 },
      { minChildren: 5, percentCenti: 2000 },
    ],
    categories: ["SCOLARITE"],
  };

  it("ne donne rien quand la remise est desactivee", () => {
    expect(resolveSiblingPercentCenti(4, { ...settings, enabled: false })).toBe(0);
  });

  it("ne donne rien sous le premier palier", () => {
    expect(resolveSiblingPercentCenti(1, settings)).toBe(0);
  });

  it("retient le palier le plus eleve atteint", () => {
    expect(resolveSiblingPercentCenti(2, settings)).toBe(500);
    expect(resolveSiblingPercentCenti(3, settings)).toBe(1000);
    // 4 enfants : le palier 5 n'est pas atteint, on reste a celui de 3.
    expect(resolveSiblingPercentCenti(4, settings)).toBe(1000);
    expect(resolveSiblingPercentCenti(9, settings)).toBe(2000);
  });
});

describe("parseFinanceSettings", () => {
  it("retourne les valeurs par defaut sur une entree vide ou corrompue", () => {
    expect(parseFinanceSettings(null)).toEqual(DEFAULT_FINANCE_SETTINGS);
    expect(parseFinanceSettings("{pas du json")).toEqual(DEFAULT_FINANCE_SETTINGS);
  });

  it("n'active rien par defaut", () => {
    const settings = parseFinanceSettings("{}");
    expect(settings.lateFee.enabled).toBe(false);
    expect(settings.siblingDiscount.enabled).toBe(false);
  });

  it("corrige un mode de penalite inconnu", () => {
    const settings = parseFinanceSettings(JSON.stringify({ lateFee: { mode: "N_IMPORTE_QUOI" } }));
    expect(settings.lateFee.mode).toBe(DEFAULT_FINANCE_SETTINGS.lateFee.mode);
  });

  it("refuse les valeurs negatives", () => {
    const settings = parseFinanceSettings(
      JSON.stringify({ lateFee: { graceDays: -5, fixedMinor: -100, percentCenti: -50 } }),
    );
    expect(settings.lateFee.graceDays).toBe(0);
    expect(settings.lateFee.fixedMinor).toBe(0);
    expect(settings.lateFee.percentCenti).toBe(0);
  });

  it("distingue un plafond absent d'un plafond a zero", () => {
    expect(parseFinanceSettings(JSON.stringify({ lateFee: { capPercentCenti: null } })).lateFee
      .capPercentCenti).toBeNull();
    expect(parseFinanceSettings(JSON.stringify({ lateFee: { capPercentCenti: 0 } })).lateFee
      .capPercentCenti).toBe(0);
  });

  it("trie les paliers fratrie par nombre d'enfants croissant", () => {
    const settings = parseFinanceSettings(
      JSON.stringify({
        siblingDiscount: {
          enabled: true,
          tiers: [
            { minChildren: 5, percentCenti: 2000 },
            { minChildren: 2, percentCenti: 500 },
          ],
        },
      }),
    );
    expect(settings.siblingDiscount.tiers.map((tier) => tier.minChildren)).toEqual([2, 5]);
  });

  it("fait un aller-retour fidele", () => {
    const settings = parseFinanceSettings(
      serializeFinanceSettings({
        ...DEFAULT_FINANCE_SETTINGS,
        lateFee: { ...DEFAULT_FINANCE_SETTINGS.lateFee, enabled: true, fixedMinor: 2_500 },
      }),
    );
    expect(settings.lateFee.enabled).toBe(true);
    expect(settings.lateFee.fixedMinor).toBe(2_500);
  });
});
