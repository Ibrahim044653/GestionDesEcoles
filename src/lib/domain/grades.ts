/**
 * Calcul des moyennes.
 *
 * Toutes les notes sont des entiers en CENTIEMES de point : 15,25/20 -> 1525.
 * Les divisions sont arrondies une seule fois, au moment de produire une
 * moyenne, ce qui evite l'accumulation d'erreurs d'arrondi.
 *
 * Module pur : aucun acces base, entierement couvert par tests/grades.test.ts.
 */

export type AbsenceRule =
  /** L'absence est exclue du calcul (ne penalise pas l'eleve). */
  | "EXCLURE"
  /** L'absence compte comme un zero. */
  | "ZERO";

export type GradingSettings = {
  /** Note maximale de reference de l'etablissement (20 en general). */
  maxScore: number;
  /** Traitement des absences non excusees. */
  absenceRule: AbsenceRule;
  /** Une absence EXCUSEE est toujours exclue, quelle que soit absenceRule. */
  excusedAlwaysExcluded: boolean;
  /** Le classement est-il autorise et affiche ? */
  rankingEnabled: boolean;
  /** Moyenne minimale de passage, en centiemes (1000 = 10,00). */
  passMarkCenti: number;
};

export const DEFAULT_GRADING_SETTINGS: GradingSettings = {
  maxScore: 20,
  absenceRule: "EXCLURE",
  excusedAlwaysExcluded: true,
  rankingEnabled: true,
  passMarkCenti: 1000,
};

export function parseGradingSettings(raw: string | null | undefined): GradingSettings {
  if (!raw) return DEFAULT_GRADING_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<GradingSettings>;
    return { ...DEFAULT_GRADING_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_GRADING_SETTINGS;
  }
}

export type GradeEntry = {
  /** Note obtenue, en centiemes. null si non saisie. */
  scoreCenti: number | null;
  isAbsent: boolean;
  isExcused: boolean;
  /** Bareme de l'evaluation (ex. 20, ou 50 pour un devoir sur 50). */
  maxScore: number;
  /** Poids de l'evaluation a l'interieur de la matiere. */
  coefficient: number;
};

export type SubjectAverage = {
  subjectId: string;
  subjectName: string;
  /** Coefficient de la matiere dans la moyenne generale. */
  coefficient: number;
  /** Moyenne ramenee au bareme de l'etablissement, en centiemes. null si aucune note. */
  averageCenti: number | null;
  /** Nombre de notes reellement prises en compte. */
  countedGrades: number;
  /** Notes ecartees (absence excusee, non saisie). */
  skippedGrades: number;
};

/**
 * Ramene une note a un autre bareme.
 * Exemple : 35/50 ramene sur 20 -> 1400 centiemes (14,00).
 */
export function normalizeToScale(scoreCenti: number, fromMax: number, toMax: number): number {
  if (fromMax <= 0) throw new Error("Le bareme d'une evaluation doit etre strictement positif.");
  if (fromMax === toMax) return scoreCenti;
  return Math.round((scoreCenti * toMax) / fromMax);
}

/**
 * Moyenne ponderee d'une matiere.
 * Retourne null si aucune note n'est exploitable : une matiere sans note ne
 * doit pas etre comptee 0 dans la moyenne generale.
 */
export function computeSubjectAverage(
  grades: readonly GradeEntry[],
  settings: GradingSettings = DEFAULT_GRADING_SETTINGS,
): { averageCenti: number | null; countedGrades: number; skippedGrades: number } {
  let weightedSum = 0;
  let totalWeight = 0;
  let counted = 0;
  let skipped = 0;

  for (const grade of grades) {
    const weight = Math.max(0, grade.coefficient);

    if (grade.isAbsent) {
      // Absence excusee : toujours neutre si l'etablissement le prevoit.
      if (grade.isExcused && settings.excusedAlwaysExcluded) {
        skipped += 1;
        continue;
      }
      if (settings.absenceRule === "EXCLURE") {
        skipped += 1;
        continue;
      }
      // Regle ZERO : l'absence pese son coefficient avec une note nulle.
      totalWeight += weight;
      counted += 1;
      continue;
    }

    if (grade.scoreCenti === null) {
      skipped += 1;
      continue;
    }

    const normalized = normalizeToScale(grade.scoreCenti, grade.maxScore, settings.maxScore);
    weightedSum += normalized * weight;
    totalWeight += weight;
    counted += 1;
  }

  if (totalWeight === 0 || counted === 0) {
    return { averageCenti: null, countedGrades: 0, skippedGrades: skipped };
  }

  return {
    averageCenti: Math.round(weightedSum / totalWeight),
    countedGrades: counted,
    skippedGrades: skipped,
  };
}

/**
 * Moyenne generale : moyenne des moyennes de matieres, ponderee par les
 * coefficients de matiere. Les matieres sans note sont ignorees.
 */
export function computeGeneralAverage(subjects: readonly SubjectAverage[]): {
  averageCenti: number | null;
  totalCoefficient: number;
} {
  let weightedSum = 0;
  let totalCoefficient = 0;

  for (const subject of subjects) {
    if (subject.averageCenti === null) continue;
    const weight = Math.max(0, subject.coefficient);
    if (weight === 0) continue;
    weightedSum += subject.averageCenti * weight;
    totalCoefficient += weight;
  }

  if (totalCoefficient === 0) return { averageCenti: null, totalCoefficient: 0 };
  return { averageCenti: Math.round(weightedSum / totalCoefficient), totalCoefficient };
}

/**
 * Classement avec gestion des ex aequo (rangs 1, 2, 2, 4).
 * Les eleves sans moyenne ne sont pas classes.
 */
export function computeRanking(
  entries: readonly { studentId: string; averageCenti: number | null }[],
): Map<string, number> {
  const ranked = entries
    .filter((entry): entry is { studentId: string; averageCenti: number } => entry.averageCenti !== null)
    .sort((a, b) => b.averageCenti - a.averageCenti);

  const ranks = new Map<string, number>();
  let currentRank = 0;
  let previousAverage: number | null = null;

  ranked.forEach((entry, index) => {
    if (previousAverage === null || entry.averageCenti !== previousAverage) {
      currentRank = index + 1;
      previousAverage = entry.averageCenti;
    }
    ranks.set(entry.studentId, currentRank);
  });

  return ranks;
}

/** Moyenne de classe : moyenne simple des moyennes generales disponibles. */
export function computeClassAverage(
  averages: readonly (number | null)[],
): number | null {
  const valid = averages.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

/** Affichage d'une note en centiemes : 1525 -> "15,25". */
export function formatScore(scoreCenti: number | null, locale = "fr-CI"): string {
  if (scoreCenti === null) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(scoreCenti / 100);
}

/** Saisie "15,25" / "15.25" -> 1525 centiemes. Rejette hors bareme. */
export function parseScoreToCenti(input: string, maxScore: number): number {
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Note invalide : "${input}". Format attendu : 15 ou 15,25.`);
  }
  const centi = Math.round(Number.parseFloat(cleaned) * 100);
  if (centi < 0 || centi > maxScore * 100) {
    throw new Error(`La note doit etre comprise entre 0 et ${maxScore}.`);
  }
  return centi;
}

/** Appreciation automatique proposee (modifiable par l'enseignant). */
export function suggestAppreciation(averageCenti: number | null, maxScore = 20): string {
  if (averageCenti === null) return "Pas de note sur la periode.";
  const outOf20 = (averageCenti / 100) * (20 / maxScore);
  if (outOf20 >= 16) return "Excellent travail. Felicitations.";
  if (outOf20 >= 14) return "Tres bon travail, continuez ainsi.";
  if (outOf20 >= 12) return "Bon travail d'ensemble.";
  if (outOf20 >= 10) return "Resultats satisfaisants, des efforts restent possibles.";
  if (outOf20 >= 8) return "Resultats insuffisants. Un travail plus regulier est necessaire.";
  return "Resultats tres insuffisants. Un accompagnement est recommande.";
}

/**
 * Credits valides (universite) : un EC est acquis si la moyenne atteint le
 * seuil de validation. Aucune compensation automatique entre UE n'est
 * appliquee ici : cette regle varie selon les etablissements et doit etre
 * parametree explicitement.
 */
export function computeEarnedCredits(
  subjects: readonly (SubjectAverage & { credits: number })[],
  passMarkCenti: number,
): { earned: number; total: number } {
  let earned = 0;
  let total = 0;

  for (const subject of subjects) {
    total += subject.credits;
    if (subject.averageCenti !== null && subject.averageCenti >= passMarkCenti) {
      earned += subject.credits;
    }
  }

  return { earned, total };
}
