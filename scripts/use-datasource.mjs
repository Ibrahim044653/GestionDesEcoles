// Bascule le `provider` du datasource Prisma entre sqlite et postgresql.
//
// POURQUOI CE SCRIPT : Prisma interdit `env()` dans le bloc `datasource` ; le
// provider doit etre une valeur litterale. Or l'application tourne en SQLite en
// local (developpement et suite de tests, qui cree une base jetable) et en
// PostgreSQL en production (Vercel n'a pas de disque persistant).
//
// Le schema reste donc UN SEUL FICHIER, source de verite unique, et c'est la
// commande de build qui choisit le provider. Pas de schema duplique a maintenir
// en parallele, donc pas de derive silencieuse entre les deux.
//
// Usage : node scripts/use-datasource.mjs postgresql
//         node scripts/use-datasource.mjs sqlite

import { readFileSync, writeFileSync } from "node:fs";

const SUPPORTED = ["sqlite", "postgresql"];
const SCHEMA = "prisma/schema.prisma";

const target = process.argv[2];

if (!SUPPORTED.includes(target)) {
  console.error(
    `Provider attendu parmi : ${SUPPORTED.join(", ")}. Recu : ${target ?? "(rien)"}`,
  );
  process.exit(1);
}

const schema = readFileSync(SCHEMA, "utf8");

// On ne remplace que la ligne `provider` DU BLOC datasource. Le bloc
// `generator` possede lui aussi une ligne `provider` : la confondre casserait
// la generation du client.
const datasourceBlock = /datasource\s+db\s*\{[^}]*\}/;
const match = schema.match(datasourceBlock);

if (!match) {
  console.error(`Bloc "datasource db" introuvable dans ${SCHEMA}.`);
  process.exit(1);
}

const current = match[0].match(/provider\s*=\s*"([^"]+)"/)?.[1];

if (current === target) {
  console.log(`Datasource deja en "${target}" : rien a faire.`);
  process.exit(0);
}

const updatedBlock = match[0].replace(
  /provider\s*=\s*"[^"]+"/,
  `provider = "${target}"`,
);

writeFileSync(SCHEMA, schema.replace(datasourceBlock, updatedBlock), "utf8");
console.log(`Datasource basculee de "${current}" vers "${target}".`);
