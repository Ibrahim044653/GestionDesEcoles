import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { OPTIONAL_MODULES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOAN_DAYS, listActiveLoans, listCatalog } from "@/lib/domain/library";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { LendForm, LoanCloseActions, NewItemForm, RetireItemButton } from "./library-forms";

export const metadata: Metadata = { title: "Bibliotheque" };

const KIND_LABELS: Record<string, string> = {
  LIVRE: "Livre",
  MANUEL: "Manuel",
  REVUE: "Revue",
  MULTIMEDIA: "Multimedia",
  AUTRE: "Autre",
};

/**
 * Module optionnel Bibliotheque.
 *
 * La page refuse de fonctionner si le module n'est pas active : elle ne se
 * contente pas de disparaitre du menu. Les actions serveur refont la meme
 * verification de leur cote.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_VIEW);
  const params = await searchParams;
  const { school } = context;

  const schoolRow = await prisma.school.findUniqueOrThrow({
    where: { id: school.id },
    select: { enabledModules: true },
  });

  let modules: string[] = [];
  try {
    const parsed = JSON.parse(schoolRow.enabledModules || "[]");
    modules = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    modules = [];
  }

  if (!modules.includes(OPTIONAL_MODULES.BIBLIOTHEQUE)) {
    return (
      <>
        <PageHeader title="Bibliotheque" description="Module optionnel." />
        <Card>
          <EmptyState
            title="Module non active"
            description="Le module Bibliotheque n'est pas active pour cet etablissement."
            action={
              <Link href="/parametres" className="btn-primary">
                Activer dans les parametres
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const query = (params.q ?? "").trim();

  const [catalog, loans, students, staff] = await Promise.all([
    listCatalog(school.id, { query }),
    listActiveLoans(school.id),
    prisma.student.findMany({
      where: { schoolId: school.id, status: "ACTIVE" },
      orderBy: { lastName: "asc" },
      take: 500,
      select: { id: true, matricule: true, firstName: true, lastName: true },
    }),
    prisma.staff.findMany({
      where: { schoolId: school.id, status: "ACTIVE" },
      orderBy: { lastName: "asc" },
      take: 200,
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const totalCopies = catalog.reduce((sum, item) => sum + item.totalCopies, 0);
  const availableTotal = catalog.reduce((sum, item) => sum + item.availableCopies, 0);
  const overdue = loans.filter((loan) => loan.overdueDays > 0);

  const defaultDueDate = new Date(Date.now() + DEFAULT_LOAN_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Bibliotheque"
        description="Fonds documentaire, prets et retours."
        actions={<NewItemForm />}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard tone="sky" label="Titres au fonds" value={String(catalog.length)} />
        <StatCard
          tone="slate"
          label="Exemplaires detenus"
          value={String(totalCopies)}
          hint={`${availableTotal} disponible(s) actuellement.`}
        />
        <StatCard tone="iris" label="Prets en cours" value={String(loans.length)} />
        <StatCard
          tone={overdue.length > 0 ? "rose" : "mint"}
          label="Prets en retard"
          value={String(overdue.length)}
        />
      </div>

      {overdue.length > 0 && (
        <div className="mb-5">
          <Alert tone="warning" title={`${overdue.length} pret(s) en retard`}>
            Les retards sont signales a titre informatif. Aucune penalite n&apos;est calculee ni
            portee au compte des familles : ce serait a l&apos;etablissement de le decider.
          </Alert>
        </div>
      )}

      <Card title="Nouveau pret" className="mb-5">
        <LendForm
          items={catalog.map((item) => ({
            id: item.id,
            label: `${item.reference} — ${item.title}`,
            available: item.availableCopies,
          }))}
          borrowers={[
            ...students.map((student) => ({
              value: `student:${student.id}`,
              label: `${student.lastName} ${student.firstName} (${student.matricule})`,
            })),
            ...staff.map((member) => ({
              value: `staff:${member.id}`,
              label: `${member.lastName} ${member.firstName} (personnel)`,
            })),
          ]}
          defaultDueDate={defaultDueDate}
        />
      </Card>

      <Card
        title="Prets en cours"
        description="Tries par date de retour : les plus urgents d'abord."
        padded={false}
        className="mb-5"
      >
        {loans.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Aucun pret en cours" description="Tous les exemplaires sont au fonds." />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ouvrage</th>
                  <th>Emprunteur</th>
                  <th>Prete le</th>
                  <th>Retour attendu</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id}>
                    <td>
                      <span className="block text-sm text-slate-900">{loan.item.title}</span>
                      <span className="font-mono text-xs text-slate-400">
                        {loan.item.reference}
                      </span>
                    </td>
                    <td className="text-sm text-slate-700">
                      {loan.student ? (
                        <Link
                          href={`/eleves/${loan.student.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {loan.student.lastName} {loan.student.firstName}
                        </Link>
                      ) : loan.staff ? (
                        <>
                          {loan.staff.lastName} {loan.staff.firstName}
                          <span className="block text-xs text-slate-400">Personnel</span>
                        </>
                      ) : (
                        <span className="text-slate-400">Emprunteur supprime</span>
                      )}
                    </td>
                    <td className="text-sm text-slate-600">
                      {formatDate(loan.loanedAt, school.locale)}
                    </td>
                    <td className="text-sm">
                      {formatDate(loan.dueDate, school.locale)}
                      {loan.overdueDays > 0 && (
                        <Badge tone="danger">{loan.overdueDays} j de retard</Badge>
                      )}
                    </td>
                    <td>
                      <LoanCloseActions loanId={loan.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Fonds documentaire"
        description="La disponibilite est calculee a chaque affichage : exemplaires detenus moins prets en cours."
        padded={false}
      >
        <form method="get" action="/bibliotheque" className="flex gap-2 border-b border-slate-200 p-4">
          <label className="sr-only" htmlFor="q">
            Rechercher un ouvrage
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Titre, auteur, cote ou ISBN"
            className="input max-w-sm"
          />
          <button type="submit" className="btn-secondary">
            Rechercher
          </button>
          {query && (
            <Link href="/bibliotheque" className="btn-ghost">
              Effacer
            </Link>
          )}
        </form>

        {catalog.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={query ? "Aucun resultat" : "Fonds vide"}
              description={
                query
                  ? `Aucun ouvrage ne correspond a « ${query} ».`
                  : "Ajoutez un premier ouvrage au fonds."
              }
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cote</th>
                  <th>Titre</th>
                  <th>Auteur</th>
                  <th>Type</th>
                  <th className="text-right">Detenus</th>
                  <th className="text-right">Disponibles</th>
                  <th>Emplacement</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs text-slate-500">{item.reference}</td>
                    <td className="text-sm font-medium text-slate-900">{item.title}</td>
                    <td className="text-sm text-slate-600">{item.author || "—"}</td>
                    <td className="text-sm text-slate-600">
                      {KIND_LABELS[item.kind] ?? item.kind}
                    </td>
                    <td className="num text-slate-600">{item.totalCopies}</td>
                    <td className="num">
                      <span
                        className={
                          item.availableCopies === 0 ? "text-rose-700" : "text-mint-700"
                        }
                      >
                        {item.availableCopies}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500">{item.shelf || "—"}</td>
                    <td>
                      {item.loanedCopies === 0 ? (
                        <RetireItemButton itemId={item.id} title={item.title} />
                      ) : (
                        <span className="text-xs text-slate-400">
                          {item.loanedCopies} prete(s)
                        </span>
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
  );
}
