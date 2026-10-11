import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { toCsv, csvResponse } from "@/lib/csv";
import { minorToMajor, currencyDecimals } from "@/lib/money";
import { recordAudit } from "@/lib/audit";

/**
 * Export du personnel destine a un logiciel de paie externe.
 *
 * L'application ne calcule AUCUNE paie legale : cet export fournit les
 * elements de base (contrat, remuneration indicative, heures) que le logiciel
 * de paie exploitera selon le parametrage legal applicable.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!auth.permissions.has(PERMISSIONS.STAFF_EXPORT_PAYROLL)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  const staff = await prisma.staff.findMany({
    where: { schoolId: auth.school.id },
    orderBy: { lastName: "asc" },
    include: {
      staffAttendances: {
        where: { date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        select: { minutesWorked: true, status: true },
      },
    },
  });

  const decimals = currencyDecimals(auth.school.currency);

  const rows = staff.map((member) => {
    const minutesWorked = member.staffAttendances.reduce(
      (total, record) => total + record.minutesWorked,
      0,
    );
    const absences = member.staffAttendances.filter((record) => record.status === "ABSENT").length;

    return {
      numero: member.staffNumber,
      nom: member.lastName,
      prenom: member.firstName,
      fonction: member.jobTitle,
      type_contrat: member.contractType,
      debut_contrat: member.contractStart ? member.contractStart.toISOString().slice(0, 10) : "",
      fin_contrat: member.contractEnd ? member.contractEnd.toISOString().slice(0, 10) : "",
      salaire_base: minorToMajor(member.baseSalaryMinor, decimals).toFixed(decimals),
      taux_horaire: minorToMajor(member.hourlyRateMinor, decimals).toFixed(decimals),
      devise: auth.school!.currency,
      heures_mois: (minutesWorked / 60).toFixed(2),
      absences_mois: String(absences),
      coordonnees_bancaires: member.bankDetails,
      statut: member.status,
    };
  });

  await recordAudit({
    action: "staff.payroll_exported",
    schoolId: auth.school.id,
    userId: auth.user.id,
    metadata: { count: rows.length },
  });

  const csv = toCsv(rows, {
    columns: [
      { key: "numero", header: "Numero" },
      { key: "nom", header: "Nom" },
      { key: "prenom", header: "Prenom" },
      { key: "fonction", header: "Fonction" },
      { key: "type_contrat", header: "Type de contrat" },
      { key: "debut_contrat", header: "Debut de contrat" },
      { key: "fin_contrat", header: "Fin de contrat" },
      { key: "salaire_base", header: "Salaire de base (indicatif)" },
      { key: "taux_horaire", header: "Taux horaire (indicatif)" },
      { key: "devise", header: "Devise" },
      { key: "heures_mois", header: "Heures du mois" },
      { key: "absences_mois", header: "Absences du mois" },
      { key: "coordonnees_bancaires", header: "Coordonnees bancaires" },
      { key: "statut", header: "Statut" },
    ],
  });

  return csvResponse(csv, `personnel-${auth.school.code}-${new Date().toISOString().slice(0, 10)}.csv`);
}
