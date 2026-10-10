import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { EXPENSE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { toCsv, csvResponse } from "@/lib/csv";
import { minorToMajor, currencyDecimals } from "@/lib/money";

/** Export CSV des depenses de l'etablissement actif. */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!auth.permissions.has(PERMISSIONS.EXPENSE_VIEW)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("statut");

  const expenses = await prisma.expense.findMany({
    where: {
      schoolId: auth.school.id,
      ...(status && status !== "TOUS" ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { name: true, defaultAccountCode: true } },
      supplier: { select: { name: true } },
      approvedBy: { select: { firstName: true, lastName: true } },
    },
  });

  const decimals = currencyDecimals(auth.school.currency);

  const rows = expenses.map((expense) => ({
    reference: expense.reference,
    date_creation: expense.createdAt.toISOString().slice(0, 10),
    objet: expense.label,
    categorie: expense.category.name,
    compte_comptable: expense.category.defaultAccountCode,
    fournisseur: expense.supplier?.name ?? "",
    numero_facture: expense.invoiceNumber,
    date_facture: expense.invoiceDate ? expense.invoiceDate.toISOString().slice(0, 10) : "",
    echeance: expense.dueDate ? expense.dueDate.toISOString().slice(0, 10) : "",
    montant: minorToMajor(expense.amountMinor, decimals).toFixed(decimals),
    devise: expense.currency,
    statut: EXPENSE_STATUS_LABELS[expense.status] ?? expense.status,
    mode_reglement: PAYMENT_METHOD_LABELS[expense.paymentMethod] ?? expense.paymentMethod,
    date_paiement: expense.paidAt ? expense.paidAt.toISOString().slice(0, 10) : "",
    approuve_par: expense.approvedBy ? `${expense.approvedBy.lastName} ${expense.approvedBy.firstName}` : "",
    motif_refus: expense.rejectionReason,
  }));

  const csv = toCsv(rows, {
    columns: [
      { key: "reference", header: "Reference" },
      { key: "date_creation", header: "Date de creation" },
      { key: "objet", header: "Objet" },
      { key: "categorie", header: "Categorie" },
      { key: "compte_comptable", header: "Compte comptable" },
      { key: "fournisseur", header: "Fournisseur" },
      { key: "numero_facture", header: "Numero de facture" },
      { key: "date_facture", header: "Date de facture" },
      { key: "echeance", header: "Echeance" },
      { key: "montant", header: "Montant" },
      { key: "devise", header: "Devise" },
      { key: "statut", header: "Statut" },
      { key: "mode_reglement", header: "Mode de reglement" },
      { key: "date_paiement", header: "Date de paiement" },
      { key: "approuve_par", header: "Approuve par" },
      { key: "motif_refus", header: "Motif de refus" },
    ],
  });

  return csvResponse(csv, `depenses-${auth.school.code}-${new Date().toISOString().slice(0, 10)}.csv`);
}
