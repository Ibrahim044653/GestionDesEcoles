/**
 * Etat de chargement des pages authentifiees.
 *
 * Squelette plutot qu'un simple message : sur connexion lente, l'utilisateur
 * voit immediatement la structure de la page se mettre en place.
 */
export default function AppLoading() {
  return (
    <div className="animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Chargement de la page…</span>

      <div className="mb-6">
        <div className="h-7 w-64 rounded-lg bg-slate-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-100" />
      </div>

      <div className="mb-6 h-24 rounded-2xl bg-slate-200/70" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-36 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-9 w-9 rounded-xl bg-slate-100" />
            <div className="mt-4 h-8 w-28 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>

      <div className="mt-6 h-72 rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
