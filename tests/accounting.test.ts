import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  journalForMethod,
  revenueAccountForCategory,
  treasuryAccountForMethod,
  DEFAULT_CHART_OF_ACCOUNTS,
} from "@/lib/domain/accounting";
import { ACCOUNT_NORMAL_SIDE } from "@/lib/constants";
import { ValidationError } from "@/lib/errors";
import { buildInstallments, discountTotal, parseInstallmentPlan } from "@/lib/domain/fees";

/**
 * Comptabilite en partie double et construction des echeanciers.
 */

describe("assertBalanced", () => {
  it("accepte une ecriture equilibree", () => {
    const totals = assertBalanced([
      { accountCode: "571", debitMinor: 100_000 },
      { accountCode: "411", creditMinor: 100_000 },
    ]);
    expect(totals.totalDebitMinor).toBe(100_000);
    expect(totals.totalCreditMinor).toBe(100_000);
  });

  it("accepte une ecriture a plusieurs lignes", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "571", debitMinor: 150_000 },
        { accountCode: "411", creditMinor: 100_000 },
        { accountCode: "419", creditMinor: 50_000 },
      ]),
    ).not.toThrow();
  });

  it("refuse une ecriture desequilibree", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "571", debitMinor: 100_000 },
        { accountCode: "411", creditMinor: 90_000 },
      ]),
    ).toThrow(ValidationError);
  });

  it("refuse une ecriture a une seule ligne", () => {
    expect(() => assertBalanced([{ accountCode: "571", debitMinor: 100_000 }])).toThrow(
      ValidationError,
    );
  });

  it("refuse un montant negatif : il faut inverser le sens", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "571", debitMinor: -100_000 },
        { accountCode: "411", creditMinor: -100_000 },
      ]),
    ).toThrow(ValidationError);
  });

  it("refuse une ligne portant a la fois un debit et un credit", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "571", debitMinor: 100_000, creditMinor: 100_000 },
        { accountCode: "411", creditMinor: 100_000 },
      ]),
    ).toThrow(ValidationError);
  });

  it("refuse une ligne de montant nul", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "571", debitMinor: 0 },
        { accountCode: "411", creditMinor: 0 },
      ]),
    ).toThrow(ValidationError);
  });

  it("refuse un montant non entier", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "571", debitMinor: 100.5 },
        { accountCode: "411", creditMinor: 100.5 },
      ]),
    ).toThrow(ValidationError);
  });
});

describe("plan comptable par defaut", () => {
  it("ne contient aucun code en double", () => {
    const codes = DEFAULT_CHART_OF_ACCOUNTS.map((account) => account.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("couvre les cinq natures comptables", () => {
    const types = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((account) => account.type));
    expect(types).toContain("ACTIF");
    expect(types).toContain("PASSIF");
    expect(types).toContain("CAPITAUX");
    expect(types).toContain("PRODUIT");
    expect(types).toContain("CHARGE");
  });

  it("respecte la logique des classes SYSCOHADA", () => {
    // Classe 6 = charges, classe 7 = produits, classe 5 = tresorerie (actif).
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      if (account.accountClass === 6) expect(account.type).toBe("CHARGE");
      if (account.accountClass === 7) expect(account.type).toBe("PRODUIT");
      if (account.accountClass === 5) expect(account.type).toBe("ACTIF");
    }
  });

  it("definit un sens naturel pour chaque nature", () => {
    expect(ACCOUNT_NORMAL_SIDE.ACTIF).toBe("DEBIT");
    expect(ACCOUNT_NORMAL_SIDE.CHARGE).toBe("DEBIT");
    expect(ACCOUNT_NORMAL_SIDE.PRODUIT).toBe("CREDIT");
    expect(ACCOUNT_NORMAL_SIDE.PASSIF).toBe("CREDIT");
    expect(ACCOUNT_NORMAL_SIDE.CAPITAUX).toBe("CREDIT");
  });
});

describe("imputation automatique", () => {
  it("associe chaque mode de reglement au bon compte de tresorerie", () => {
    expect(treasuryAccountForMethod("ESPECES")).toBe("571");
    expect(treasuryAccountForMethod("VIREMENT")).toBe("521");
    expect(treasuryAccountForMethod("CHEQUE")).toBe("521");
    expect(treasuryAccountForMethod("MOBILE_MONEY")).toBe("531");
  });

  it("retombe sur la caisse pour un mode inconnu", () => {
    expect(treasuryAccountForMethod("INCONNU")).toBe("571");
  });

  it("choisit le journal correspondant", () => {
    expect(journalForMethod("ESPECES")).toBe("CA");
    expect(journalForMethod("VIREMENT")).toBe("BQ");
    expect(journalForMethod("MOBILE_MONEY")).toBe("BQ");
  });

  it("associe chaque categorie de frais a un compte de produit", () => {
    expect(revenueAccountForCategory("SCOLARITE")).toBe("701");
    expect(revenueAccountForCategory("INSCRIPTION")).toBe("702");
    expect(revenueAccountForCategory("EXAMEN")).toBe("703");
    expect(revenueAccountForCategory("CANTINE")).toBe("706");
    expect(revenueAccountForCategory("INCONNU")).toBe("758");
  });

  it("n'utilise que des comptes presents au plan par defaut", () => {
    const codes = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((account) => account.code));
    for (const method of ["ESPECES", "VIREMENT", "CHEQUE", "MOBILE_MONEY"]) {
      expect(codes.has(treasuryAccountForMethod(method))).toBe(true);
    }
    for (const category of ["SCOLARITE", "INSCRIPTION", "EXAMEN", "CANTINE", "AUTRE"]) {
      expect(codes.has(revenueAccountForCategory(category))).toBe(true);
    }
    // Comptes utilises par les ecritures d'encaissement.
    expect(codes.has("411")).toBe(true);
    expect(codes.has("419")).toBe(true);
  });
});

describe("buildInstallments", () => {
  it("retourne une liste vide sans modele", () => {
    expect(buildInstallments(300_000, [])).toEqual([]);
  });

  it("repartit selon les pourcentages, somme exactement egale au montant", () => {
    const installments = buildInstallments(300_000, [
      { label: "1ere tranche", percentCenti: 4000, dueDate: "2025-10-15" },
      { label: "2eme tranche", percentCenti: 3000, dueDate: "2026-01-15" },
      { label: "3eme tranche", percentCenti: 3000, dueDate: "2026-04-15" },
    ]);

    expect(installments.map((i) => i.amountMinor)).toEqual([120_000, 90_000, 90_000]);
    expect(installments.reduce((total, i) => total + i.amountMinor, 0)).toBe(300_000);
  });

  it("ne perd aucune unite sur un montant non divisible", () => {
    const installments = buildInstallments(100_001, [
      { label: "T1", percentCenti: 3333, dueDate: "2025-10-15" },
      { label: "T2", percentCenti: 3333, dueDate: "2026-01-15" },
      { label: "T3", percentCenti: 3334, dueDate: "2026-04-15" },
    ]);
    expect(installments.reduce((total, i) => total + i.amountMinor, 0)).toBe(100_001);
  });

  it("accepte des montants fixes", () => {
    const installments = buildInstallments(300_000, [
      { label: "Acompte", amountMinor: 100_000, dueDate: "2025-09-15" },
      { label: "Solde", percentCenti: 10_000, dueDate: "2026-01-15" },
    ]);
    expect(installments[0].amountMinor).toBe(100_000);
    expect(installments[1].amountMinor).toBe(200_000);
  });

  it("refuse des montants fixes superieurs au frais", () => {
    expect(() =>
      buildInstallments(100_000, [{ label: "Trop", amountMinor: 150_000, dueDate: "2025-09-15" }]),
    ).toThrow(ValidationError);
  });

  it("refuse une date d'echeance invalide", () => {
    expect(() =>
      buildInstallments(100_000, [{ label: "T1", percentCenti: 10_000, dueDate: "pas-une-date" }]),
    ).toThrow(ValidationError);
  });

  it("repartit a parts egales si aucun pourcentage n'est fourni", () => {
    const installments = buildInstallments(100, [
      { label: "T1", dueDate: "2025-10-15" },
      { label: "T2", dueDate: "2026-01-15" },
      { label: "T3", dueDate: "2026-04-15" },
    ]);
    expect(installments.reduce((total, i) => total + i.amountMinor, 0)).toBe(100);
  });
});

describe("parseInstallmentPlan", () => {
  it("retourne une liste vide sur une entree absente ou invalide", () => {
    expect(parseInstallmentPlan(null)).toEqual([]);
    expect(parseInstallmentPlan("")).toEqual([]);
    expect(parseInstallmentPlan("{pas du json")).toEqual([]);
    expect(parseInstallmentPlan('{"objet":true}')).toEqual([]);
  });

  it("lit un modele valide", () => {
    const plan = parseInstallmentPlan(
      JSON.stringify([{ label: "T1", percentCenti: 5000, dueDate: "2025-10-15" }]),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].label).toBe("T1");
  });
});

describe("discountTotal", () => {
  it("cumule montants fixes et pourcentages", () => {
    expect(
      discountTotal(300_000, [
        { amountMinor: 50_000, percentCenti: null },
        { amountMinor: null, percentCenti: 1000 },
      ]),
    ).toBe(80_000);
  });

  it("plafonne au montant brut", () => {
    expect(discountTotal(100_000, [{ amountMinor: 200_000, percentCenti: null }])).toBe(100_000);
  });

  it("ne descend jamais sous zero", () => {
    expect(discountTotal(100_000, [{ amountMinor: -50_000, percentCenti: null }])).toBe(0);
  });
});
