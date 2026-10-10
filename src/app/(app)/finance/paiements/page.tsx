import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  StatCard,
  ReceiptIcon,
  DownloadIcon,
  WalletIcon,
  CheckIcon,
  AlertIcon,
} from "@/components/ui";
import { CancelPaymentButton } from "./cancel-form";

export const metadata: Metadata = { title: "Encaissements" };

const PAGE_SIZE = 30;

type SearchParams = {
  q?: string;
  mode?: string;
  du?: string;
  au?: string;
  statut?: string;
  page?: string;
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePagePermission(PERMISSIONS.PAYMENT_VIEW);
  const params = await searchParams;
  const { school } = context;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const query = (params.q ?? "").trim();

  const dateFilter =
    params.du || params.au
      ? {
          ...(params.du ? { gte: new Date(params.du) } : {}),
          ...(params.au ? { lte: new Date(`${params.au}T23:59:59`) } : {}),
        }
      : undefined;

  const where = {
    schoolId: school.id,
    ...(params.statut && params.statut !== "TOUS" ? { status: params.statut } : {}),
    ...(params.mode ? { method: params.mode } : {}),
    ...(dateFilter ? { paidAt: dateFilter } : {}),
    ...(query
      ? {
          OR: [
            { reference: { contains: query } },
            { externalReference: { contains: query } },
            { receipt: { number: { contains: query } } },
            { student: { lastName: { contains: query } } },
            { student: { firstName: { contains: query } } },
            { student: { matricule: { contains: query } } },
          ],
        }
      : {}),
  };

  const [payments, total, totals, pendingProofs] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        student: { select: { id: true, lastName: true, firstName: true, matricule: true } },
        receipt: { select: { number: true } },
        cashier: { select: { firstName: true, lastName: true } },
        financialAccount: { select: { name: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where: { ...where, status: "VALIDATED" },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    prisma.paymentProof.aggregate({
      where: { schoolId: school.id, status: "EN_ATTENTE" },
      _sum: { declaredAmountMinor: true },
      _count: { _all: true },
    }),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const canCreate = hasPermission(context, PERMISSIONS.PAYMENT_CREATE);
  const canCancel = hasPermission(context, PERMISSIONS.PAYMENT_CANCEL);

  const buildHref = (targetPage: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") search.set(key, value);
    }
    if (targetPage > 1) search.set("page", String(targetPage));
    const queryString = search.toString();
    return queryString ? `/finance/paiements?${queryString}` : "/finance/paiements";
  };

  return (
    <>
      <PageHeader
        title="Encaissements"
        description="Reglements effectivement recus et valides. Les justificatifs non confirmes n'apparaissent pas ici."
        actions={
          <>
            <Link href={`/api/export/paiements${buildHref(1).replace("/finance/paiements", "")}`} className="btn-secondary">
              <DownloadIcon className="size-4" />
              Exporter CSV
            </Link>
            {canCreate && (
              <Link href="/finance/paiements/nouveau" className="btn-primary">
                <ReceiptIcon className="size-4" />
                Nouvel encaissement
              </Link>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          tone="mint"
          label="Total encaisse (filtre)"
          value={money(totals._sum.amountMinor ?? 0)}
          hint={`${totals._count._all} reglement(s) valide(s).`}
          icon={<WalletIcon className="size-[18px]" />}
        />
        <StatCard
          tone="iris"
          label="Justificatifs en attente"
          value={money(pendingProofs._sum.declaredAmountMinor ?? 0)}
          hint={`${pendingProofs._count._all} declaration(s) a verifier. Non comptees comme encaissees.`}
          icon={<AlertIcon className="size-[18px]" />}
          href="/finance/justificatifs"
        />
        <StatCard
          tone="slate"
          label="Operations affichees"
          value={String(total)}
          hint="Selon les filtres appliques ci-dessous."
          icon={<CheckIcon className="size-[18px]" />}
        />
      </div>

      {/* ------------------------------ Filtres ------------------------------ */}
      <Card className="mb-4">
        <form method="get" action="/finance/paiements" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="field-label">
              Rechercher
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Recu, reference, eleve, matricule"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="mode" className="field-label">
              Mode
            </label>
            <select id="mode" name="mode" defaultValue={params.mode ?? ""} className="input">
              <option value="">Tous les modes</option>
              {Object.values(PAYMENT_METHODS).map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
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
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="btn-primary">
              Filtrer
            </button>
            <Link href="/finance/paiements" className="btn-ghost">
              Reinitialiser
            </Link>
          </div>
        </form>
      </Card>

      {/* ------------------------------ Resultats ------------------------------ */}
      <Card padded={false}>
        {payments.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ReceiptIcon className="size-8" />}
              title="Aucun encaissement"
              description="Aucun reglement ne correspond aux filtres selectionnes."
              action={
                canCreate && (
                  <Link href="/finance/paiements/nouveau" className="btn-primary btn-sm">
                    Enregistrer un encaissement
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <>
            <DataTable
              caption="Liste des encaissements"
              columns={[
                { key: "date", label: "Date" },
                { key: "receipt", label: "Recu" },
                { key: "student", label: "Eleve" },
                { key: "method", label: "Mode" },
                { key: "account", label: "Compte" },
                { key: "cashier", label: "Caissier" },
                { key: "amount", label: "Montant", align: "right" },
                { key: "actions", label: "", align: "right" },
              ]}
            >
              {payments.map((payment) => (
                <tr key={payment.id} className={payment.status === "CANCELLED" ? "opacity-60" : ""}>
                  <td className="whitespace-nowrap">{formatDate(payment.paidAt, school.locale)}</td>
                  <td className="whitespace-nowrap font-mono text-xs">
                    {payment.receipt?.number ?? payment.reference}
                    {payment.status === "CANCELLED" && (
                      <span className="ml-1.5">
                        <Badge tone="danger">Annule</Badge>
                      </span>
                    )}
                  </td>
                  <td>
                    <Link
                      href={`/eleves/${payment.student.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {payment.student.lastName} {payment.student.firstName}
                    </Link>
                    <span className="block font-mono text-xs text-slate-400">
                      {payment.student.matricule}
                    </span>
                  </td>
                  <td>
                    {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                    {payment.externalReference && (
                      <span className="block font-mono text-xs text-slate-400">
                        {payment.externalReference}
                      </span>
                    )}
                  </td>
                  <td className="text-slate-600">{payment.financialAccount?.name ?? "—"}</td>
                  <td className="text-slate-600">
                    {payment.cashier ? `${payment.cashier.firstName} ${payment.cashier.lastName}` : "—"}
                  </td>
                  <td className="num">{money(payment.amountMinor)}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/api/documents/recu/${payment.id}`} target="_blank" className="btn-ghost btn-sm">
                      Recu
                    </Link>
                    {canCancel && payment.status === "VALIDATED" && (
                      <CancelPaymentButton paymentId={payment.id} reference={payment.reference} />
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>

            <div className="px-4 pb-4">
              <Pagination page={page} pageCount={pageCount} total={total} buildHref={buildHref} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
