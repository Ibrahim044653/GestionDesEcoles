import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { listFinancialAccounts } from "@/lib/domain/school-context";
import { computeAccountBalance } from "@/lib/domain/reconciliation";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { CloseReconciliationForm, NewReconciliationForm } from "./reconciliation-forms";

export const metadata: Metadata = { title: "Rapprochement bancaire" };

/** Premier et dernier jour du mois precedent, au format AAAA-MM-JJ. */
function previousMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Rapprochement bancaire.
 *
 * Le solde comptable affiche n'est PAS une saisie : il est recalcule a partir
 * des encaissements valides et des depenses payees. C'est ce qui donne un sens
 * a l'ecart avec le releve.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ compte?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.RECONCILIATION_MANAGE);
  const params = await searchParams;
  const { school } = context;

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const accounts = await listFinancialAccounts(school.id);
  const range = previousMonthRange();

  const selectedAccountId = params.compte ?? accounts[0]?.id;

  const [reconciliations, currentBalance] = await Promise.all([
    prisma.bankReconciliation.findMany({
      where: { financialAccount: { schoolId: school.id } },
      orderBy: { periodEnd: "desc" },
      take: 50,
      include: { financialAccount: { select: { name: true, kind: true } } },
    }),
    selectedAccountId
      ? computeAccountBalance(
          school.id,
          selectedAccountId,
          new Date(Date.UTC(1970, 0, 1)),
          new Date(),
        )
      : Promise.resolve(null),
  ]);

  const open = reconciliations.filter((item) => item.status === "OPEN");

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Finances", href: "/finance/paiements" }, { label: "Rapprochement" }]}
        title="Rapprochement bancaire"
        description="Compare le solde d'un releve au solde reconstitue depuis les mouvements enregistres."
      />

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            title="Aucun compte financier"
            description="Creez d'abord un compte (caisse, banque, mobile money) dans les parametres financiers."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              tone="sky"
              label="Solde comptable a ce jour"
              value={currentBalance ? money(currentBalance.bookBalanceMinor) : "—"}
              hint="Ouverture + encaissements valides − depenses payees."
            />
            <StatCard
              tone={open.length > 0 ? "rose" : "mint"}
              label="Rapprochements ouverts"
              value={String(open.length)}
            />
            <StatCard
              tone="slate"
              label="Rapprochements enregistres"
              value={String(reconciliations.length)}
            />
          </div>

          <div className="mb-5">
            <Alert tone="info" title="Ce que ce calcul ne fait pas">
              L&apos;ecart constate n&apos;est jamais corrige automatiquement. Aucune ecriture
              n&apos;est passee ici : le rapprochement sert a expliquer une difference, pas a la
              faire disparaitre.
            </Alert>
          </div>

          <Card title="Nouveau rapprochement" className="mb-5">
            <NewReconciliationForm
              accounts={accounts.map((account) => ({
                id: account.id,
                label: `${account.name} (${account.kind})`,
              }))}
              currencyLabel={school.currency}
              defaultStart={range.start}
              defaultEnd={range.end}
            />
          </Card>

          <Card title="Historique" padded={false}>
            {reconciliations.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aucun rapprochement"
                  description="Aucun rapprochement n'a encore ete effectue."
                />
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Compte</th>
                      <th>Periode</th>
                      <th className="text-right">Solde releve</th>
                      <th className="text-right">Solde comptable</th>
                      <th className="text-right">Ecart</th>
                      <th>Statut</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliations.map((item) => (
                      <tr key={item.id}>
                        <td className="text-sm text-slate-900">{item.financialAccount.name}</td>
                        <td className="text-sm text-slate-600">
                          {formatDate(item.periodStart, school.locale)} —{" "}
                          {formatDate(item.periodEnd, school.locale)}
                          {item.notes && (
                            <span className="mt-0.5 block max-w-xs text-xs italic text-slate-500">
                              {item.notes}
                            </span>
                          )}
                        </td>
                        <td className="num">{money(item.statementBalanceMinor)}</td>
                        <td className="num">{money(item.bookBalanceMinor)}</td>
                        <td className="num">
                          <span
                            className={
                              item.differenceMinor === 0
                                ? "text-mint-700"
                                : "font-semibold text-rose-700"
                            }
                          >
                            {money(item.differenceMinor)}
                          </span>
                        </td>
                        <td>
                          <Badge tone={item.status === "CLOSED" ? "success" : "warning"}>
                            {item.status === "CLOSED" ? "Cloture" : "Ouvert"}
                          </Badge>
                        </td>
                        <td>
                          {item.status === "OPEN" ? (
                            <CloseReconciliationForm
                              reconciliationId={item.id}
                              hasDifference={item.differenceMinor !== 0}
                              currentNotes={item.notes}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
