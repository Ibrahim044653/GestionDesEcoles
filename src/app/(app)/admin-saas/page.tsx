import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperAdminPage } from "@/lib/auth/guard";
import { formatMoney } from "@/lib/money";
import { formatDate, formatRelative } from "@/lib/format";
import { SCHOOL_TYPE_LABELS, type SchoolType } from "@/lib/constants";
import { listIntegrations } from "@/lib/integrations";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  BuildingIcon,
  WalletIcon,
  UsersIcon,
  ShieldIcon,
} from "@/components/ui";
import { NewClientForm, SubscriptionStatusForm, TicketReplyForm } from "./saas-forms";

export const metadata: Metadata = { title: "Administration SaaS" };

const SUBSCRIPTION_LABELS: Record<string, string> = {
  TRIAL: "Essai",
  ACTIVE: "Actif",
  PAST_DUE: "Impaye",
  SUSPENDED: "Suspendu",
  CANCELLED: "Resilie",
};

/**
 * Espace super-administrateur de la plateforme.
 *
 * Gere les organisations clientes, leurs abonnements et les factures du SaaS.
 * Ces factures sont STRICTEMENT distinctes des frais scolaires dus par les
 * familles : elles concernent l'editeur et son client etablissement.
 */
export default async function SaasAdminPage() {
  await requireSuperAdminPage();

  const [organizations, plans, invoices, tickets, globalStats] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        schools: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            status: true,
            _count: { select: { students: true, staff: true } },
          },
        },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { plan: { select: { code: true, name: true, maxSchools: true, maxStudents: true } } },
        },
        _count: { select: { saasInvoices: true, supportTickets: true } },
      },
    }),
    prisma.plan.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { subscriptions: true } } },
    }),
    prisma.saasInvoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { organization: { select: { name: true } } },
    }),
    prisma.supportTicket.findMany({
      where: { status: { in: ["OPEN", "PENDING"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        organization: { select: { name: true } },
        school: { select: { name: true } },
        openedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    Promise.all([
      prisma.school.count(),
      prisma.student.count(),
      prisma.user.count(),
      prisma.payment.aggregate({ where: { status: "VALIDATED" }, _sum: { amountMinor: true } }),
    ]),
  ]);

  const [schoolCount, studentCount, userCount, paymentTotals] = globalStats;
  const integrations = listIntegrations();

  // Les montants SaaS sont en XOF par convention de la plateforme.
  const money = (amount: number) => formatMoney(amount, "XOF", "fr-CI");

  return (
    <>
      <PageHeader
        title="Administration de la plateforme"
        description="Organisations clientes, abonnements, facturation SaaS et assistance."
        actions={
          <NewClientForm
            plans={plans
              .filter((plan) => plan.isActive)
              .map((plan) => ({
                id: plan.id,
                label: `${plan.name} — ${plan.maxSchools} etab., ${plan.maxStudents} eleves`,
              }))}
          />
        }
      />

      <div className="mb-5">
        <Alert tone="info" title="Perimetre du super-administrateur">
          Cet espace gere les <strong>clients de la plateforme</strong>. Il ne donne PAS acces aux
          donnees pedagogiques ou financieres d&apos;un etablissement : pour cela, un rattachement
          explicite a l&apos;ecole concernee est necessaire.
        </Alert>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="sky"
          label="Organisations"
          value={String(organizations.length)}
          hint={`${schoolCount} etablissement(s) au total.`}
          icon={<BuildingIcon className="size-[18px]" />}
        />
        <StatCard
          tone="mint"
          label="Eleves sur la plateforme"
          value={String(studentCount)}
          icon={<UsersIcon className="size-[18px]" />}
        />
        <StatCard tone="iris" label="Comptes utilisateurs" value={String(userCount)} />
        <StatCard
          tone="slate"
          label="Encaissements traites"
          value={money(paymentTotals._sum.amountMinor ?? 0)}
          hint="Tous etablissements confondus."
          icon={<WalletIcon className="size-[18px]" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* --------------------------- Organisations --------------------------- */}
          <Card title="Organisations clientes" padded={false}>
            {organizations.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucune organisation" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {organizations.map((organization) => {
                  const subscription = organization.subscriptions[0];
                  const totalStudents = organization.schools.reduce(
                    (total, s) => total + s._count.students,
                    0,
                  );
                  const overSchoolLimit =
                    subscription && organization.schools.length > subscription.plan.maxSchools;
                  const overStudentLimit =
                    subscription && totalStudents > subscription.plan.maxStudents;

                  return (
                    <li key={organization.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {organization.name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {organization.schools.length} etablissement(s) — {totalStudents} eleve(s)
                            — cree {formatRelative(organization.createdAt, "fr-CI")}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {subscription && (
                            <>
                              <Badge tone="info">{subscription.plan.name}</Badge>
                              <Badge
                                tone={
                                  subscription.status === "ACTIVE"
                                    ? "success"
                                    : subscription.status === "TRIAL"
                                      ? "info"
                                      : subscription.status === "SUSPENDED" ||
                                          subscription.status === "CANCELLED"
                                        ? "danger"
                                        : "warning"
                                }
                              >
                                {SUBSCRIPTION_LABELS[subscription.status] ?? subscription.status}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>

                      {(overSchoolLimit || overStudentLimit) && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Limites de la formule depassees :
                          {overSchoolLimit &&
                            ` ${organization.schools.length}/${subscription!.plan.maxSchools} etablissements`}
                          {overStudentLimit &&
                            ` ${totalStudents}/${subscription!.plan.maxStudents} eleves`}
                          . Proposer une montee en gamme.
                        </p>
                      )}

                      <ul className="mt-3 space-y-1">
                        {organization.schools.map((schoolRow) => (
                          <li
                            key={schoolRow.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                          >
                            <span className="font-medium text-slate-700">
                              {schoolRow.name}
                              <span className="ml-1.5 font-mono text-slate-400">{schoolRow.code}</span>
                            </span>
                            <span className="flex items-center gap-2 text-slate-500">
                              {SCHOOL_TYPE_LABELS[schoolRow.type as SchoolType] ?? schoolRow.type}
                              <span>· {schoolRow._count.students} eleves</span>
                              <span>· {schoolRow._count.staff} agents</span>
                              <Badge tone={schoolRow.status === "ACTIVE" ? "success" : "neutral"}>
                                {schoolRow.status}
                              </Badge>
                            </span>
                          </li>
                        ))}
                      </ul>

                      {subscription && (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className="text-xs text-slate-500">
                            {subscription.currentPeriodEnd &&
                              `Echeance : ${formatDate(subscription.currentPeriodEnd, "fr-CI")}`}
                          </span>
                          <SubscriptionStatusForm
                            subscriptionId={subscription.id}
                            currentStatus={subscription.status}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* --------------------------- Factures SaaS --------------------------- */}
          <Card
            title="Factures d'abonnement"
            description="Factures de la plateforme a ses clients. Sans lien avec les frais scolaires des familles."
            padded={false}
          >
            {invoices.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucune facture" />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "number", label: "Numero" },
                  { key: "org", label: "Organisation" },
                  { key: "period", label: "Periode" },
                  { key: "amount", label: "Montant", align: "right" },
                  { key: "status", label: "Statut" },
                ]}
              >
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="font-mono text-xs">{invoice.number}</td>
                    <td className="text-sm">{invoice.organization.name}</td>
                    <td className="text-xs text-slate-600">
                      {formatDate(invoice.periodStart, "fr-CI")} →{" "}
                      {formatDate(invoice.periodEnd, "fr-CI")}
                    </td>
                    <td className="num">{money(invoice.amountMinor)}</td>
                    <td>
                      <Badge
                        tone={
                          invoice.status === "PAID"
                            ? "success"
                            : invoice.status === "OVERDUE"
                              ? "danger"
                              : invoice.status === "VOID"
                                ? "neutral"
                                : "warning"
                        }
                      >
                        {invoice.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          {/* ------------------------------ Tickets ------------------------------ */}
          <Card title="Tickets d'assistance ouverts" padded={false}>
            {tickets.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun ticket ouvert" description="Toutes les demandes sont traitees." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{ticket.subject}</p>
                        <p className="text-xs text-slate-500">
                          {ticket.organization.name}
                          {ticket.school && ` — ${ticket.school.name}`}
                          {ticket.openedBy &&
                            ` — ${ticket.openedBy.lastName} ${ticket.openedBy.firstName}`}
                        </p>
                      </div>
                      <Badge
                        tone={
                          ticket.priority === "URGENT"
                            ? "danger"
                            : ticket.priority === "HIGH"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {ticket.priority}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{ticket.body}</p>
                    {ticket.resolution && (
                      <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700">
                        {ticket.resolution}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {formatRelative(ticket.createdAt, "fr-CI")}
                    </p>
                    <TicketReplyForm ticketId={ticket.id} currentStatus={ticket.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {/* ------------------------------ Formules ------------------------------ */}
          <Card title="Formules d'abonnement" padded={false}>
            <ul className="divide-y divide-slate-100">
              {plans.map((plan) => (
                <li key={plan.id} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{plan.name}</span>
                    <span className="tabular text-sm font-medium text-slate-700">
                      {money(plan.priceMinor)}
                      <span className="text-xs font-normal text-slate-400">
                        /{plan.billingPeriod === "YEARLY" ? "an" : "mois"}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{plan.description}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-400">Ecoles</dt>
                      <dd className="font-medium text-slate-700">{plan.maxSchools}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Eleves</dt>
                      <dd className="font-medium text-slate-700">{plan.maxStudents}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Abonnes</dt>
                      <dd className="font-medium text-slate-700">{plan._count.subscriptions}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Integrations de la plateforme" padded={false}>
            <ul className="divide-y divide-slate-100">
              {integrations.map((integration) => (
                <li key={integration.key} className="flex items-start justify-between gap-2 px-4 py-2.5">
                  <span className="min-w-0 text-xs text-slate-700">{integration.label}</span>
                  <Badge tone={integration.available ? "success" : "neutral"}>
                    {integration.available ? "Active" : "Non configuree"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Alert tone="warning" title="Suspension d'abonnement">
            Suspendre un abonnement bloque l&apos;acces applicatif mais ne supprime JAMAIS les
            donnees de l&apos;etablissement. En cas de resiliation, proposez systematiquement un
            export complet des donnees avant toute suppression.
          </Alert>

          <Card title="Securite de la plateforme">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <ShieldIcon className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              Chaque etablissement constitue un espace isole. Les requetes applicatives sont
              filtrees par identifiant d&apos;etablissement, et toute tentative d&apos;acces
              croise est refusee puis tracee dans le journal d&apos;audit de l&apos;ecole
              concernee.
            </p>
            <p className="mt-3">
              <Link href="/journal-audit" className="text-xs font-medium text-brand-700 hover:underline">
                Consulter un journal d&apos;audit
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
