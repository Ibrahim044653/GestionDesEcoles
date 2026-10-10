import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { getTopDebtors } from "@/lib/domain/dashboard";
import { getCurrentAcademicYear, listAcademicYears } from "@/lib/domain/school-context";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  DownloadIcon,
  AlertIcon,
} from "@/components/ui";

export const metadata: Metadata = { title: "Impayes" };

/** Liste complete des soldes restant dus, pour les campagnes de relance. */
export default async function UnpaidReportPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_ACCOUNT_VIEW);
  const params = await searchParams;
  const { school } = context;

  const currentYear = await getCurrentAcademicYear(school.id);
  const academicYearId = params.annee ?? currentYear?.id;

  const [debtors, academicYears] = await Promise.all([
    getTopDebtors(school.id, { academicYearId, limit: 1000 }),
    listAcademicYears(school.id),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const total = debtors.reduce((sum, debtor) => sum + debtor.balanceMinor, 0);
  const average = debtors.length > 0 ? Math.round(total / debtors.length) : 0;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Rapports", href: "/rapports" }, { label: "Impayes" }]}
        title="Soldes restant dus"
        description="Eleves dont le compte presente un solde non regle. Les justificatifs en attente ne sont pas deduits."
        actions={
          <Link
            href={`/api/export/impayes${academicYearId ? `?annee=${academicYearId}` : ""}`}
            className="btn-primary"
          >
            <DownloadIcon className="size-4" />
            Exporter pour relance
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          tone="rose"
          label="Total restant du"
          value={money(total)}
          icon={<AlertIcon className="size-[18px]" />}
        />
        <StatCard tone="sky" label="Familles concernees" value={String(debtors.length)} />
        <StatCard tone="slate" label="Solde moyen" value={money(average)} />
      </div>

      {academicYears.length > 1 && (
        <form method="get" action="/rapports/impayes" className="mb-5 flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <label htmlFor="annee" className="field-label">
              Annee scolaire
            </label>
            <select id="annee" name="annee" defaultValue={academicYearId ?? ""} className="input">
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">
            Afficher
          </button>
        </form>
      )}

      <Card padded={false}>
        {debtors.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Aucun impaye"
              description="Tous les comptes eleves sont a jour pour cette annee."
            />
          </div>
        ) : (
          <DataTable
            caption="Soldes restant dus par eleve"
            columns={[
              { key: "rank", label: "#", align: "right" },
              { key: "student", label: "Eleve" },
              { key: "matricule", label: "Matricule" },
              { key: "class", label: "Classe" },
              { key: "balance", label: "Solde du", align: "right" },
              { key: "actions", label: "", align: "right" },
            ]}
          >
            {debtors.map((debtor, index) => (
              <tr key={debtor.studentId}>
                <td className="num text-slate-400">{index + 1}</td>
                <td>
                  <Link
                    href={`/eleves/${debtor.studentId}`}
                    className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {debtor.name}
                  </Link>
                </td>
                <td className="font-mono text-xs text-slate-500">{debtor.matricule}</td>
                <td className="text-sm">{debtor.className}</td>
                <td className="num font-semibold text-rose-700">{money(debtor.balanceMinor)}</td>
                <td className="text-right">
                  <Link
                    href={`/api/documents/releve-compte/${debtor.studentId}`}
                    target="_blank"
                    className="btn-ghost btn-sm"
                  >
                    Releve
                  </Link>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={4}>TOTAL</td>
              <td className="num">{money(total)}</td>
              <td />
            </tr>
          </DataTable>
        )}
      </Card>
    </>
  );
}
