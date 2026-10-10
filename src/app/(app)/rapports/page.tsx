import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatMonthKey } from "@/lib/format";
import {
  getAcademicSnapshot,
  getBudgetVsActual,
  getEnrollmentSnapshot,
  getFinancialSnapshot,
  getMonthlyTrend,
  getPaymentMethodBreakdown,
} from "@/lib/domain/dashboard";
import { getCurrentAcademicYear, listAcademicYears } from "@/lib/domain/school-context";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  DownloadIcon,
  ChartIcon,
} from "@/components/ui";

export const metadata: Metadata = { title: "Rapports" };

/**
 * Rapports consolides et exports.
 *
 * Les indicateurs financiers ne s'affichent que si l'utilisateur dispose de la
 * permission correspondante : un responsable pedagogique voit les effectifs et
 * les resultats, pas le chiffre d'affaires.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; du?: string; au?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.REPORT_EXPORT);
  const params = await searchParams;
  const { school } = context;

  const currentYear = await getCurrentAcademicYear(school.id);
  const academicYearId = params.annee ?? currentYear?.id;
  const academicYears = await listAcademicYears(school.id);

  const from = params.du ? new Date(params.du) : undefined;
  const to = params.au ? new Date(`${params.au}T23:59:59`) : undefined;
  const filters = { schoolId: school.id, academicYearId, from, to };

  const canSeeFinance = hasPermission(context, PERMISSIONS.DASHBOARD_FINANCE);

  const [enrollment, academic, finance, trend, methods, budget] = await Promise.all([
    getEnrollmentSnapshot(filters),
    getAcademicSnapshot(filters),
    canSeeFinance ? getFinancialSnapshot(filters) : Promise.resolve(null),
    canSeeFinance ? getMonthlyTrend(school.id, { months: 12, academicYearId }) : Promise.resolve([]),
    canSeeFinance ? getPaymentMethodBreakdown(school.id, { from, to }) : Promise.resolve([]),
    canSeeFinance && academicYearId ? getBudgetVsActual(school.id, academicYearId) : Promise.resolve([]),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);

  const exports = [
    { href: "/api/export/eleves", label: "Liste des eleves", permission: PERMISSIONS.STUDENT_EXPORT },
    { href: "/api/export/paiements", label: "Encaissements", permission: PERMISSIONS.PAYMENT_VIEW },
    { href: "/api/export/impayes", label: "Soldes restant dus", permission: PERMISSIONS.STUDENT_ACCOUNT_VIEW },
    { href: "/api/export/depenses", label: "Depenses", permission: PERMISSIONS.EXPENSE_VIEW },
    { href: "/api/export/balance", label: "Balance comptable", permission: PERMISSIONS.JOURNAL_VIEW },
    { href: "/api/export/personnel", label: "Personnel (paie)", permission: PERMISSIONS.STAFF_EXPORT_PAYROLL },
  ].filter((entry) => hasPermission(context, entry.permission));

  // L'export complet est reserve aux profils qui peuvent deja modifier
  // l'etablissement : c'est une sortie integrale de donnees personnelles.
  const canExportEverything =
    hasPermission(context, PERMISSIONS.SCHOOL_UPDATE) &&
    hasPermission(context, PERMISSIONS.REPORT_EXPORT);

  return (
    <>
      <PageHeader
        title="Rapports et exports"
        description="Indicateurs consolides et exports exploitables dans un tableur."
      />

      {/* Filtres */}
      <Card className="mb-5">
        <form method="get" action="/rapports" className="flex flex-wrap items-end gap-3">
          <div className="min-w-44">
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
          <div>
            <label htmlFor="du" className="field-label">
              Du
            </label>
            <input id="du" name="du" type="date" defaultValue={params.du} className="input" />
          </div>
          <div>
            <label htmlFor="au" className="field-label">
              Au
            </label>
            <input id="au" name="au" type="date" defaultValue={params.au} className="input" />
          </div>
          <button type="submit" className="btn-primary">
            Appliquer
          </button>
          <Link href="/rapports" className="btn-ghost">
            Reinitialiser
          </Link>
        </form>
      </Card>

      {/* ---------------------------- Effectifs ---------------------------- */}
      <h2 className="label-caps mb-3 text-slate-500">Effectifs et scolarite</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="sky" label="Eleves inscrits" value={String(enrollment.activeStudents)} />
        <StatCard
          tone="mint"
          label="Nouvelles inscriptions"
          value={String(enrollment.newEnrollments)}
          hint={`${enrollment.reEnrollments} reinscription(s).`}
        />
        <StatCard
          tone="rose"
          label="Departs"
          value={String(enrollment.withdrawals)}
          hint="Transferts et abandons sur l'annee."
        />
        <StatCard
          tone="iris"
          label="Personnel"
          value={String(enrollment.staffCount)}
          hint={`${enrollment.teacherCount} enseignant(s).`}
        />
      </div>

      {/* ---------------------------- Finances ---------------------------- */}
      {finance && (
        <>
          <h2 className="label-caps mb-3 text-slate-500">Situation financiere</h2>

          <div className="mb-4">
            <Alert tone="info" title="Definitions retenues">
              <strong>Chiffre d&apos;affaires</strong> : frais emis aux familles, net de remises
              (constate a l&apos;emission). <strong>Encaissements</strong> : reglements
              effectivement recus et valides. <strong>Creances</strong> : difference entre les
              deux. <strong>Resultat</strong> : produits moins charges, issu du compte de
              resultat. Ces grandeurs sont distinctes et ne doivent pas etre confondues avec la
              tresorerie.
            </Alert>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              tone="sky"
              label="Chiffre d'affaires"
              value={money(finance.billedMinor)}
              hint={`Brut ${money(finance.grossBilledMinor)} — remises ${money(finance.discountMinor)}.`}
            />
            <StatCard
              tone="mint"
              label="Encaissements"
              value={money(finance.collectedMinor)}
              hint={`Taux de recouvrement : ${formatPercent(finance.collectionRateCenti, school.locale)}.`}
            />
            <StatCard
              tone="rose"
              label="Creances"
              value={money(finance.receivableMinor)}
              hint={`Dont ${money(finance.overdueMinor)} d'echeances depassees.`}
            />
            <StatCard
              tone="iris"
              label="Resultat"
              value={money(finance.resultMinor)}
              hint={`Depenses payees : ${money(finance.expensePaidMinor)}.`}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Evolution sur 12 mois" padded={false}>
              {trend.every((point) => point.billedMinor === 0 && point.collectedMinor === 0) ? (
                <div className="p-5">
                  <EmptyState title="Aucun mouvement" />
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: "month", label: "Mois" },
                    { key: "billed", label: "Facture", align: "right" },
                    { key: "collected", label: "Encaisse", align: "right" },
                    { key: "expense", label: "Depenses", align: "right" },
                    { key: "rate", label: "Recouvrement", align: "right" },
                  ]}
                >
                  {trend.map((point) => (
                    <tr key={point.month}>
                      <td>{formatMonthKey(point.month, school.locale)}</td>
                      <td className="num">{money(point.billedMinor)}</td>
                      <td className="num">{money(point.collectedMinor)}</td>
                      <td className="num text-rose-700">{money(point.expenseMinor)}</td>
                      <td className="num text-slate-600">
                        {point.billedMinor > 0
                          ? `${Math.round((point.collectedMinor / point.billedMinor) * 100)} %`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>

            <Card title="Modes de reglement" padded={false}>
              {methods.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="Aucun encaissement" />
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: "method", label: "Mode" },
                    { key: "count", label: "Operations", align: "right" },
                    { key: "amount", label: "Montant", align: "right" },
                  ]}
                >
                  {methods.map((method) => (
                    <tr key={method.method}>
                      <td>{PAYMENT_METHOD_LABELS[method.method] ?? method.method}</td>
                      <td className="num">{method.count}</td>
                      <td className="num">{money(method.amountMinor)}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </div>

          {budget.length > 0 && (
            <div className="mb-6">
              <Card title="Budget et realise" padded={false}>
                <DataTable
                  columns={[
                    { key: "label", label: "Poste" },
                    { key: "planned", label: "Budget", align: "right" },
                    { key: "actual", label: "Realise", align: "right" },
                    { key: "rate", label: "Consommation", align: "right" },
                  ]}
                >
                  {budget.map((line) => (
                    <tr key={line.label}>
                      <td className="font-medium text-slate-900">{line.label}</td>
                      <td className="num">{money(line.plannedMinor)}</td>
                      <td className="num">{money(line.actualMinor)}</td>
                      <td className="num">
                        <span className={line.rateCenti > 10_000 ? "text-rose-700" : "text-slate-700"}>
                          {formatPercent(line.rateCenti, school.locale)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ---------------------------- Pedagogie ---------------------------- */}
      <h2 className="label-caps mb-3 text-slate-500">Pedagogie</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="sky"
          label="Evaluations"
          value={String(academic.evaluationsTotal)}
          hint={`${academic.evaluationsPublished} publiee(s), ${academic.evaluationsAwaitingValidation} a valider.`}
        />
        <StatCard tone="mint" label="Notes saisies" value={String(academic.gradesEntered)} />
        <StatCard
          tone="rose"
          label="Absences du mois"
          value={String(academic.absencesThisMonth)}
          hint={`${academic.lateThisMonth} retard(s).`}
        />
        <StatCard
          tone="iris"
          label="Devoirs a corriger"
          value={String(academic.submissionsAwaitingGrading)}
        />
      </div>

      {/* ------------------------------ Exports ------------------------------ */}
      <Card title="Exports" description="Fichiers CSV compatibles Excel et LibreOffice.">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {exports.map((entry) => (
            <li key={entry.href}>
              <Link
                href={
                  params.du || params.au
                    ? `${entry.href}?du=${params.du ?? ""}&au=${params.au ?? ""}`
                    : entry.href
                }
                className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3.5 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                <DownloadIcon className="size-4 shrink-0 text-slate-400" />
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>

        {exports.length === 0 && (
          <EmptyState
            icon={<ChartIcon className="size-8" />}
            title="Aucun export disponible"
            description="Votre role ne donne acces a aucun export."
          />
        )}
      </Card>

      {/* ------------------------- Export complet (reversibilite) ------------------------- */}
      {canExportEverything && (
        <Card
          title="Export complet de l'etablissement"
          description="Toutes les donnees de l'etablissement dans un seul fichier JSON, pour une reprise hors de la plateforme."
          className="mt-5"
        >
          <Alert tone="warning" title="Fichier sensible">
            Il contient les donnees personnelles des eleves, des familles et du personnel.
            Transmettez-le et conservez-le de maniere securisee. Les mots de passe et jetons de
            session n&apos;y figurent pas, et le contenu des fichiers televerses doit etre
            sauvegarde separement.
          </Alert>

          <div className="mt-4">
            <Link href="/api/export/etablissement" className="btn-secondary">
              <DownloadIcon className="size-4" />
              Telecharger l&apos;export complet
            </Link>
          </div>
        </Card>
      )}
    </>
  );
}
