/**
 * Filtres de recherche textuelle, independants du moteur de base.
 *
 * LE PROBLEME : `contains` ne se comporte pas pareil selon le moteur.
 * SQLite ignore la casse pour l'ASCII ; PostgreSQL non. Une application
 * developpee sur SQLite puis deployee sur PostgreSQL voit donc ses champs de
 * recherche cesser silencieusement de trouver « kouassi » pour « KOUASSI » —
 * sans la moindre erreur, ce qui rend la regression difficile a reperer.
 *
 * Prisma expose `mode: "insensitive"`, mais UNIQUEMENT sur PostgreSQL : le
 * passer a SQLite leve une erreur de validation. Le filtre doit donc etre
 * construit en fonction du moteur reellement utilise.
 *
 * Le moteur est deduit de DATABASE_URL (`postgres://` ou `postgresql://`)
 * plutot que d'une variable supplementaire a tenir a jour : une seule source
 * de verite, impossible a desynchroniser.
 */

/**
 * Forme structurelle acceptee par les deux clients generes. `mode` est
 * optionnel, donc le type reste assignable au `StringFilter` de SQLite, qui
 * ne connait pas ce champ.
 */
export type TextFilter = { contains: string; mode?: "insensitive" };

/** Fonction pure, pour pouvoir tester les deux comportements. */
export function buildTextFilter(value: string, caseInsensitive: boolean): TextFilter {
  return caseInsensitive ? { contains: value, mode: "insensitive" } : { contains: value };
}

/** Le moteur courant ignore-t-il deja la casse sans qu'on le lui demande ? */
export function isCaseSensitiveEngine(databaseUrl = process.env.DATABASE_URL ?? ""): boolean {
  return /^postgres(ql)?:\/\//i.test(databaseUrl);
}

/**
 * Filtre « contient », insensible a la casse quel que soit le moteur.
 *
 * Reserve connue : l'insensibilite porte sur la CASSE, pas sur les ACCENTS.
 * « Kouame » ne trouvera pas « Kouame » ecrit avec un accent aigu. Y remedier
 * demanderait l'extension `unaccent` de PostgreSQL et du SQL brut, ce que les
 * filtres Prisma ne savent pas exprimer.
 */
export function textContains(value: string): TextFilter {
  return buildTextFilter(value, isCaseSensitiveEngine());
}
