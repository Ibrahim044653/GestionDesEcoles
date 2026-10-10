import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { computeTrialBalance } from "@/lib/domain/accounting";
import { toCsv, csvResponse } from "@/lib/csv";
import { minorToMajor, currencyDecimals } from "@/lib/money";

/** Export CSV de la balance generale. */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!auth.permissions.has(PERMISSIONS.JOURNAL_VIEW)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("du");
  const to = url.searchParams.get("au");

  const balances = await computeTrialBalance(auth.school.id, {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
  });

  const decimals = currencyDecimals(auth.school.currency);
  const toAmount = (minor: number) => minorToMajor(minor, decimals).toFixed(decimals);

  const rows = balances.map((balance) => ({
    compte: balance.code,
    libelle: balance.name,
    classe: String(balance.accountClass),
    nature: balance.type,
    debit: toAmount(balance.debitMinor),
    credit: toAmount(balance.creditMinor),
    solde: toAmount(balance.balanceMinor),
  }));

  const csv = toCsv(rows, {
    columns: [
      { key: "compte", header: "Compte" },
      { key: "libelle", header: "Libelle" },
      { key: "classe", header: "Classe" },
      { key: "nature", header: "Nature" },
      { key: "debit", header: "Debit" },
      { key: "credit", header: "Credit" },
      { key: "solde", header: "Solde" },
    ],
  });

  return csvResponse(csv, `balance-${auth.school.code}-${new Date().toISOString().slice(0, 10)}.csv`);
}
