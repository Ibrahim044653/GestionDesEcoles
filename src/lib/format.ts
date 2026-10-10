/**
 * Formatage pour l'affichage. Aucun calcul metier ici.
 */

export function formatDate(date: Date | string | null | undefined, locale = "fr-CI"): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
}

export function formatDateTime(date: Date | string | null | undefined, locale = "fr-CI"): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

/** Valeur d'un <input type="date"> a partir d'une Date. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/** Ecart relatif a maintenant, en francais ("il y a 3 jours"). */
export function formatRelative(date: Date | string, locale = "fr-CI"): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const diffSeconds = Math.round((value.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const thresholds: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2592000, "week"],
    [31536000, "month"],
  ];

  let previous = 1;
  for (const [limit, unit] of thresholds) {
    if (Math.abs(diffSeconds) < limit) {
      return formatter.format(Math.round(diffSeconds / previous), unit);
    }
    previous = limit;
  }
  return formatter.format(Math.round(diffSeconds / 31536000), "year");
}

/** Minutes depuis minuit -> "08:30". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.lastName} ${person.firstName}`.trim();
}

/** Tronque proprement un texte long. */
export function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Libelle d'un mois "2026-03" -> "mars 2026". */
export function formatMonthKey(key: string, locale = "fr-CI"): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(
    new Date(year, month - 1, 1),
  );
}

/** Pluriel simple : 0/1 -> singulier, sinon pluriel. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count <= 1 ? singular : pluralForm ?? `${singular}s`}`;
}
