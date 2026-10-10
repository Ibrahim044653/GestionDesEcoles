import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { loadStudentAccount } from "@/lib/domain/student-account";
import { getCurrentAcademicYear, listFinancialAccounts } from "@/lib/domain/school-context";
import { env } from "@/lib/env";
import { Alert, Badge, Card, EmptyState, PageHeader, SearchIcon } from "@/components/ui";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Nouvel encaissement" };

/**
 * Ecran de caisse.
 *
 * L'eleve est d'abord recherche, puis sa situation reelle est affichee avant
 * la saisie : ce que le caissier encaisse est toujours mis en regard de ce qui
 * est reellement du.
 */
export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ eleve?: string; q?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.PAYMENT_CREATE);
  const params = await searchParams;
  const { school } = context;

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const academicYear = await getCurrentAcademicYear(school.id);
  const financialAccounts = await listFinancialAccounts(school.id);

  // Recherche d'eleve
  const query = (params.q ?? "").trim();
  const candidates = query
    ? await prisma.student.findMany({
        where: {
          schoolId: school.id,
          status: "ACTIVE",
          OR: [
            { lastName: { contains: query } },
            { firstName: { contains: query } },
            { matricule: { contains: query } },
          ],
        },
        take: 12,
        orderBy: { lastName: "asc" },
        select: {
          id: true,
          matricule: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: { status: "ACTIVE" },
            select: { classRoom: { select: { name: true } } },
            take: 1,
          },
        },
      })
    : [];

  const student = params.eleve
    ? await prisma.student.findFirst({
        where: { id: params.eleve, schoolId: school.id },
        select: {
          id: true,
          matricule: true,
          firstName: true,
          lastName: true,
          status: true,
          enrollments: {
            where: { status: "ACTIVE" },
            select: { classRoom: { select: { name: true } } },
            take: 1,
          },
        },
      })
    : null;

  const account = student ? await loadStudentAccount(student.id, school.id, { academicYearId: academicYear?.id }) : null;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Encaissements", href: "/finance/paiements" }, { label: "Nouvel encaissement" }]}
        title="Enregistrer un encaissement"
        description="Seuls les reglements reellement recus sont saisis ici. Un justificatif depose par une famille se traite depuis la page Justificatifs."
      />

      {!env.integrations.payment.configured && (
        <div className="mb-5">
          <Alert tone="info" title="Paiement en ligne non configure">
            Aucun prestataire de paiement n&apos;est branche sur cette installation. Les reglements
            Mobile Money et par carte doivent etre constates manuellement, avec leur reference
            externe.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ------------------------- Recherche d'eleve ------------------------- */}
        <Card title="1. Choisir l'eleve" className="lg:col-span-1">
          <form method="get" action="/finance/paiements/nouveau">
            <label htmlFor="q" className="field-label">
              Rechercher
            </label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Nom ou matricule"
                className="input pl-9"
                autoFocus={!student}
              />
            </div>
            <button type="submit" className="btn-secondary mt-2 w-full">
              Rechercher
            </button>
          </form>

          {query && candidates.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">
              Aucun eleve actif ne correspond a « {query} ».
            </p>
          )}

          {candidates.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <Link
                    href={`/finance/paiements/nouveau?eleve=${candidate.id}`}
                    className={`block rounded-lg border px-3 py-2 transition-colors hover:bg-slate-50 ${
                      student?.id === candidate.id ? "border-brand-400 bg-brand-50" : "border-slate-200"
                    }`}
                  >
                    <span className="block text-sm font-medium text-slate-900">
                      {candidate.lastName} {candidate.firstName}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {candidate.matricule} — {candidate.enrollments[0]?.classRoom.name ?? "non inscrit"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ------------------------- Situation et saisie ------------------------- */}
        <div className="space-y-5 lg:col-span-2">
          {!student ? (
            <Card>
              <EmptyState
                title="Selectionnez un eleve"
                description="Recherchez l'eleve concerne pour afficher sa situation financiere et enregistrer le reglement."
              />
            </Card>
          ) : (
            <>
              <Card
                title="2. Situation de l'eleve"
                description={`${student.lastName} ${student.firstName} — ${student.matricule} — ${student.enrollments[0]?.classRoom.name ?? "non inscrit"}`}
                actions={
                  <Link href={`/eleves/${student.id}`} className="btn-ghost btn-sm">
                    Ouvrir le dossier
                  </Link>
                }
              >
                {account && (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <SituationTile label="Total du" value={money(account.netDueMinor)} />
                      <SituationTile label="Deja paye" value={money(account.paidMinor)} tone="mint" />
                      <SituationTile
                        label="En attente"
                        value={money(account.pendingProofMinor)}
                        tone={account.pendingProofMinor > 0 ? "iris" : "slate"}
                      />
                      <SituationTile
                        label={account.overpaidMinor > 0 ? "Trop-percu" : "Reste du"}
                        value={money(account.overpaidMinor > 0 ? account.overpaidMinor : account.balanceMinor)}
                        tone={account.balanceMinor > 0 ? "rose" : "mint"}
                      />
                    </div>

                    {account.pendingProofMinor > 0 && (
                      <div className="mt-4">
                        <Alert tone="warning" title="Justificatifs en attente">
                          La famille a declare {money(account.pendingProofMinor)} non encore
                          confirmes. Verifiez qu&apos;il ne s&apos;agit pas du meme reglement avant
                          d&apos;encaisser, pour eviter un double enregistrement.
                        </Alert>
                      </div>
                    )}

                    {/* Echeances ouvertes : ordre d'imputation automatique */}
                    {account.lines.some((line) => line.remainingMinor > 0) && (
                      <div className="mt-5">
                        <p className="label-caps mb-2 text-slate-500">
                          Echeances ouvertes (ordre d&apos;imputation automatique)
                        </p>
                        <ul className="space-y-1.5">
                          {account.lines.flatMap((line) =>
                            line.installments.length > 0
                              ? line.installments
                                  .filter((installment) => installment.remainingMinor > 0)
                                  .map((installment) => (
                                    <li
                                      key={installment.id}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                                    >
                                      <span className="font-medium text-slate-700">
                                        {line.label} — {installment.label}
                                      </span>
                                      <span className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">
                                          {formatDate(installment.dueDate, school.locale)}
                                        </span>
                                        {installment.isOverdue && <Badge tone="danger">Depassee</Badge>}
                                        <span className="tabular font-semibold text-slate-900">
                                          {money(installment.remainingMinor)}
                                        </span>
                                      </span>
                                    </li>
                                  ))
                              : line.remainingMinor > 0
                                ? [
                                    <li
                                      key={line.id}
                                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                                    >
                                      <span className="font-medium text-slate-700">{line.label}</span>
                                      <span className="tabular font-semibold text-slate-900">
                                        {money(line.remainingMinor)}
                                      </span>
                                    </li>,
                                  ]
                                : [],
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </Card>

              <Card title="3. Enregistrer le reglement">
                <PaymentForm
                  studentId={student.id}
                  studentName={`${student.lastName} ${student.firstName}`}
                  currency={school.currency}
                  currencyLabel={school.currency}
                  suggestedAmountMinor={account?.balanceMinor ?? 0}
                  financialAccounts={financialAccounts.map((financialAccount) => ({
                    id: financialAccount.id,
                    label: `${financialAccount.name} (${financialAccount.kind.toLowerCase()})`,
                  }))}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SituationTile({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "mint" | "rose" | "iris";
}) {
  const styles = {
    slate: "bg-slate-50 text-slate-600",
    mint: "bg-mint-50 text-mint-700",
    rose: "bg-rose-50 text-rose-700",
    iris: "bg-iris-50 text-iris-700",
  }[tone];

  return (
    <div className={`rounded-xl p-3 ${styles}`}>
      <p className="label-caps">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 tabular">{value}</p>
    </div>
  );
}
