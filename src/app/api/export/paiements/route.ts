import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { toCsv, csvResponse } from "@/lib/csv";
import { minorToMajor, currencyDecimals } from "@/lib/money";
import { recordAudit } from "@/lib/audit";

/**
 * Export CSV des encaissements.
 *
 * Les montants sont exportes en valeur decimale brute (sans symbole ni
 * separateur de milliers) afin de rester exploitables dans un tableur.
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!auth.permissions.has(PERMISSIONS.REPORT_EXPORT) && !auth.permissions.has(PERMISSIONS.PAYMENT_VIEW)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("du");
  const to = url.searchParams.get("au");
  const method = url.searchParams.get("mode");
  const status = url.searchParams.get("statut");

  const payments = await prisma.payment.findMany({
    where: {
      schoolId: auth.school.id,
      ...(status && status !== "TOUS" ? { status } : {}),
      ...(method ? { method } : {}),
      ...(from || to
        ? {
            paidAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
            },
          }
        : {}),
    },
    orderBy: { paidAt: "desc" },
    include: {
      student: {
        select: {
          matricule: true,
          lastName: true,
          firstName: true,
          enrollments: {
            where: { status: "ACTIVE" },
            select: { classRoom: { select: { name: true } } },
            take: 1,
          },
        },
      },
      receipt: { select: { number: true } },
      cashier: { select: { firstName: true, lastName: true } },
      financialAccount: { select: { name: true } },
      allocations: { include: { feeAssignment: { select: { label: true } } } },
    },
  });

  const decimals = currencyDecimals(auth.school.currency);

  const rows = payments.map((payment) => ({
    date: payment.paidAt.toISOString().slice(0, 10),
    recu: payment.receipt?.number ?? "",
    reference: payment.reference,
    matricule: payment.student.matricule,
    eleve: `${payment.student.lastName} ${payment.student.firstName}`,
    classe: payment.student.enrollments[0]?.classRoom.name ?? "",
    mode: PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
    reference_externe: payment.externalReference,
    compte: payment.financialAccount?.name ?? "",
    caissier: payment.cashier ? `${payment.cashier.lastName} ${payment.cashier.firstName}` : "",
    montant: minorToMajor(payment.amountMinor, decimals).toFixed(decimals),
    devise: payment.currency,
    statut: payment.status === "VALIDATED" ? "Valide" : "Annule",
    motif_annulation: payment.cancelReason,
    imputations: payment.allocations.map((a) => a.feeAssignment.label).join(" | "),
  }));

  await recordAudit({
    action: "payment.exported",
    schoolId: auth.school.id,
    userId: auth.user.id,
    metadata: { count: rows.length, from, to },
  });

  const csv = toCsv(rows, {
    columns: [
      { key: "date", header: "Date" },
      { key: "recu", header: "Numero de recu" },
      { key: "reference", header: "Reference" },
      { key: "matricule", header: "Matricule" },
      { key: "eleve", header: "Eleve" },
      { key: "classe", header: "Classe" },
      { key: "mode", header: "Mode de reglement" },
      { key: "reference_externe", header: "Reference externe" },
      { key: "compte", header: "Compte crediteur" },
      { key: "caissier", header: "Encaisse par" },
      { key: "montant", header: "Montant" },
      { key: "devise", header: "Devise" },
      { key: "statut", header: "Statut" },
      { key: "motif_annulation", header: "Motif d'annulation" },
      { key: "imputations", header: "Imputations" },
    ],
  });

  return csvResponse(csv, `encaissements-${auth.school.code}-${new Date().toISOString().slice(0, 10)}.csv`);
}
