import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRADING_SETTINGS,
  computeClassAverage,
  computeEarnedCredits,
  computeGeneralAverage,
  computeRanking,
  computeSubjectAverage,
  formatScore,
  normalizeToScale,
  parseGradingSettings,
  parseScoreToCenti,
  suggestAppreciation,
  type GradeEntry,
} from "@/lib/domain/grades";

/**
 * Calcul des moyennes.
 *
 * Les notes sont des entiers en centiemes de point : 15,25/20 -> 1525.
 */

const grade = (overrides: Partial<GradeEntry> = {}): GradeEntry => ({
  scoreCenti: 1200,
  isAbsent: false,
  isExcused: false,
  maxScore: 20,
  coefficient: 1,
  ...overrides,
});

describe("normalizeToScale", () => {
  it("ne modifie rien quand les baremes coincident", () => {
    expect(normalizeToScale(1525, 20, 20)).toBe(1525);
  });

  it("ramene une note sur un autre bareme", () => {
    // 35/50 ramene sur 20 = 14,00
    expect(normalizeToScale(3500, 50, 20)).toBe(1400);
    // 8/10 ramene sur 20 = 16,00
    expect(normalizeToScale(800, 10, 20)).toBe(1600);
  });

  it("refuse un bareme nul ou negatif", () => {
    expect(() => normalizeToScale(1000, 0, 20)).toThrow();
  });
});

describe("computeSubjectAverage", () => {
  it("calcule une moyenne simple", () => {
    const result = computeSubjectAverage([
      grade({ scoreCenti: 1000 }),
      grade({ scoreCenti: 1400 }),
    ]);
    expect(result.averageCenti).toBe(1200);
    expect(result.countedGrades).toBe(2);
  });

  it("pondere par le coefficient de chaque evaluation", () => {
    const result = computeSubjectAverage([
      grade({ scoreCenti: 1000, coefficient: 1 }),
      grade({ scoreCenti: 1600, coefficient: 3 }),
    ]);
    // (10*1 + 16*3) / 4 = 14,50
    expect(result.averageCenti).toBe(1450);
  });

  it("ramene les baremes heterogenes avant de moyenner", () => {
    const result = computeSubjectAverage([
      grade({ scoreCenti: 1000, maxScore: 20 }),
      grade({ scoreCenti: 4000, maxScore: 50 }), // 16/20
    ]);
    expect(result.averageCenti).toBe(1300);
  });

  it("retourne null sans aucune note : une matiere non evaluee ne vaut pas zero", () => {
    const result = computeSubjectAverage([]);
    expect(result.averageCenti).toBeNull();

    const onlyEmpty = computeSubjectAverage([grade({ scoreCenti: null })]);
    expect(onlyEmpty.averageCenti).toBeNull();
    expect(onlyEmpty.skippedGrades).toBe(1);
  });

  describe("traitement des absences", () => {
    const entries = [grade({ scoreCenti: 1600 }), grade({ isAbsent: true, scoreCenti: null })];

    it("exclut l'absence du calcul avec la regle EXCLURE", () => {
      const result = computeSubjectAverage(entries, {
        ...DEFAULT_GRADING_SETTINGS,
        absenceRule: "EXCLURE",
      });
      expect(result.averageCenti).toBe(1600);
      expect(result.countedGrades).toBe(1);
      expect(result.skippedGrades).toBe(1);
    });

    it("compte l'absence zero avec la regle ZERO", () => {
      const result = computeSubjectAverage(entries, {
        ...DEFAULT_GRADING_SETTINGS,
        absenceRule: "ZERO",
        excusedAlwaysExcluded: true,
      });
      // (16 + 0) / 2 = 8,00
      expect(result.averageCenti).toBe(800);
      expect(result.countedGrades).toBe(2);
    });

    it("exclut toujours une absence EXCUSEE, meme en regle ZERO", () => {
      const result = computeSubjectAverage(
        [grade({ scoreCenti: 1600 }), grade({ isAbsent: true, isExcused: true, scoreCenti: null })],
        { ...DEFAULT_GRADING_SETTINGS, absenceRule: "ZERO", excusedAlwaysExcluded: true },
      );
      expect(result.averageCenti).toBe(1600);
    });

    it("compte l'absence excusee zero si l'etablissement l'a choisi", () => {
      const result = computeSubjectAverage(
        [grade({ scoreCenti: 1600 }), grade({ isAbsent: true, isExcused: true, scoreCenti: null })],
        { ...DEFAULT_GRADING_SETTINGS, absenceRule: "ZERO", excusedAlwaysExcluded: false },
      );
      expect(result.averageCenti).toBe(800);
    });
  });

  it("ignore une evaluation de coefficient nul", () => {
    const result = computeSubjectAverage([
      grade({ scoreCenti: 1000, coefficient: 2 }),
      grade({ scoreCenti: 2000, coefficient: 0 }),
    ]);
    expect(result.averageCenti).toBe(1000);
  });
});

describe("computeGeneralAverage", () => {
  const subject = (averageCenti: number | null, coefficient: number) => ({
    subjectId: `s-${coefficient}-${averageCenti}`,
    subjectName: "Matiere",
    coefficient,
    averageCenti,
    countedGrades: 1,
    skippedGrades: 0,
  });

  it("pondere par le coefficient de matiere", () => {
    const result = computeGeneralAverage([subject(1600, 4), subject(1000, 2)]);
    // (16*4 + 10*2) / 6 = 14,00
    expect(result.averageCenti).toBe(1400);
    expect(result.totalCoefficient).toBe(6);
  });

  it("ignore les matieres sans moyenne au lieu de les compter zero", () => {
    const result = computeGeneralAverage([subject(1600, 4), subject(null, 2)]);
    expect(result.averageCenti).toBe(1600);
    expect(result.totalCoefficient).toBe(4);
  });

  it("retourne null si aucune matiere n'est notee", () => {
    const result = computeGeneralAverage([subject(null, 4), subject(null, 2)]);
    expect(result.averageCenti).toBeNull();
    expect(result.totalCoefficient).toBe(0);
  });

  it("gere une liste vide", () => {
    expect(computeGeneralAverage([]).averageCenti).toBeNull();
  });
});

describe("computeRanking", () => {
  it("classe par moyenne decroissante", () => {
    const ranks = computeRanking([
      { studentId: "a", averageCenti: 1200 },
      { studentId: "b", averageCenti: 1600 },
      { studentId: "c", averageCenti: 1400 },
    ]);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("a")).toBe(3);
  });

  it("gere les ex aequo : 1, 2, 2, 4", () => {
    const ranks = computeRanking([
      { studentId: "a", averageCenti: 1600 },
      { studentId: "b", averageCenti: 1400 },
      { studentId: "c", averageCenti: 1400 },
      { studentId: "d", averageCenti: 1200 },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(2);
    expect(ranks.get("c")).toBe(2);
    expect(ranks.get("d")).toBe(4);
  });

  it("ne classe pas les eleves sans moyenne", () => {
    const ranks = computeRanking([
      { studentId: "a", averageCenti: 1600 },
      { studentId: "b", averageCenti: null },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.has("b")).toBe(false);
  });
});

describe("computeClassAverage", () => {
  it("moyenne simple des moyennes disponibles", () => {
    expect(computeClassAverage([1000, 1400, 1200])).toBe(1200);
  });

  it("ignore les valeurs absentes", () => {
    expect(computeClassAverage([1000, null, 1400])).toBe(1200);
  });

  it("retourne null si aucune moyenne", () => {
    expect(computeClassAverage([null, null])).toBeNull();
    expect(computeClassAverage([])).toBeNull();
  });
});

describe("parseScoreToCenti", () => {
  it("accepte entier, virgule et point", () => {
    expect(parseScoreToCenti("15", 20)).toBe(1500);
    expect(parseScoreToCenti("15,25", 20)).toBe(1525);
    expect(parseScoreToCenti("15.5", 20)).toBe(1550);
    expect(parseScoreToCenti(" 12 ", 20)).toBe(1200);
  });

  it("refuse une note hors bareme", () => {
    expect(() => parseScoreToCenti("25", 20)).toThrow();
    expect(() => parseScoreToCenti("-1", 20)).toThrow();
  });

  it("accepte les bornes du bareme", () => {
    expect(parseScoreToCenti("0", 20)).toBe(0);
    expect(parseScoreToCenti("20", 20)).toBe(2000);
  });

  it("refuse une saisie non numerique", () => {
    expect(() => parseScoreToCenti("abc", 20)).toThrow();
    expect(() => parseScoreToCenti("", 20)).toThrow();
  });

  it("refuse plus de deux decimales", () => {
    expect(() => parseScoreToCenti("15,255", 20)).toThrow();
  });
});

describe("formatScore", () => {
  it("affiche deux decimales", () => {
    expect(formatScore(1525, "fr-FR")).toBe("15,25");
    expect(formatScore(1000, "fr-FR")).toBe("10,00");
  });

  it("affiche un tiret pour une note absente", () => {
    expect(formatScore(null)).toBe("—");
  });
});

describe("computeEarnedCredits", () => {
  const subject = (averageCenti: number | null, credits: number) => ({
    subjectId: `s${credits}-${averageCenti}`,
    subjectName: "EC",
    coefficient: 1,
    credits,
    averageCenti,
    countedGrades: 1,
    skippedGrades: 0,
  });

  it("valide les credits au-dessus du seuil", () => {
    const result = computeEarnedCredits([subject(1200, 6), subject(800, 4)], 1000);
    expect(result.earned).toBe(6);
    expect(result.total).toBe(10);
  });

  it("valide exactement au seuil", () => {
    const result = computeEarnedCredits([subject(1000, 5)], 1000);
    expect(result.earned).toBe(5);
  });

  it("n'accorde aucun credit a un EC non note", () => {
    const result = computeEarnedCredits([subject(null, 6)], 1000);
    expect(result.earned).toBe(0);
    expect(result.total).toBe(6);
  });
});

describe("parseGradingSettings", () => {
  it("retourne les valeurs par defaut sans configuration", () => {
    expect(parseGradingSettings(null)).toEqual(DEFAULT_GRADING_SETTINGS);
    expect(parseGradingSettings("")).toEqual(DEFAULT_GRADING_SETTINGS);
  });

  it("resiste a un JSON invalide", () => {
    expect(parseGradingSettings("{pas du json")).toEqual(DEFAULT_GRADING_SETTINGS);
  });

  it("fusionne une configuration partielle avec les defauts", () => {
    const settings = parseGradingSettings(JSON.stringify({ maxScore: 10 }));
    expect(settings.maxScore).toBe(10);
    expect(settings.absenceRule).toBe(DEFAULT_GRADING_SETTINGS.absenceRule);
  });
});

describe("suggestAppreciation", () => {
  it("propose une appreciation coherente avec le niveau", () => {
    expect(suggestAppreciation(1700)).toContain("Excellent");
    expect(suggestAppreciation(1450)).toContain("Tres bon");
    expect(suggestAppreciation(1250)).toContain("Bon travail");
    // 11/20 : au-dessus de la moyenne mais sous le seuil de "bon travail".
    expect(suggestAppreciation(1100)).toContain("satisfaisants");
    expect(suggestAppreciation(500)).toContain("insuffisants");
  });

  it("gere l'absence de note", () => {
    expect(suggestAppreciation(null)).toContain("Pas de note");
  });
});
