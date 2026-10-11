import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { getTopDebtors } from "@/lib/domain/dashboard";
import { getCurrentAcademicYear } from "@/lib/domain/school-context";
import { toCsv, csvResponse } from "@/lib/csv";
import { minorToMajor, currencyDecimals } from "@/lib/money";
import { recordAudit } from "@/lib/audit";

/** Export CSV des soldes restant dus, pour les relances. */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!auth.permissions.has(PERMISSIONS.STUDENT_ACCOUNT_VIEW)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const url = new URL(request.url);
  const academicYearId =
    url.searchParams.get("annee") ?? (await getCurrentAcademicYear(auth.school.id))?.id;

  // Limite elevee : cet export sert aux campagnes de relance.
  const debtors = await getTopDebtors(auth.school.id, { academicYearId, limit: 5000 });
  const decimals = currencyDecimals(auth.school.currency);

  const rows = debtors.map((debtor) => ({
    matricule: debtor.matricule,
    eleve: debtor.name,
    classe: debtor.className,
    solde_du: minorToMajor(debtor.balanceMinor, decimals).toFixed(decimals),
    devise: auth.school!.currency,
  }));

  await recordAudit({
    action: "report.unpaid_exported",
    schoolId: auth.school.id,
    userId: auth.user.id,
    metadata: { count: rows.length },
  });

  const csv = toCsv(rows, {
    columns: [
      { key: "matricule", header: "Matricule" },
      { key: "eleve", header: "Eleve" },
      { key: "classe", header: "Classe" },
      { key: "solde_du", header: "Solde restant du" },
      { key: "devise", header: "Devise" },
    ],
  });

  return csvResponse(csv, `impayes-${auth.school.code}-${new Date().toISOString().slice(0, 10)}.csv`);
}
