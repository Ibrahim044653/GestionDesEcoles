import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Card, DataTable, EmptyState, PageHeader, ChartIcon } from "@/components/ui";
import {
  FinancialAccountForm,
  ExpenseCategoryForm,
  AccountingPeriodForm,
  SupplierForm,
} from "./accounting-settings-forms";

export const metadata: Metadata = { title: "Comptabilite" };

/** Plan comptable, caisses, categories de depenses, fournisseurs et periodes. */
export default async function AccountingSettingsPage() {
  const context = await requirePagePermission(PERMISSIONS.ACCOUNT_MANAGE);
  const { school } = context;

  const [ledgerAccounts, financialAccounts, categories, periods, suppliers] = await Promise.all([
    prisma.ledgerAccount.findMany({
      where: { schoolId: school.id },
      orderBy: { code: "asc" },
    }),
    prisma.financialAccount.findMany({
      where: { schoolId: school.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { payments: true, expenses: true } } },
    }),
    prisma.expenseCategory.findMany({
      where: { schoolId: school.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { expenses: true } } },
    }),
    prisma.accountingPeriod.findMany({
      where: { schoolId: school.id },
      orderBy: { startDate: "desc" },
      include: { _count: { select: { entries: true } } },
    }),
    prisma.supplier.findMany({
      where: { schoolId: school.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { expenses: true } } },
    }),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const chargeAccounts = ledgerAccounts.filter((account) => account.type === "CHARGE");

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Parametres", href: "/parametres" }, { label: "Comptabilite" }]}
        title="Parametres comptables"
        description="Plan comptable, caisses, categories de depenses et exercices. Le referentiel fourni suit le SYSCOHADA revise et reste entierement modifiable."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card
            title={`Plan comptable (${ledgerAccounts.length} comptes)`}
            description="Base SYSCOHADA revise, adaptee a un etablissement scolaire."
            padded={false}
          >
            {ledgerAccounts.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ChartIcon className="size-8" />}
                  title="Plan comptable vide"
                  description="Aucun compte n'est defini pour cet etablissement."
                />
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <DataTable
                  columns={[
                    { key: "code", label: "Compte" },
                    { key: "name", label: "Libelle" },
                    { key: "class", label: "Classe", align: "right" },
                    { key: "type", label: "Nature" },
                  ]}
                >
                  {ledgerAccounts.map((account) => (
                    <tr key={account.id}>
                      <td className="font-mono text-xs font-medium">{account.code}</td>
                      <td>{account.name}</td>
                      <td className="num text-slate-500">{account.accountClass}</td>
                      <td className="text-xs text-slate-500">{account.type}</td>
                    </tr>
                  ))}
                </DataTable>
              </div>
            )}
          </Card>

          <Card title="Caisses et comptes bancaires" padded={false}>
            {financialAccounts.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun compte" description="Creez au moins une caisse." />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "name", label: "Compte" },
                  { key: "kind", label: "Type" },
                  { key: "ledger", label: "Compte comptable" },
                  { key: "ops", label: "Operations", align: "right" },
                ]}
              >
                {financialAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <span className="block font-medium text-slate-900">{account.name}</span>
                      <span className="font-mono text-xs text-slate-400">{account.code}</span>
                      {account.bankName && (
                        <span className="block text-xs text-slate-500">{account.bankName}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone="info">{account.kind}</Badge>
                    </td>
                    <td className="font-mono text-xs">{account.ledgerAccountCode}</td>
                    <td className="num text-slate-600">
                      {account._count.payments + account._count.expenses}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          <Card title="Categories de depenses" padded={false}>
            {categories.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aucune categorie"
                  description="Les categories rattachent une depense a un compte de charge."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Categorie" },
                  { key: "account", label: "Compte de charge" },
                  { key: "count", label: "Depenses", align: "right" },
                ]}
              >
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td className="font-mono text-xs">{category.code}</td>
                    <td className="font-medium text-slate-900">{category.name}</td>
                    <td className="font-mono text-xs">
                      {category.defaultAccountCode || (
                        <span className="text-amber-700">non rattache</span>
                      )}
                    </td>
                    <td className="num text-slate-600">{category._count.expenses}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          <Card title="Exercices comptables" padded={false}>
            {periods.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aucun exercice"
                  description="Sans exercice, les ecritures ne sont rattachees a aucune periode cloturable."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "name", label: "Exercice" },
                  { key: "range", label: "Du / au" },
                  { key: "entries", label: "Ecritures", align: "right" },
                  { key: "status", label: "Etat" },
                ]}
              >
                {periods.map((period) => (
                  <tr key={period.id}>
                    <td className="font-medium text-slate-900">{period.name}</td>
                    <td className="text-slate-600">
                      {formatDate(period.startDate, school.locale)} →{" "}
                      {formatDate(period.endDate, school.locale)}
                    </td>
                    <td className="num">{period._count.entries}</td>
                    <td>
                      <Badge tone={period.status === "CLOSED" ? "neutral" : "success"}>
                        {period.status === "CLOSED" ? "Cloture" : "Ouvert"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          <Card title="Fournisseurs" padded={false}>
            {suppliers.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun fournisseur" />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "code", label: "Code" },
                  { key: "name", label: "Fournisseur" },
                  { key: "contact", label: "Contact" },
                  { key: "count", label: "Factures", align: "right" },
                ]}
              >
                {suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="font-mono text-xs">{supplier.code}</td>
                    <td className="font-medium text-slate-900">{supplier.name}</td>
                    <td className="text-xs text-slate-600">
                      {supplier.phone}
                      {supplier.email && <span className="block">{supplier.email}</span>}
                    </td>
                    <td className="num text-slate-600">{supplier._count.expenses}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Nouvelle caisse ou banque">
            <FinancialAccountForm />
          </Card>

          <Card title="Nouvelle categorie de depense">
            <ExpenseCategoryForm
              chargeAccounts={chargeAccounts.map((account) => ({
                code: account.code,
                label: `${account.code} — ${account.name}`,
              }))}
            />
          </Card>

          <Card title="Nouvel exercice comptable">
            <AccountingPeriodForm />
          </Card>

          <Card title="Nouveau fournisseur">
            <SupplierForm />
          </Card>

          <Alert tone="info" title="Principe de non-suppression">
            Une ecriture validee n&apos;est jamais supprimee. Les corrections passent par une
            contrepassation tracee, qui conserve l&apos;ecriture d&apos;origine et son lien avec
            l&apos;ecriture d&apos;annulation. Montants geres en{" "}
            {money(1)} minimum, sans arrondi flottant.
          </Alert>
        </div>
      </div>
    </>
  );
}
