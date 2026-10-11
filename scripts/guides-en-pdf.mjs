// Convertit les guides Markdown de docs/guides/ en PDF imprimables.
//
// Aucun pandoc ni LibreOffice n'est requis : la mise en page est faite en
// HTML/CSS, puis imprimee par Chrome (ou Edge) en mode headless. C'est le
// moteur de rendu qui gere la cesure, les veuves et orphelines, et les sauts
// de page — un generateur PDF ecrit a la main ferait bien moins bien.
//
// Usage : node scripts/guides-en-pdf.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { marked } from "marked";

const SOURCE = "docs/guides";
const SORTIE = "docs/guides/pdf";

/** Titre humain de chaque guide, pour la couverture et le pied de page. */
const TITRES = {
  "README": "Guides d'utilisation — Introduction",
  "proprietaire": "Guide du propriétaire",
  "directeur": "Guide du directeur",
  "responsable-pedagogique": "Guide du responsable pédagogique",
  "enseignant": "Guide de l'enseignant",
  "comptable": "Guide du comptable",
  "caissier": "Guide du caissier",
  "parent": "Guide du parent",
  "super-administrateur": "Guide du super-administrateur",
};

/** Navigateurs connus, par ordre de preference. */
const NAVIGATEURS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

function trouverNavigateur() {
  const choisi = NAVIGATEURS.find((chemin) => existsSync(chemin));
  if (!choisi) {
    console.error(
      "Aucun navigateur compatible trouve. Installez Chrome ou Edge, ou ajoutez\n" +
        "son chemin dans NAVIGATEURS (scripts/guides-en-pdf.mjs).",
    );
    process.exit(1);
  }
  return choisi;
}

const CSS = `
  @page {
    size: A4;
    margin: 20mm 18mm 18mm 18mm;
  }

  /* Pile de polices systeme : aucun telechargement, rendu correct hors ligne. */
  body {
    font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1a1f2b;
    margin: 0;
  }

  h1 {
    font-size: 21pt;
    color: #0f5a4a;
    border-bottom: 2.5pt solid #0f5a4a;
    padding-bottom: 5pt;
    margin: 0 0 16pt;
  }

  /* Chaque grande section commence en haut d'une page : un guide se consulte
     par rubrique, pas en lecture continue. */
  h2 {
    font-size: 14pt;
    color: #0f5a4a;
    margin: 22pt 0 8pt;
    page-break-before: always;
    page-break-after: avoid;
  }
  h2:first-of-type { page-break-before: avoid; }

  h3 {
    font-size: 11.5pt;
    color: #22303f;
    margin: 14pt 0 5pt;
    page-break-after: avoid;
  }

  p, ul, ol { margin: 0 0 8pt; }
  li { margin-bottom: 3pt; }

  /* Un tableau coupe entre deux pages devient illisible. */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0 14pt;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th {
    background: #eef4f2;
    color: #0f5a4a;
    text-align: left;
    font-weight: 600;
    padding: 5pt 7pt;
    border: 0.5pt solid #c9d8d3;
  }
  td {
    padding: 5pt 7pt;
    border: 0.5pt solid #d8e0e4;
    vertical-align: top;
  }

  /* Les encadres portent les avertissements : ils ne doivent pas se scinder. */
  blockquote {
    margin: 10pt 0;
    padding: 7pt 12pt;
    background: #fbf7e8;
    border-left: 3pt solid #d9a441;
    page-break-inside: avoid;
  }
  blockquote p:last-child { margin-bottom: 0; }

  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 9pt;
    background: #f1f4f6;
    padding: 1pt 3pt;
    border-radius: 2pt;
  }
  pre {
    background: #f1f4f6;
    padding: 8pt 10pt;
    border-radius: 3pt;
    font-size: 8.5pt;
    overflow-x: hidden;
    white-space: pre-wrap;
    page-break-inside: avoid;
  }

  hr { border: none; border-top: 0.5pt solid #d8e0e4; margin: 14pt 0; }
  a { color: #0f5a4a; text-decoration: none; }
  strong { color: #0b1a2b; }

  .couverture {
    text-align: center;
    padding: 55mm 0 0;
    page-break-after: always;
  }
  .couverture .appli {
    font-size: 11pt;
    letter-spacing: 2.5pt;
    text-transform: uppercase;
    color: #6b7b8c;
  }
  .couverture .titre {
    font-size: 30pt;
    font-weight: 700;
    color: #0f5a4a;
    margin: 14pt 0 10pt;
  }
  .couverture .filet { width: 55mm; height: 2.5pt; background: #d9a441; margin: 0 auto 14pt; }
  .couverture .date { font-size: 10pt; color: #6b7b8c; }
`;

function gabarit(titre, corps) {
  const date = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>${titre}</title><style>${CSS}</style></head>
<body>
  <section class="couverture">
    <div class="appli">Gestion Ecole</div>
    <div class="titre">${titre}</div>
    <div class="filet"></div>
    <div class="date">Document genere le ${date}</div>
  </section>
  ${corps}
</body>
</html>`;
}

const navigateur = trouverNavigateur();
console.log(`Navigateur : ${path.basename(navigateur)}\n`);

mkdirSync(SORTIE, { recursive: true });
const tempo = path.join(SORTIE, ".tmp");
mkdirSync(tempo, { recursive: true });

const fichiers = readdirSync(SOURCE)
  .filter((f) => f.endsWith(".md"))
  .sort();

let produits = 0;

for (const fichier of fichiers) {
  const base = path.basename(fichier, ".md");
  const titre = TITRES[base] ?? base;

  let markdown = readFileSync(path.join(SOURCE, fichier), "utf8");

  // Le premier titre de niveau 1 ferait doublon avec la couverture.
  markdown = markdown.replace(/^#\s+.*\n+/, "");
  // Les liens entre guides ne mènent nulle part dans un PDF autonome :
  // on garde le libelle, on retire le lien.
  markdown = markdown.replace(/\[([^\]]+)\]\((?!https?:)[^)]+\)/g, "$1");

  const html = gabarit(titre, marked.parse(markdown));
  const cheminHtml = path.resolve(tempo, `${base}.html`);
  const cheminPdf = path.resolve(SORTIE, `${base}.pdf`);

  writeFileSync(cheminHtml, html, "utf8");

  execFileSync(
    navigateur,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${cheminPdf}`,
      `file:///${cheminHtml.replace(/\\/g, "/")}`,
    ],
    { stdio: "pipe", timeout: 120_000 },
  );

  const taille = readFileSync(cheminPdf).length;
  console.log(`  ${titre.padEnd(42)} ${(taille / 1024).toFixed(0).padStart(5)} Ko`);
  produits++;
}

rmSync(tempo, { recursive: true, force: true });
console.log(`\n${produits} PDF generes dans ${SORTIE}/`);
