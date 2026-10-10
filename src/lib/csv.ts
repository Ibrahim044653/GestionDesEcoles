/**
 * Lecture et ecriture CSV.
 *
 * Analyseur ecrit a la main plutot qu'une dependance : les fichiers produits
 * par Excel en Cote d'Ivoire melangent separateurs `;` et `,`, encodages
 * Windows-1252 et UTF-8 avec BOM. Le detecteur ci-dessous gere ces cas.
 */

export type CsvRow = Record<string, string>;

/** Devine le separateur en comparant les occurrences sur la ligne d'en-tete. */
export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const candidates = [";", ",", "\t", "|"];

  let best = ";";
  let bestCount = 0;

  for (const candidate of candidates) {
    // On ignore les separateurs situes dans des champs entre guillemets.
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }

  return bestCount === 0 ? ";" : best;
}

/** Analyse un CSV en respectant les guillemets et les sauts de ligne internes. */
export function parseCsv(
  content: string,
  options: { delimiter?: string } = {},
): { headers: string[]; rows: CsvRow[] } {
  // Retrait du BOM UTF-8, sinon la premiere colonne porte un nom invisible.
  const text = content.replace(/^﻿/, "");
  const delimiter = options.delimiter ?? detectDelimiter(text);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'; // guillemet echappe
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((header) => normalizeHeader(header));

  const rows = nonEmpty.slice(1).map((values) => {
    const row: CsvRow = {};
    headers.forEach((header, columnIndex) => {
      row[header] = (values[columnIndex] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
}

/**
 * Normalise un nom de colonne : minuscules, sans accent ni ponctuation.
 * "Nom de l'élève" et "NOM_DE_L_ELEVE" deviennent la meme cle.
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Resout une valeur a partir de plusieurs noms de colonnes possibles.
 * Permet d'accepter "prenom", "prenoms", "first_name" pour un meme champ.
 */
export function pick(row: CsvRow, ...aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

/** Echappe une valeur pour l'ecriture CSV. */
function escapeCsvValue(value: unknown, delimiter: string): string {
  const text = value === null || value === undefined ? "" : String(value);

  // Protection contre l'injection de formules dans Excel / LibreOffice :
  // une valeur commencant par = + - @ serait interpretee comme une formule.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  if (guarded.includes(delimiter) || guarded.includes('"') || /[\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/**
 * Serialise des lignes en CSV.
 * Le BOM est ajoute pour qu'Excel ouvre correctement les accents.
 */
export function toCsv(
  rows: readonly Record<string, unknown>[],
  options: { columns?: { key: string; header: string }[]; delimiter?: string; bom?: boolean } = {},
): string {
  const delimiter = options.delimiter ?? ";";
  const columns =
    options.columns ??
    (rows.length > 0
      ? Object.keys(rows[0]).map((key) => ({ key, header: key }))
      : []);

  const lines = [
    columns.map((column) => escapeCsvValue(column.header, delimiter)).join(delimiter),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue(row[column.key], delimiter)).join(delimiter),
    ),
  ];

  return (options.bom === false ? "" : "﻿") + lines.join("\r\n");
}

/** Reponse HTTP de telechargement CSV. */
export function csvResponse(csv: string, fileName: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Construit une date UTC en REFUSANT les valeurs hors calendrier.
 *
 * `Date.UTC(2014, 12, 32)` ne leve pas : JavaScript reporte le depassement sur
 * le mois suivant et renvoie une date valide. Une saisie erronee comme
 * 32/13/2014 passerait donc inapercue. On verifie donc que la date construite
 * restitue exactement les composants fournis.
 */
function strictUtcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;

  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return roundTrips ? date : null;
}

/** Normalise une date saisie en JJ/MM/AAAA, AAAA-MM-JJ ou JJ-MM-AAAA. */
export function parseFlexibleDate(input: string): Date | null {
  const value = input.trim();
  if (!value) return null;

  const dmy = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return strictUtcDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const ymd = value.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) return strictUtcDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  return null;
}
