import Link from "next/link";

/**
 * Page 404 des espaces authentifies.
 *
 * Elle s'affiche aussi lorsqu'une ressource existe mais appartient a un AUTRE
 * etablissement : le message reste volontairement identique dans les deux cas,
 * afin de ne rien reveler sur les donnees des autres ecoles.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" strokeLinecap="round" />
        </svg>
      </div>

      <h1 className="text-xl font-semibold text-slate-900">Ressource introuvable</h1>
      <p className="mt-2 text-sm text-slate-600">
        Cette page ou cet enregistrement n&apos;existe pas dans l&apos;etablissement actuellement
        selectionne. Si vous gerez plusieurs etablissements, verifiez celui qui est actif dans la
        barre superieure.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/tableau-de-bord" className="btn-primary">
          Tableau de bord
        </Link>
        <Link href="/eleves" className="btn-secondary">
          Liste des eleves
        </Link>
      </div>
    </div>
  );
}
