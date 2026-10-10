/**
 * Erreurs applicatives.
 *
 * Les messages sont destines a l'utilisateur final (francais, explicites).
 * Aucune information sensible (requete SQL, chemin serveur, secret) ne doit
 * transiter par ces messages.
 */

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code = "APP_ERROR", statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** 401 : non authentifie. */
export class UnauthenticatedError extends AppError {
  constructor(message = "Vous devez vous connecter pour acceder a cette page.") {
    super(message, "UNAUTHENTICATED", 401);
    this.name = "UnauthenticatedError";
  }
}

/**
 * 403 : authentifie mais non autorise.
 * Utilise aussi pour un acces inter-ecoles : on ne revele jamais si la
 * ressource existe dans un autre etablissement.
 */
export class ForbiddenError extends AppError {
  constructor(message = "Vous n'avez pas l'autorisation d'effectuer cette action.") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

/** 404 : ressource absente, ou appartenant a un autre tenant (indistinguable). */
export class NotFoundError extends AppError {
  constructor(message = "Ressource introuvable.") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

/** 409 : conflit metier (doublon, etat incompatible, periode cloturee). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

/** 422 : donnees invalides, avec detail par champ pour le formulaire. */
export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(message = "Certaines informations sont invalides.", fieldErrors: Record<string, string[]> = {}) {
    super(message, "VALIDATION", 422);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** 429 : trop de tentatives. */
export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      `Trop de tentatives. Reessayez dans ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      "RATE_LIMITED",
      429,
    );
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Forme de retour standard des Server Actions consommees par les formulaires. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: unknown): ActionResult<never> {
  if (error instanceof ValidationError) {
    return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
  }
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code };
  }
  // Erreur inattendue : on journalise cote serveur, on reste vague cote client.
  console.error("[erreur inattendue]", error);
  return {
    ok: false,
    error: "Une erreur technique est survenue. L'operation n'a pas ete enregistree.",
    code: "INTERNAL",
  };
}
