"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Frontiere d'erreur des pages authentifiees.
 *
 * Le detail technique n'est JAMAIS montre a l'utilisateur : il reste dans les
 * journaux serveur. L'ecran propose une action concrete plutot qu'un message
 * generique sans issue.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // La trace complete est deja journalisee cote serveur ; on conserve ici
    // de quoi faire le lien lors d'un signalement utilisateur.
    console.error("[erreur interface]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3.5 2.5 20h19L12 3.5Z" strokeLinejoin="round" />
          <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
        </svg>
      </div>

      <h1 className="text-xl font-semibold text-slate-900">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="mt-2 text-sm text-slate-600">
        Une erreur technique est survenue. Aucune donnee n&apos;a ete modifiee par cet affichage.
        Vous pouvez reessayer ou revenir au tableau de bord.
      </p>

      {error.digest && (
        <p className="mt-3 text-xs text-slate-400">
          Code a communiquer au support : <code className="font-mono">{error.digest}</code>
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          Reessayer
        </button>
        <Link href="/tableau-de-bord" className="btn-secondary">
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  );
}
