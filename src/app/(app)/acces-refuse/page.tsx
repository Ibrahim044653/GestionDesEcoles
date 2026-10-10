import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/guard";
import { ROLE_LABELS, type RoleCode } from "@/lib/constants";
import { Card, ShieldIcon } from "@/components/ui";

export const metadata: Metadata = { title: "Acces refuse" };

/**
 * Ecran affiche lorsqu'un utilisateur atteint une page qu'il n'a pas le droit
 * de consulter (saisie directe d'une URL, lien partage, changement de role).
 *
 * Le refus a deja ete enregistre dans le journal d'audit par le garde-fou
 * serveur ; cette page ne fait qu'expliquer la situation.
 */
export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ permission?: string; motif?: string }>;
}) {
  const context = await requireAuth();
  const params = await searchParams;

  const noSchool = params.motif === "etablissement";
  const roleLabel = context.membership
    ? ROLE_LABELS[context.membership.roleCode as RoleCode] ?? context.membership.roleName
    : "Aucun role dans cet etablissement";

  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card>
        <div className="flex gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <ShieldIcon className="size-5" />
          </span>

          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">
              {noSchool ? "Aucun etablissement associe" : "Acces refuse"}
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {noSchool ? (
                <>
                  Votre compte n&apos;est rattache a aucun etablissement actif. Contactez
                  l&apos;administration pour qu&apos;elle vous affecte a un etablissement.
                </>
              ) : (
                <>
                  Votre role ne vous autorise pas a consulter cette page. Si vous estimez avoir
                  besoin de cet acces, adressez-vous au directeur ou au proprietaire de
                  l&apos;etablissement.
                </>
              )}
            </p>

            <dl className="mt-4 space-y-1.5 rounded-lg bg-slate-50 px-3.5 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Compte</dt>
                <dd className="truncate font-medium text-slate-800">{context.user.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium text-slate-800">{roleLabel}</dd>
              </div>
              {context.school && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Etablissement</dt>
                  <dd className="truncate font-medium text-slate-800">{context.school.name}</dd>
                </div>
              )}
              {params.permission && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Droit requis</dt>
                  <dd className="font-mono text-xs font-medium text-slate-800">{params.permission}</dd>
                </div>
              )}
            </dl>

            {context.availableSchools.length > 1 && (
              <p className="mt-3 text-xs text-slate-500">
                Vous gerez plusieurs etablissements : verifiez celui qui est selectionne dans la
                barre superieure, vos droits peuvent y differer.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/tableau-de-bord" className="btn-primary">
                Retour au tableau de bord
              </Link>
              <Link href="/mon-compte" className="btn-secondary">
                Mon compte
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <p className="mt-4 text-center text-xs text-slate-400">
        Cette tentative a ete enregistree dans le journal d&apos;audit de l&apos;etablissement.
      </p>
    </div>
  );
}
