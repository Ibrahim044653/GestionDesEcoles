import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { JOURNAL_LABELS } from "@/lib/constants";
import {
  computeBalanceSheet,
  computeIncomeStatement,
  computeTrialBalance,
} from "@/lib/domain/accounting";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  ChartIcon,
  DownloadIcon,
  WalletIcon,
  AlertIcon,
} from "@/components/ui";
import { ReverseEntryButton, ClosePeriodButton } from "./accounting-forms";

export const metadata: Metadata = { title: "Comptabilite" };

type Tab = "balance" | "resultat" | "bilan" | "journal";

/**
 * Etats comptables.
 *
 * Tous sont derives du grand livre (ecritures validees uniquement) :
 * aucun bilan n'est reconstitue a partir des seuls encaissements et depenses.
 * Un desequilibre eventuel est signale explicitement plutot que masque.
 */
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; du?: string; au?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.JOURNAL_VIEW);
  const params = await searchParams;
  const { school } = context;

  const tab = (params.vue ?? "balance") as Tab;
  const from = params.du ? new Date(params.du) : undefined;
  const to = params.au ? new Date(`${params.au}T23:59:59`) : undefined;

  const [balances, income, balanceSheet, periods] = await Promise.all([
    computeTrialBalance(school.id, { from, to }),
    computeIncomeStatement(school.id, { from, to }),
    computeBalanceSheet(school.id, { from, to }),
    prisma.accountingPeriod.findMany({
      where: { schoolId: school.id },
      orderBy: { startDate: "desc" },
      include: { _count: { select: { entries: true } } },
    }),
  ]);

  const entries =
    tab === "journal"
      ? await prisma.journalEntry.findMany({
          where: {
            schoolId: school.id,
            ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
          },
          orderBy: { date: "desc" },
          take: 100,
          include: {
            lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { sortOrder: "asc" } },
            postedBy: { select: { firstName: true, lastName: true } },
          },
        })
      : [];

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const treasury = balances.filter((balance) => balance.accountClass === 5);
  const treasuryTotal = treasury.reduce((total, balance) => total + balance.balanceMinor, 0);
  const receivables = balances.find((balance) => balance.code === "411");

  const tabs: { key: Tab; label: string }[] = [
    { key: "balance", label: "Balance generale" },
    { key: "resultat", label: "Compte de resultat" },
    { key: "bilan", label: "Bilan" },
    { key: "journal", label: "Journal" },
  ];

  const buildTabHref = (key: Tab) => {
    const search = new URLSearchParams({ vue: key });
    if (params.du) search.set("du", params.du);
    if (params.au) search.set("au", params.au);
    return `/finance/comptabilite?${search.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Comptabilite"
        description="Etats produits a partir des ecritures validees, en partie double. Referentiel adaptable au SYSCOHADA."
        actions={
          <Link href={`/api/export/balance?du=${params.du ?? ""}&au=${params.au ?? ""}`} className="btn-secondary">
            <DownloadIcon className="size-4" />
            Exporter la balance
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="mint"
          label="Produits"
          value={money(income.totalRevenueMinor)}
          hint="Comptes de classe 7 — constates a l'emission des frais."
          icon={<ChartIcon className="size-[18px]" />}
        />
        <StatCard
          tone="rose"
          label="Charges"
          value={money(income.totalExpenseMinor)}
          hint="Comptes de classe 6 — depenses reellement reglees."
        />
        <StatCard
          tone={income.resultMinor >= 0 ? "iris" : "rose"}
          label="Resultat"
          value={money(income.resultMinor)}
          hint={income.resultMinor >= 0 ? "Benefice de la periode." : "Perte de la periode."}
        />
        <StatCard
          tone="sky"
          label="Tresorerie"
          value={money(treasuryTotal)}
          hint={`Comptes de classe 5 (${treasury.length} compte(s)). A ne pas confondre avec le resultat.`}
          icon={<WalletIcon className="size-[18px]" />}
        />
      </div>

      {!balanceSheet.isBalanced && (
        <div className="mb-5">
          <Alert tone="danger" title="Bilan desequilibre">
            Un ecart de {money(Math.abs(balanceSheet.differenceMinor))} est detecte entre
            l&apos;actif et le passif. Cet ecart est signale plutot que masque : verifiez les
            ecritures de la periode avant toute cloture.
          </Alert>
        </div>
      )}

      {/* --------------------------- Filtre de periode --------------------------- */}
      <Card className="mb-4">
        <form method="get" action="/finance/comptabilite" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="vue" value={tab} />
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
          <Link href={`/finance/comptabilite?vue=${tab}`} className="btn-ghost">
            Tout l&apos;exercice
          </Link>
        </form>
      </Card>

      {/* ------------------------------ Onglets ------------------------------ */}
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Etats comptables">
        {tabs.map((entry) => (
          <Link
            key={entry.key}
            href={buildTabHref(entry.key)}
            aria-current={tab === entry.key ? "page" : undefined}
            className={tab === entry.key ? "btn bg-brand-600 text-white btn-sm" : "btn-secondary btn-sm"}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {/* ------------------------------ Balance ------------------------------ */}
      {tab === "balance" && (
        <Card title="Balance generale" padded={false}>
          {balances.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Aucun mouvement" description="Aucune ecriture validee sur la periode." />
            </div>
          ) : (
            <DataTable
              caption="Balance generale des comptes"
              columns={[
                { key: "code", label: "Compte" },
                { key: "name", label: "Libelle" },
                { key: "type", label: "Nature" },
                { key: "debit", label: "Debit", align: "right" },
                { key: "credit", label: "Credit", align: "right" },
                { key: "balance", label: "Solde", align: "right" },
              ]}
            >
              {balances.map((balance) => (
                <tr key={balance.accountId}>
                  <td className="font-mono text-xs font-medium">{balance.code}</td>
                  <td>{balance.name}</td>
                  <td className="text-xs text-slate-500">{balance.type}</td>
                  <td className="num">{money(balance.debitMinor)}</td>
                  <td className="num">{money(balance.creditMinor)}</td>
                  <td className="num font-semibold">{money(balance.balanceMinor)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td colSpan={3}>TOTAUX</td>
                <td className="num">
                  {money(balances.reduce((total, balance) => total + balance.debitMinor, 0))}
                </td>
                <td className="num">
                  {money(balances.reduce((total, balance) => total + balance.creditMinor, 0))}
                </td>
                <td className="num">—</td>
              </tr>
            </DataTable>
          )}
        </Card>
      )}

      {/* --------------------------- Compte de resultat --------------------------- */}
      {tab === "resultat" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Produits (classe 7)" padded={false}>
            <AccountLines lines={income.revenues} money={money} total={income.totalRevenueMinor} />
          </Card>
          <Card title="Charges (classe 6)" padded={false}>
            <AccountLines lines={income.expenses} money={money} total={income.totalExpenseMinor} />
          </Card>
          <div className="lg:col-span-2">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label-caps text-slate-500">
                    {income.resultMinor >= 0 ? "Benefice de la periode" : "Perte de la periode"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Produits {money(income.totalRevenueMinor)} − charges{" "}
                    {money(income.totalExpenseMinor)}
                  </p>
                </div>
                <p
                  className={`text-3xl font-semibold tabular ${
                    income.resultMinor >= 0 ? "text-mint-700" : "text-rose-700"
                  }`}
                >
                  {money(income.resultMinor)}
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ------------------------------ Bilan ------------------------------ */}
      {tab === "bilan" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Actif" padded={false}>
            <AccountLines lines={balanceSheet.assets} money={money} total={balanceSheet.totalAssetsMinor} />
          </Card>
          <div className="space-y-5">
            <Card title="Passif" padded={false}>
              <AccountLines
                lines={balanceSheet.liabilities}
                money={money}
                total={balanceSheet.totalLiabilitiesMinor}
              />
            </Card>
            <Card title="Capitaux propres" padded={false}>
              <AccountLines lines={balanceSheet.equity} money={money} total={balanceSheet.totalEquityMinor} />
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
                <span className="font-medium text-slate-700">Resultat de la periode</span>
                <span className="num font-semibold">{money(balanceSheet.resultMinor)}</span>
              </div>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                <span className="font-medium text-slate-700">
                  Total actif : <span className="tabular">{money(balanceSheet.totalAssetsMinor)}</span>
                </span>
                <span className="font-medium text-slate-700">
                  Total passif + capitaux + resultat :{" "}
                  <span className="tabular">
                    {money(
                      balanceSheet.totalLiabilitiesMinor +
                        balanceSheet.totalEquityMinor +
                        balanceSheet.resultMinor,
                    )}
                  </span>
                </span>
                <Badge tone={balanceSheet.isBalanced ? "success" : "danger"}>
                  {balanceSheet.isBalanced
                    ? "Bilan equilibre"
                    : `Ecart de ${money(Math.abs(balanceSheet.differenceMinor))}`}
                </Badge>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ------------------------------ Journal ------------------------------ */}
      {tab === "journal" && (
        <Card title="Journal des ecritures" padded={false}>
          {entries.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Aucune ecriture" description="Aucune ecriture sur la periode selectionnee." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-medium text-slate-700">
                          {entry.reference}
                        </span>
                        <Badge tone="neutral">{JOURNAL_LABELS[entry.journalCode] ?? entry.journalCode}</Badge>
                        <Badge
                          tone={
                            entry.status === "POSTED"
                              ? "success"
                              : entry.status === "REVERSED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {entry.status === "POSTED"
                            ? "Validee"
                            : entry.status === "REVERSED"
                              ? "Contrepassee"
                              : "Brouillon"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">{entry.label}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(entry.date, school.locale)}
                        {entry.postedBy && ` — ${entry.postedBy.firstName} ${entry.postedBy.lastName}`}
                      </p>
                    </div>

                    {hasPermission(context, PERMISSIONS.JOURNAL_REVERSE) && entry.status === "POSTED" && (
                      <ReverseEntryButton entryId={entry.id} reference={entry.reference} />
                    )}
                  </div>

                  <table className="mt-3 w-full text-xs">
                    <tbody>
                      {entry.lines.map((line) => (
                        <tr key={line.id} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 font-mono text-slate-500">{line.account.code}</td>
                          <td className="py-1.5 pr-3 text-slate-700">{line.account.name}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{line.label}</td>
                          <td className="py-1.5 pr-3 text-right tabular">
                            {line.debitMinor > 0 ? money(line.debitMinor) : ""}
                          </td>
                          <td className="py-1.5 text-right tabular">
                            {line.creditMinor > 0 ? money(line.creditMinor) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ------------------------- Periodes comptables ------------------------- */}
      <div className="mt-6">
        <Card title="Periodes comptables" padded={false}>
          {periods.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucune periode"
                description="Definissez un exercice comptable dans les parametres."
              />
            </div>
          ) : (
            <DataTable
              columns={[
                { key: "name", label: "Periode" },
                { key: "range", label: "Du / au" },
                { key: "entries", label: "Ecritures", align: "right" },
                { key: "status", label: "Statut" },
                { key: "actions", label: "", align: "right" },
              ]}
            >
              {periods.map((period) => (
                <tr key={period.id}>
                  <td className="font-medium text-slate-900">{period.name}</td>
                  <td className="text-slate-600">
                    {formatDate(period.startDate, school.locale)} → {formatDate(period.endDate, school.locale)}
                  </td>
                  <td className="num">{period._count.entries}</td>
                  <td>
                    <Badge tone={period.status === "CLOSED" ? "neutral" : "success"}>
                      {period.status === "CLOSED" ? "Cloturee" : "Ouverte"}
                    </Badge>
                  </td>
                  <td className="text-right">
                    {period.status === "OPEN" && hasPermission(context, PERMISSIONS.PERIOD_CLOSE) && (
                      <ClosePeriodButton periodId={period.id} name={period.name} />
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
        Une ecriture validee n&apos;est jamais supprimee : toute correction passe par une
        contrepassation tracee. Les periodes cloturees refusent toute nouvelle ecriture.
      </p>
    </>
  );
}

function AccountLines({
  lines,
  money,
  total,
}: {
  lines: { accountId: string; code: string; name: string; balanceMinor: number }[];
  money: (amount: number) => string;
  total: number;
}) {
  if (lines.length === 0) {
    return (
      <div className="p-5">
        <EmptyState title="Aucun mouvement" description="Aucun compte mouvemente sur la periode." />
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {lines.map((line) => (
          <li key={line.accountId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="font-mono text-xs text-slate-500">{line.code}</span>{" "}
              <span className="text-slate-700">{line.name}</span>
            </span>
            <span className="num shrink-0 font-medium">{money(line.balanceMinor)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
        <span>TOTAL</span>
        <span className="num">{money(total)}</span>
      </div>
    </>
  );
}
