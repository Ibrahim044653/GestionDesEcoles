import { describe, expect, it } from "vitest";
import { buildTextFilter, isCaseSensitiveEngine, textContains } from "@/lib/search";

/**
 * Recherche textuelle portable entre moteurs.
 *
 * Ces tests existent a cause d'une regression REELLE : apres migration de
 * SQLite vers PostgreSQL, chercher « kouassi » ne trouvait plus « KOUASSI ».
 * Rien n'echouait, la liste revenait simplement vide — le pire genre de
 * regression. On verrouille donc les deux comportements.
 */

describe("isCaseSensitiveEngine", () => {
  it("reconnait PostgreSQL sous ses deux prefixes", () => {
    expect(isCaseSensitiveEngine("postgres://u:p@h/db")).toBe(true);
    expect(isCaseSensitiveEngine("postgresql://u:p@h/db")).toBe(true);
    expect(isCaseSensitiveEngine("POSTGRESQL://u:p@h/db")).toBe(true);
  });

  it("ne confond pas SQLite avec PostgreSQL", () => {
    expect(isCaseSensitiveEngine("file:./dev.db")).toBe(false);
    expect(isCaseSensitiveEngine("")).toBe(false);
  });

  it("ne se laisse pas abuser par une sous-chaine", () => {
    // Un mot de passe contenant « postgres » ne doit pas changer le moteur.
    expect(isCaseSensitiveEngine("file:./postgres.db")).toBe(false);
    expect(isCaseSensitiveEngine("mysql://user:postgresql@host/db")).toBe(false);
  });
});

describe("buildTextFilter", () => {
  it("n'ajoute PAS `mode` quand le moteur ignore deja la casse", () => {
    const filtre = buildTextFilter("kouassi", false);
    expect(filtre).toEqual({ contains: "kouassi" });
    // Determinant : SQLite leve une erreur de validation si `mode` est fourni.
    expect("mode" in filtre).toBe(false);
  });

  it("ajoute `mode: insensitive` quand le moteur est sensible a la casse", () => {
    expect(buildTextFilter("kouassi", true)).toEqual({
      contains: "kouassi",
      mode: "insensitive",
    });
  });

  it("transmet la valeur telle quelle, sans la normaliser", () => {
    // La normalisation est l'affaire du moteur ; la reecrire ici
    // dissimulerait ce qui est reellement envoye a la base.
    expect(buildTextFilter("  Kouassi  ", true).contains).toBe("  Kouassi  ");
    expect(buildTextFilter("", false).contains).toBe("");
  });
});

describe("textContains", () => {
  it("construit un filtre exploitable quel que soit l'environnement", () => {
    const filtre = textContains("yao");
    expect(filtre.contains).toBe("yao");
    // Selon DATABASE_URL du processus de test, `mode` est present ou non ;
    // dans les deux cas le filtre doit rester valide pour son moteur.
    expect(filtre.mode === undefined || filtre.mode === "insensitive").toBe(true);
  });
});
