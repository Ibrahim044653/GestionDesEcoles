import { describe, expect, it } from "vitest";
import {
  addMinor,
  allocate,
  allocateToDebts,
  assertMinor,
  clampPositive,
  currencyDecimals,
  formatMoney,
  MoneyError,
  parseAmountToMinor,
  percentOf,
  rateCenti,
  subMinor,
  sumBy,
} from "@/lib/money";

/**
 * Arithmetique monetaire.
 *
 * Exigence du cahier des charges (section 20) : aucun calcul financier ne doit
 * utiliser de flottant binaire. Ces tests verrouillent ce contrat.
 */
describe("money", () => {
  describe("assertMinor", () => {
    it("refuse un montant non entier", () => {
      expect(() => assertMinor(10.5)).toThrow(MoneyError);
    });

    it("refuse NaN et Infinity", () => {
      expect(() => assertMinor(Number.NaN)).toThrow(MoneyError);
      expect(() => assertMinor(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    });

    it("accepte zero et les montants negatifs entiers", () => {
      expect(assertMinor(0)).toBe(0);
      expect(assertMinor(-5000)).toBe(-5000);
    });
  });

  describe("addMinor / subMinor", () => {
    it("additionne sans erreur d'arrondi", () => {
      // Le piege classique 0.1 + 0.2 !== 0.3 n'existe pas en unites mineures.
      expect(addMinor(10, 20)).toBe(30);
      expect(addMinor(1, 2, 3, 4, 5)).toBe(15);
    });

    it("soustrait correctement, y compris en negatif", () => {
      expect(subMinor(1000, 1500)).toBe(-500);
    });

    it("somme une collection via un selecteur", () => {
      const lines = [{ amount: 100 }, { amount: 250 }, { amount: 50 }];
      expect(sumBy(lines, (line) => line.amount)).toBe(400);
    });
  });

  describe("percentOf", () => {
    it("applique un pourcentage en centiemes de pourcent", () => {
      // 10,00 % de 300 000 = 30 000
      expect(percentOf(300_000, 1000)).toBe(30_000);
      // 50,00 %
      expect(percentOf(300_000, 5000)).toBe(150_000);
    });

    it("arrondit au plus proche", () => {
      // 33,33 % de 100 = 33,33 -> 33
      expect(percentOf(100, 3333)).toBe(33);
      // 33,33 % de 1000 = 333,3 -> 333
      expect(percentOf(1000, 3333)).toBe(333);
    });

    it("traite les negatifs symetriquement", () => {
      expect(percentOf(-1000, 3333)).toBe(-percentOf(1000, 3333));
    });

    it("refuse un pourcentage non entier", () => {
      expect(() => percentOf(1000, 12.5)).toThrow(MoneyError);
    });
  });

  describe("allocate", () => {
    it("repartit sans perdre ni creer d'unite", () => {
      // 100 reparti en 3 : 34 + 33 + 33, somme exactement 100.
      const parts = allocate(100, [1, 1, 1]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
      expect(parts).toEqual([34, 33, 33]);
    });

    it("respecte les poids fournis", () => {
      // 300 000 en 40/30/30 %
      const parts = allocate(300_000, [4000, 3000, 3000]);
      expect(parts).toEqual([120_000, 90_000, 90_000]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(300_000);
    });

    it("conserve le total sur un cas a reste important", () => {
      const parts = allocate(1_000_001, [1, 1, 1, 1, 1, 1, 1]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_001);
    });

    it("met tout sur la premiere part si les poids sont nuls", () => {
      expect(allocate(500, [0, 0, 0])).toEqual([500, 0, 0]);
    });

    it("refuse une liste de poids vide", () => {
      expect(() => allocate(100, [])).toThrow(MoneyError);
    });
  });

  describe("allocateToDebts", () => {
    const debts = [
      { id: "tranche1", remainingMinor: 120_000 },
      { id: "tranche2", remainingMinor: 90_000 },
      { id: "tranche3", remainingMinor: 90_000 },
    ];

    it("impute dans l'ordre fourni", () => {
      const result = allocateToDebts(150_000, debts);
      expect(result.allocations).toEqual([
        { id: "tranche1", amountMinor: 120_000 },
        { id: "tranche2", amountMinor: 30_000 },
      ]);
      expect(result.overpaidMinor).toBe(0);
    });

    it("solde exactement une echeance", () => {
      const result = allocateToDebts(120_000, debts);
      expect(result.allocations).toEqual([{ id: "tranche1", amountMinor: 120_000 }]);
    });

    it("renvoie le trop-percu quand le versement depasse les dettes", () => {
      const result = allocateToDebts(400_000, debts);
      const allocated = result.allocations.reduce((total, a) => total + a.amountMinor, 0);
      expect(allocated).toBe(300_000);
      expect(result.overpaidMinor).toBe(100_000);
    });

    it("ignore les dettes deja soldees", () => {
      const result = allocateToDebts(50_000, [
        { id: "soldee", remainingMinor: 0 },
        { id: "ouverte", remainingMinor: 80_000 },
      ]);
      expect(result.allocations).toEqual([{ id: "ouverte", amountMinor: 50_000 }]);
    });

    it("refuse un montant negatif", () => {
      expect(() => allocateToDebts(-100, debts)).toThrow(MoneyError);
    });

    it("ne produit aucune imputation pour un montant nul", () => {
      const result = allocateToDebts(0, debts);
      expect(result.allocations).toEqual([]);
      expect(result.overpaidMinor).toBe(0);
    });
  });

  describe("parseAmountToMinor", () => {
    it("lit un montant XOF sans decimale", () => {
      expect(parseAmountToMinor("300000", 0)).toBe(300_000);
      expect(parseAmountToMinor("300 000", 0)).toBe(300_000);
    });

    it("lit un montant a deux decimales avec virgule ou point", () => {
      expect(parseAmountToMinor("12,50", 2)).toBe(1250);
      expect(parseAmountToMinor("12.50", 2)).toBe(1250);
      expect(parseAmountToMinor("12", 2)).toBe(1200);
    });

    it("refuse plus de decimales que la devise n'en accepte", () => {
      expect(() => parseAmountToMinor("12,50", 0)).toThrow(MoneyError);
      expect(() => parseAmountToMinor("12,505", 2)).toThrow(MoneyError);
    });

    it("refuse une saisie non numerique", () => {
      expect(() => parseAmountToMinor("abc", 0)).toThrow(MoneyError);
      expect(() => parseAmountToMinor("", 0)).toThrow(MoneyError);
      expect(() => parseAmountToMinor("10-5", 0)).toThrow(MoneyError);
    });

    it("accepte un montant negatif explicite", () => {
      expect(parseAmountToMinor("-5000", 0)).toBe(-5000);
    });
  });

  describe("currencyDecimals", () => {
    it("reconnait les devises sans decimale", () => {
      expect(currencyDecimals("XOF")).toBe(0);
      expect(currencyDecimals("xof")).toBe(0);
      expect(currencyDecimals("XAF")).toBe(0);
    });

    it("applique deux decimales par defaut", () => {
      expect(currencyDecimals("EUR")).toBe(2);
      expect(currencyDecimals("USD")).toBe(2);
    });
  });

  describe("formatMoney", () => {
    it("formate un montant XOF sans decimale", () => {
      const formatted = formatMoney(300_000, "XOF", "fr-FR");
      expect(formatted).toContain("300");
      expect(formatted).not.toContain(",00");
    });

    it("formate un montant EUR avec deux decimales", () => {
      expect(formatMoney(1250, "EUR", "fr-FR")).toContain("12,50");
    });

    it("ne casse pas sur une devise inconnue", () => {
      expect(() => formatMoney(1000, "ZZZ", "fr-FR")).not.toThrow();
    });
  });

  describe("clampPositive et rateCenti", () => {
    it("ne laisse jamais passer un solde negatif", () => {
      expect(clampPositive(-500)).toBe(0);
      expect(clampPositive(500)).toBe(500);
    });

    it("calcule un taux en centiemes de pourcent", () => {
      expect(rateCenti(50, 100)).toBe(5000); // 50,00 %
      expect(rateCenti(100, 100)).toBe(10_000); // 100,00 %
    });

    it("retourne zero si rien n'est du (pas de division par zero)", () => {
      expect(rateCenti(100, 0)).toBe(0);
    });
  });
});
