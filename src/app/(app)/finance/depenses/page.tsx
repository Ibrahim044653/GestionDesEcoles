import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { EXPENSE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { listFinancialAccounts } from "@/lib/domain/school-context";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  TruckIcon,
  DownloadIcon,
  WalletIcon,
  CheckIcon,
  AlertIcon,
} from "@/components/ui";
import { ExpenseForm, ExpenseDecisionButtons } from "./expense-forms";
import { UploadButton } from "@/components/client/upload";
import { uploadExpenseAttachmentAction } from "../../fichiers/actions";

export const metadata: Metadata = { title: "Depenses" };

/**
 * Depenses de l'etablissement.
 *
 * Cycle de vie : DEMANDE -> APPROUVEE -> PAYEE.
 * L'ecriture comptable n'est passee qu'au REGLEMENT effectif : une depense
 * approuvee mais non payee est un engagement, pas une sortie de tresorerie.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; categorie?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.EXPENSE_VIEW);
  const params = await searchParams;
  const { school } = context;

  const where = {
    schoolId: school.id,
    ...(params.statut && params.statut !== "TOUS" ? { status: params.statut } : {}),
    ...(params.categorie ? { categoryId: params.categorie } : {}),
  };

  const [expenses, stats, categories, suppliers, financialAccounts] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        category: { select: { name: true, defaultAccountCode: true } },
        supplier: { select: { name: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.expense.groupBy({
      by: ["status"],
      where: { schoolId: school.id },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    prisma.expenseCategory.findMany({
      where: { schoolId: school.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { schoolId: school.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listFinancialAccounts(school.id),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const statFor = (status: string) => stats.find((row) => row.status === status);
  const canCreate = hasPermission(context, PERMISSIONS.EXPENSE_CREATE);
  const canApprove = hasPermission(context, PERMISSIONS.EXPENSE_APPROVE);
  const canPay = hasPermission(context, PERMISSIONS.EXPENSE_PAY);

  return (
    <>
      <PageHeader
        title="Depenses"
        description="Demandes d'achat, factures fournisseurs et reglements. Une depense n'affecte la tresorerie qu'une fois reglee."
        actions={
          <Link href="/api/export/depenses" className="btn-secondary">
            <DownloadIcon className="size-4" />
            Exporter CSV
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="rose"
          label="Payees"
          value={money(statFor("PAID")?._sum.amountMinor ?? 0)}
          hint={`${statFor("PAID")?._count._all ?? 0} depense(s) reglee(s).`}
          icon={<WalletIcon className="size-[18px]" />}
        />
        <StatCard
          tone="iris"
          label="Approuvees non reglees"
          value={money(statFor("APPROVED")?._sum.amountMinor ?? 0)}
          hint="Engagements a prevoir dans la tresorerie."
          icon={<CheckIcon className="size-[18px]" />}
        />
        <StatCard
          tone="sky"
          label="En attente d'approbation"
          value={money(statFor("REQUESTED")?._sum.amountMinor ?? 0)}
          hint={`${statFor("REQUESTED")?._count._all ?? 0} demande(s) d'achat.`}
          icon={<AlertIcon className="size-[18px]" />}
        />
        <StatCard
          tone="slate"
          label="Refusees"
          value={money(statFor("REJECTED")?._sum.amountMinor ?? 0)}
          hint={`${statFor("REJECTED")?._count._all ?? 0} demande(s) refusee(s).`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Depenses" padded={false}>
            <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-3">
              {[
                { value: "TOUS", label: "Toutes" },
                { value: "REQUESTED", label: "A approuver" },
                { value: "APPROVED", label: "A regler" },
                { value: "PAID", label: "Reglees" },
                { value: "REJECTED", label: "Refusees" },
              ].map((option) => (
                <Link
                  key={option.value}
                  href={`/finance/depenses?statut=${option.value}`}
                  className={
                    (params.statut ?? "TOUS") === option.value
                      ? "btn bg-brand-600 text-white btn-sm"
                      : "btn-secondary btn-sm"
                  }
                >
                  {option.label}
                </Link>
              ))}
            </div>

            {expenses.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<TruckIcon className="size-8" />}
                  title="Aucune depense"
                  description="Enregistrez les salaires, loyers, factures et achats de l'etablissement."
                />
              </div>
            ) : (
              <DataTable
                caption="Liste des depenses"
                columns={[
                  { key: "reference", label: "Reference" },
                  { key: "label", label: "Objet" },
                  { key: "category", label: "Categorie" },
                  { key: "amount", label: "Montant", align: "right" },
                  { key: "status", label: "Statut" },
                  { key: "actions", label: "", align: "right" },
                ]}
              >
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {expense.reference}
                      <span className="block text-slate-400">
                        {formatDate(expense.createdAt, school.locale)}
                      </span>
                    </td>
                    <td>
                      <span className="block font-medium text-slate-900">{expense.label}</span>
                      {expense.supplier && (
                        <span className="text-xs text-slate-500">{expense.supplier.name}</span>
                      )}
                      {expense.invoiceNumber && (
                        <span className="block text-xs text-slate-400">
                          Facture {expense.invoiceNumber}
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-slate-600">
                      {expense.category.name}
                      {expense.category.defaultAccountCode && (
                        <span className="block font-mono text-xs text-slate-400">
                          compte {expense.category.defaultAccountCode}
                        </span>
                      )}
                    </td>
                    <td className="num">{money(expense.amountMinor)}</td>
                    <td>
                      <Badge
                        tone={
                          expense.status === "PAID"
                            ? "success"
                            : expense.status === "APPROVED"
                              ? "info"
                              : expense.status === "REJECTED" || expense.status === "CANCELLED"
                                ? "danger"
                                : "warning"
                        }
                      >
                        {EXPENSE_STATUS_LABELS[expense.status] ?? expense.status}
                      </Badge>
                      {expense.paidAt && (
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {formatDate(expense.paidAt, school.locale)} —{" "}
                          {PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod}
                        </span>
                      )}
                      {expense.status === "REJECTED" && expense.rejectionReason && (
                        <span className="mt-0.5 block text-xs text-rose-700">
                          {expense.rejectionReason}
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <ExpenseDecisionButtons
                        expenseId={expense.id}
                        status={expense.status}
                        canApprove={canApprove}
                        canPay={canPay}
                      />
                      {canCreate && (
                        <UploadButton
                          action={uploadExpenseAttachmentAction}
                          hiddenFields={{ expenseId: expense.id }}
                          label="Piece jointe"
                          fieldLabel="Facture ou justificatif"
                          hint="Photo ou PDF de la facture du fournisseur."
                          className="btn-ghost btn-sm"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        {canCreate && (
          <Card
            title="Nouvelle demande"
            description="Enregistree en demande d'achat, puis soumise a approbation."
          >
            {categories.length === 0 ? (
              <EmptyState
                title="Aucune categorie"
                description="Creez des categories de depenses dans les parametres pour commencer."
                action={
                  <Link href="/parametres/comptabilite" className="btn-primary btn-sm">
                    Configurer
                  </Link>
                }
              />
            ) : (
              <ExpenseForm
                currencyLabel={school.currency}
                categories={categories}
                suppliers={suppliers}
                financialAccounts={financialAccounts.map((account) => ({
                  id: account.id,
                  name: account.name,
                }))}
              />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
