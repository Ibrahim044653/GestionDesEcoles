import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";

/**
 * Generateur de documents PDF (recus, bulletins, certificats, listes).
 *
 * Volontairement minimal et sans dependance de rendu HTML : les PDF sont
 * produits cote serveur, de facon deterministe et sans navigateur.
 *
 * Les polices standard (Helvetica) encodent en WinAnsi, qui couvre les
 * caracteres accentues francais. `sanitizeText` remplace les caracteres hors
 * de ce jeu (emoji, typographie exotique) pour eviter un echec d'encodage.
 */

export const A4 = { width: 595.28, height: 841.89 };

export const COLORS = {
  ink: rgb(0.1, 0.12, 0.17),
  muted: rgb(0.42, 0.46, 0.53),
  line: rgb(0.85, 0.87, 0.9),
  brand: rgb(0.06, 0.35, 0.29),
  accent: rgb(0.12, 0.48, 0.38),
  danger: rgb(0.77, 0.21, 0.21),
  lightBand: rgb(0.96, 0.98, 0.97),
};

/** Remplace les caracteres non encodables en WinAnsi pour eviter une exception. */
export function sanitizeText(value: string): string {
  return String(value ?? "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ | /g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

export type PdfContext = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  /** Position verticale courante, depuis le haut de page. */
  y: number;
  margin: number;
};

export async function createDocument(): Promise<PdfContext> {
  const doc = await PDFDocument.create();
  doc.setProducer("Gestion Ecole");
  doc.setCreator("Gestion Ecole");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4.width, A4.height]);

  return { doc, page, font, bold, y: A4.height - 56, margin: 48 };
}

/** Ajoute une page et replace le curseur en haut. */
export function newPage(context: PdfContext): void {
  context.page = context.doc.addPage([A4.width, A4.height]);
  context.y = A4.height - 56;
}

/** Garantit qu'il reste `needed` points ; sinon bascule sur une nouvelle page. */
export function ensureSpace(context: PdfContext, needed: number): void {
  if (context.y - needed < context.margin + 40) newPage(context);
}

export function drawText(
  context: PdfContext,
  text: string,
  options: {
    x?: number;
    y?: number;
    size?: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    align?: "left" | "right" | "center";
    maxWidth?: number;
  } = {},
): void {
  const size = options.size ?? 10;
  const font = options.bold ? context.bold : context.font;
  const content = sanitizeText(text);
  const color = options.color ?? COLORS.ink;
  const y = options.y ?? context.y;

  let x = options.x ?? context.margin;
  if (options.align === "right") {
    const width = font.widthOfTextAtSize(content, size);
    x = (options.x ?? A4.width - context.margin) - width;
  } else if (options.align === "center") {
    const width = font.widthOfTextAtSize(content, size);
    x = (options.x ?? A4.width / 2) - width / 2;
  }

  context.page.drawText(content, { x, y, size, font, color });
}

/** Decoupe un texte long en lignes tenant dans `maxWidth`. */
export function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = sanitizeText(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawParagraph(
  context: PdfContext,
  text: string,
  options: { size?: number; lineHeight?: number; color?: ReturnType<typeof rgb>; bold?: boolean } = {},
): void {
  const size = options.size ?? 10;
  const lineHeight = options.lineHeight ?? size + 4;
  const maxWidth = A4.width - context.margin * 2;
  const font = options.bold ? context.bold : context.font;

  for (const line of wrapText(font, text, size, maxWidth)) {
    ensureSpace(context, lineHeight);
    drawText(context, line, { size, color: options.color, bold: options.bold });
    context.y -= lineHeight;
  }
}

export function drawHorizontalRule(context: PdfContext, options: { color?: ReturnType<typeof rgb> } = {}): void {
  ensureSpace(context, 12);
  context.page.drawLine({
    start: { x: context.margin, y: context.y },
    end: { x: A4.width - context.margin, y: context.y },
    thickness: 0.75,
    color: options.color ?? COLORS.line,
  });
  context.y -= 14;
}

/** En-tete d'etablissement commun a tous les documents officiels. */
export function drawSchoolHeader(
  context: PdfContext,
  school: { name: string; address?: string; city?: string; phone?: string; email?: string },
  documentTitle: string,
  subtitle?: string,
): void {
  context.page.drawRectangle({
    x: 0,
    y: A4.height - 110,
    width: A4.width,
    height: 110,
    color: COLORS.brand,
  });

  drawText(context, school.name.toUpperCase(), {
    x: context.margin,
    y: A4.height - 48,
    size: 15,
    bold: true,
    color: rgb(1, 1, 1),
  });

  const contactParts = [school.address, school.city, school.phone, school.email].filter(Boolean);
  drawText(context, contactParts.join(" | "), {
    x: context.margin,
    y: A4.height - 66,
    size: 8,
    color: rgb(0.82, 0.9, 0.87),
  });

  drawText(context, documentTitle.toUpperCase(), {
    x: A4.width - context.margin,
    y: A4.height - 48,
    size: 12,
    bold: true,
    align: "right",
    color: rgb(1, 1, 1),
  });

  if (subtitle) {
    drawText(context, subtitle, {
      x: A4.width - context.margin,
      y: A4.height - 66,
      size: 8,
      align: "right",
      color: rgb(0.82, 0.9, 0.87),
    });
  }

  context.y = A4.height - 140;
}

/** Paire libelle / valeur, alignee en deux colonnes. */
export function drawField(
  context: PdfContext,
  label: string,
  value: string,
  options: { x?: number; labelWidth?: number; size?: number } = {},
): void {
  const size = options.size ?? 10;
  const x = options.x ?? context.margin;
  const labelWidth = options.labelWidth ?? 120;

  drawText(context, label, { x, size, color: COLORS.muted });
  drawText(context, value, { x: x + labelWidth, size, bold: true });
  context.y -= size + 6;
}

/**
 * Tronque un texte pour qu'il tienne dans `maxWidth`, avec des points de
 * suspension. Sans cela, une appreciation un peu longue deborderait sur la
 * colonne voisine, voire hors de la page.
 */
export function ellipsize(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const content = sanitizeText(text);
  if (maxWidth <= 0 || font.widthOfTextAtSize(content, size) <= maxWidth) return content;

  const suffix = "...";
  const room = maxWidth - font.widthOfTextAtSize(suffix, size);
  if (room <= 0) return "";

  let kept = content;
  while (kept.length > 0 && font.widthOfTextAtSize(kept, size) > room) {
    kept = kept.slice(0, -1);
  }
  return kept.trimEnd() + suffix;
}

export type TableColumn = {
  header: string;
  width: number;
  align?: "left" | "right";
};

/** Tableau simple avec en-tete grise et lignes separees. */
export function drawTable(
  context: PdfContext,
  columns: readonly TableColumn[],
  rows: readonly string[][],
  options: { size?: number; rowHeight?: number; totalRow?: string[] } = {},
): void {
  const size = options.size ?? 9;
  const rowHeight = options.rowHeight ?? 18;

  const drawHeader = () => {
    ensureSpace(context, rowHeight * 2);
    context.page.drawRectangle({
      x: context.margin,
      y: context.y - 4,
      width: A4.width - context.margin * 2,
      height: rowHeight,
      color: COLORS.lightBand,
    });

    let x = context.margin + 6;
    for (const column of columns) {
      drawText(context, column.header, {
        x: column.align === "right" ? x + column.width - 12 : x,
        y: context.y + 2,
        size: size - 0.5,
        bold: true,
        color: COLORS.muted,
        align: column.align === "right" ? "right" : "left",
      });
      x += column.width;
    }
    context.y -= rowHeight + 2;
  };

  drawHeader();

  for (const row of rows) {
    if (context.y - rowHeight < context.margin + 40) {
      newPage(context);
      drawHeader();
    }

    let x = context.margin + 6;
    row.forEach((cell, index) => {
      const column = columns[index];
      if (!column) return;
      drawText(context, ellipsize(context.font, cell, size, column.width - 12), {
        x: column.align === "right" ? x + column.width - 12 : x,
        size,
        align: column.align === "right" ? "right" : "left",
      });
      x += column.width;
    });

    context.y -= rowHeight;
    context.page.drawLine({
      start: { x: context.margin, y: context.y + rowHeight - 5 },
      end: { x: A4.width - context.margin, y: context.y + rowHeight - 5 },
      thickness: 0.4,
      color: COLORS.line,
    });
  }

  if (options.totalRow) {
    ensureSpace(context, rowHeight);
    let x = context.margin + 6;
    options.totalRow.forEach((cell, index) => {
      const column = columns[index];
      if (!column) return;
      drawText(context, cell, {
        x: column.align === "right" ? x + column.width - 12 : x,
        size,
        bold: true,
        align: column.align === "right" ? "right" : "left",
      });
      x += column.width;
    });
    context.y -= rowHeight;
  }
}

/** Pied de page sur toutes les pages : mention, date et pagination. */
export function finalize(context: PdfContext, footerNote: string): void {
  const pages = context.doc.getPages();
  const generatedAt = new Date().toLocaleString("fr-FR");

  pages.forEach((page, index) => {
    page.drawLine({
      start: { x: context.margin, y: 54 },
      end: { x: A4.width - context.margin, y: 54 },
      thickness: 0.5,
      color: COLORS.line,
    });
    page.drawText(sanitizeText(footerNote), {
      x: context.margin,
      y: 40,
      size: 7.5,
      font: context.font,
      color: COLORS.muted,
    });
    page.drawText(sanitizeText(`Edite le ${generatedAt} - page ${index + 1}/${pages.length}`), {
      x: A4.width - context.margin - 170,
      y: 40,
      size: 7.5,
      font: context.font,
      color: COLORS.muted,
    });
  });
}

/**
 * Incruste une image dans le PDF.
 *
 * Tolerante par conception : si le fichier est absent, illisible ou dans un
 * format non supporte, la fonction renvoie `false` et l'appelant retombe sur
 * un emplacement reserve. Un logo manquant ne doit jamais empecher l'emission
 * d'un recu ou d'un bulletin.
 */
export async function drawImage(
  context: PdfContext,
  bytes: Buffer,
  mimeType: string,
  box: { x: number; y: number; width: number; height: number },
): Promise<boolean> {
  try {
    const image = mimeType === "image/png"
      ? await context.doc.embedPng(bytes)
      : mimeType === "image/jpeg"
        ? await context.doc.embedJpg(bytes)
        : null;

    if (!image) return false;

    // Conserve les proportions et centre l'image dans l'emplacement prevu.
    const ratio = Math.min(box.width / image.width, box.height / image.height);
    const width = image.width * ratio;
    const height = image.height * ratio;

    context.page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height,
    });
    return true;
  } catch {
    return false;
  }
}

export async function toBuffer(context: PdfContext): Promise<Buffer> {
  return Buffer.from(await context.doc.save());
}
