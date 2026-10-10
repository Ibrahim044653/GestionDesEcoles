import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, DataTable, EmptyState, PageHeader, Pagination, ShieldIcon, Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Journal d'audit" };

const PAGE_SIZE = 50;

/** Libelles lisibles des actions tracees. */
const ACTION_LABELS: Record<string, string> = {
  "auth.login.success": "Connexion reussie",
  "auth.login.failed": "Echec de connexion",
  "auth.login.locked": "Compte bloque",
  "auth.logout": "Deconnexion",
  "auth.password.changed": "Mot de passe modifie",
  "auth.school.switched": "Changement d'etablissement",
  "security.access_denied": "Acces refuse",
  "security.cross_tenant_attempt": "Tentative d'acces inter-etablissements",
  "student.created": "Eleve cree",
  "student.updated": "Eleve modifie",
  "student.archived": "Eleve archive",
  "student.imported": "Import d'eleves",
  "student.exported": "Export d'eleves",
  "fee.assigned": "Frais applique",
  "discount.granted": "Remise accordee",
  "payment.created": "Encaissement enregistre",
  "payment.cancelled": "Encaissement annule",
  "payment.duplicate_blocked": "Double encaissement evite",
  "payment.exported": "Export des encaissements",
  "receipt.issued": "Recu emis",
  "proof.submitted": "Justificatif depose",
  "proof.accepted": "Justificatif accepte",
  "proof.rejected": "Justificatif rejete",
  "refund.requested": "Remboursement demande",
  "refund.approved": "Remboursement verse",
  "grade.entered": "Notes saisies",
  "grade.revised": "Note corrigee",
  "grade.published": "Resultats publies",
  "reportcard.generated": "Bulletins generes",
  "expense.created": "Depense creee",
  "expense.approved": "Depense approuvee",
  "expense.paid": "Depense reglee",
  "journal.posted": "Ecriture validee",
  "journal.reversed": "Ecriture contrepassee",
  "period.closed": "Periode comptable cloturee",
  "year.closed": "Annee scolaire cloturee",
  "file.downloaded": "Fichier telecharge",
  "membership.created": "Utilisateur rattache",
  "membership.suspended": "Acces suspendu",
  "membership.reactivated": "Acces reactive",
  "user.password_reset": "Mot de passe reinitialise",
  "staff.payroll_exported": "Export paie",
  "report.unpaid_exported": "Export des impayes",
};

/** Categories a surveiller : tout evenement de securite est mis en avant. */
function toneFor(action: string): "neutral" | "info" | "warning" | "danger" | "success" {
  if (action.startsWith("security.") || action === "auth.login.failed") return "danger";
  if (action.includes("cancel") || action.includes("reversed") || action.includes("rejected")) {
    return "warning";
  }
  if (action.includes("created") || action.includes("accepted") || action.includes("published")) {
    return "success";
  }
  if (action.startsWith("auth.")) return "info";
  return "neutral";
}

/**
 * Journal d'audit de l'etablissement.
 *
 * Trace les operations sensibles : authentification, acces refuses, tentatives
 * inter-etablissements, operations financieres et corrections de notes.
 * Les donnees sensibles (mots de passe, jetons) sont masquees a l'ecriture.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string; categorie?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.AUDIT_VIEW);
  const params = await searchParams;
  const { school } = context;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const categoryFilters: Record<string, { startsWith: string }[]> = {
    securite: [{ startsWith: "security." }, { startsWith: "auth." }],
    finance: [
      { startsWith: "payment." },
      { startsWith: "proof." },
      { startsWith: "expense." },
      { startsWith: "journal." },
      { startsWith: "refund." },
    ],
    pedagogie: [{ startsWith: "grade." }, { startsWith: "reportcard." }],
    donnees: [{ startsWith: "student." }, { startsWith: "membership." }, { startsWith: "user." }],
  };

  const where = {
    schoolId: school.id,
    ...(params.action ? { action: params.action } : {}),
    ...(params.categorie && categoryFilters[params.categorie]
      ? { OR: categoryFilters[params.categorie].map((filter) => ({ action: filter })) }
      : {}),
  };

  const [events, total, securityCount] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.count({
      where: {
        schoolId: school.id,
        OR: [{ action: { startsWith: "security." } }, { action: "auth.login.failed" }],
        createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
    }),
  ]);

  const pageCount = Math.ceil(total / PAGE_SIZE);

  const buildHref = (targetPage: number) => {
    const search = new URLSearchParams();
    if (params.action) search.set("action", params.action);
    if (params.categorie) search.set("categorie", params.categorie);
    if (targetPage > 1) search.set("page", String(targetPage));
    const queryString = search.toString();
    return queryString ? `/journal-audit?${queryString}` : "/journal-audit";
  };

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description="Operations sensibles tracees pour cet etablissement. Les mots de passe, jetons et cles ne sont jamais journalises."
      />

      {securityCount > 0 && (
        <div className="mb-5">
          <Alert tone="warning" title={`${securityCount} evenement(s) de securite sur 7 jours`}>
            Echecs de connexion, acces refuses ou tentatives d&apos;acces a un autre etablissement.
            Un nombre eleve et repete peut signaler une tentative d&apos;intrusion.{" "}
            <Link href="/journal-audit?categorie=securite" className="font-semibold underline">
              Consulter
            </Link>
          </Alert>
        </div>
      )}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtrer le journal">
        {[
          { value: "", label: "Tout" },
          { value: "securite", label: "Securite et acces" },
          { value: "finance", label: "Finances" },
          { value: "pedagogie", label: "Pedagogie" },
          { value: "donnees", label: "Donnees et comptes" },
        ].map((option) => (
          <Link
            key={option.value || "all"}
            href={option.value ? `/journal-audit?categorie=${option.value}` : "/journal-audit"}
            className={
              (params.categorie ?? "") === option.value
                ? "btn bg-brand-600 text-white btn-sm"
                : "btn-secondary btn-sm"
            }
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <Card padded={false}>
        {events.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<ShieldIcon className="size-8" />}
              title="Aucun evenement"
              description="Aucune operation ne correspond a ce filtre."
            />
          </div>
        ) : (
          <>
            <DataTable
              caption="Journal d'audit"
              columns={[
                { key: "date", label: "Date" },
                { key: "action", label: "Action" },
                { key: "user", label: "Utilisateur" },
                { key: "entity", label: "Objet" },
                { key: "context", label: "Contexte" },
              ]}
            >
              {events.map((event) => {
                let metadata: Record<string, unknown> = {};
                try {
                  metadata = JSON.parse(event.metadata) as Record<string, unknown>;
                } catch {
                  metadata = {};
                }
                const entries = Object.entries(metadata).slice(0, 4);

                return (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap text-xs text-slate-600">
                      {formatDateTime(event.createdAt, school.locale)}
                    </td>
                    <td>
                      <Badge tone={toneFor(event.action)}>
                        {ACTION_LABELS[event.action] ?? event.action}
                      </Badge>
                    </td>
                    <td className="text-xs">
                      {event.user ? (
                        <>
                          <span className="block font-medium text-slate-800">
                            {event.user.lastName} {event.user.firstName}
                          </span>
                          <span className="block truncate text-slate-400">{event.user.email}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">Systeme</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-600">
                      {event.entityType && (
                        <>
                          <span className="block">{event.entityType}</span>
                          <span className="block truncate font-mono text-slate-400">
                            {event.entityId}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="text-xs text-slate-600">
                      {entries.length > 0 && (
                        <ul className="space-y-0.5">
                          {entries.map(([key, value]) => (
                            <li key={key} className="truncate">
                              <span className="text-slate-400">{key} : </span>
                              {String(value)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {event.ipAddress && (
                        <span className="block font-mono text-slate-400">{event.ipAddress}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>

            <div className="px-4 pb-4">
              <Pagination page={page} pageCount={pageCount} total={total} buildHref={buildHref} />
            </div>
          </>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Conservation : les evenements d&apos;audit sont conserves aussi longtemps que
        l&apos;etablissement est actif. Definissez une politique de purge adaptee a votre
        reglementation locale (voir <code>docs/SECURITE.md</code>).
      </p>
    </>
  );
}
