/**
 * Controles au demarrage du serveur.
 *
 * Next.js appelle `register()` une fois, au bootstrap. On y verifie la
 * configuration critique afin d'echouer **immediatement et lisiblement** plutot
 * que de laisser chaque requete renvoyer une erreur 500 opaque dont la cause
 * n'apparait que dans les journaux.
 *
 * La verification est volontairement ignoree pendant `next build` : la
 * compilation n'a pas besoin des secrets de production, et echouer a ce
 * moment-la empecherait toute construction d'image.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { requireSessionSecret } = await import("@/lib/env");

  try {
    requireSessionSecret();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      "\n[CONFIGURATION INVALIDE] Le serveur ne peut pas demarrer.\n" +
        `  ${message}\n` +
        "  Voir docs/INSTALLATION.md, section « Configuration ».\n",
    );
    // Arret net : un serveur qui ne peut pas gerer de session ne doit pas
    // accepter de trafic.
    process.exit(1);
  }
}
