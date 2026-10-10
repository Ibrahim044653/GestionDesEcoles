import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { AppointmentRequestActions, DocumentRequestActions } from "./request-forms";

export const metadata: Metadata = { title: "Demandes des familles" };

/** Libelles des documents demandables, et route d'edition quand elle existe. */
const DOCUMENT_KINDS: Record<string, { label: string; route?: (studentId: string) => string }> = {
  CERTIFICAT_SCOLARITE: {
    label: "Certificat de scolarite",
    route: (studentId) => `/api/documents/certificat-scolarite/${studentId}`,
  },
  RELEVE: {
    label: "Releve de compte",
    route: (studentId) => `/api/documents/releve-compte/${studentId}`,
  },
  CARTE: {
    label: "Carte scolaire",
    route: (studentId) => `/api/documents/carte-scolaire/${studentId}`,
  },
  // Le bulletin depend d'une periode : il s'edite depuis la fiche de l'eleve.
  BULLETIN: { label: "Bulletin" },
  ATTESTATION: { label: "Attestation" },
  AUTRE: { label: "Autre document" },
};

const DOCUMENT_STATUS_TONES: Record<
  string,
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  PENDING: "warning",
  READY: "info",
  DELIVERED: "success",
  REJECTED: "danger",
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "A traiter",
  READY: "Pret",
  DELIVERED: "Remis",
  REJECTED: "Refuse",
};

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "A traiter",
  CONFIRMED: "Confirme",
  DECLINED: "Decline",
  DONE: "Effectue",
};

/** Format attendu par un champ datetime-local : "AAAA-MM-JJTHH:MM". */
function toLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Demandes adressees par les familles : documents officiels et rendez-vous.
 *
 * Les demandes traitees restent affichees : une famille doit pouvoir faire
 * constater qu'elle a bien demande un document, et l'etablissement garder la
 * trace de sa reponse.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.DOCUMENT_FULFILL);
  const params = await searchParams;
  const { school } = context;

  const showAll = params.etat === "toutes";
  const canHandleAppointments = hasPermission(context, PERMISSIONS.APPOINTMENT_MANAGE);

  const [documentRequests, appointmentRequests] = await Promise.all([
    prisma.documentRequest.findMany({
      where: { schoolId: school.id, ...(showAll ? {} : { status: { in: ["PENDING", "READY"] } }) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
        requestedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    canHandleAppointments
      ? prisma.appointmentRequest.findMany({
          where: {
            schoolId: school.id,
            ...(showAll ? {} : { status: { in: ["PENDING", "CONFIRMED"] } }),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            student: { select: { id: true, matricule: true, firstName: true, lastName: true } },
            staff: { select: { firstName: true, lastName: true } },
            requestedBy: { select: { firstName: true, lastName: true, email: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const pendingDocuments = documentRequests.filter((item) => item.status === "PENDING").length;
  const readyDocuments = documentRequests.filter((item) => item.status === "READY").length;
  const pendingAppointments = appointmentRequests.filter(
    (item) => item.status === "PENDING",
  ).length;

  return (
    <>
      <PageHeader
        title="Demandes des familles"
        description="Documents officiels et rendez-vous demandes depuis l'espace parent."
        actions={
          <Link
            href={showAll ? "/demandes" : "/demandes?etat=toutes"}
            className="btn-secondary btn-sm"
          >
            {showAll ? "Voir seulement les demandes en cours" : "Voir tout l'historique"}
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          tone={pendingDocuments > 0 ? "rose" : "mint"}
          label="Documents a traiter"
          value={String(pendingDocuments)}
        />
        <StatCard tone="sky" label="Documents prets a remettre" value={String(readyDocuments)} />
        <StatCard
          tone={pendingAppointments > 0 ? "rose" : "mint"}
          label="Rendez-vous a traiter"
          value={canHandleAppointments ? String(pendingAppointments) : "—"}
          hint={canHandleAppointments ? undefined : "Reserve aux profils habilites."}
        />
      </div>

      <Card title="Demandes de documents" padded={false} className="mb-5">
        {documentRequests.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Aucune demande"
              description={
                showAll
                  ? "Aucune famille n'a demande de document."
                  : "Aucune demande en cours. L'historique reste consultable."
              }
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Eleve</th>
                  <th>Document</th>
                  <th>Demande par</th>
                  <th>Statut</th>
                  <th>Traitement</th>
                </tr>
              </thead>
              <tbody>
                {documentRequests.map((request) => {
                  const kind = DOCUMENT_KINDS[request.kind] ?? { label: request.kind };
                  return (
                    <tr key={request.id}>
                      <td>
                        <Link
                          href={`/eleves/${request.student.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {request.student.lastName} {request.student.firstName}
                        </Link>
                        <span className="block font-mono text-xs text-slate-400">
                          {request.student.matricule}
                        </span>
                      </td>
                      <td>
                        <span className="block text-sm text-slate-900">{kind.label}</span>
                        {request.note && (
                          <span className="block max-w-xs text-xs italic text-slate-500">
                            {request.note}
                          </span>
                        )}
                        <span className="block text-xs text-slate-400">
                          {request.createdAt.toLocaleDateString("fr-FR")}
                        </span>
                      </td>
                      <td className="text-sm text-slate-600">
                        {request.requestedBy
                          ? `${request.requestedBy.firstName} ${request.requestedBy.lastName}`
                          : "—"}
                      </td>
                      <td>
                        <Badge tone={DOCUMENT_STATUS_TONES[request.status] ?? "neutral"}>
                          {DOCUMENT_STATUS_LABELS[request.status] ?? request.status}
                        </Badge>
                      </td>
                      <td>
                        <DocumentRequestActions
                          requestId={request.id}
                          status={request.status}
                          canDownload={Boolean(kind.route)}
                          downloadHref={kind.route ? kind.route(request.student.id) : null}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canHandleAppointments && (
        <Card title="Demandes de rendez-vous" padded={false}>
          {appointmentRequests.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucune demande"
                description="Aucune famille n'a sollicite de rendez-vous."
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {appointmentRequests.map((request) => (
                <li key={request.id} className="flex flex-col gap-3 p-5 lg:flex-row">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{request.subject}</span>
                      <Badge
                        tone={
                          request.status === "PENDING"
                            ? "warning"
                            : request.status === "CONFIRMED"
                              ? "success"
                              : request.status === "DECLINED"
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {APPOINTMENT_STATUS_LABELS[request.status] ?? request.status}
                      </Badge>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      {request.student ? (
                        <>
                          Eleve :{" "}
                          <Link
                            href={`/eleves/${request.student.id}`}
                            className="text-brand-700 hover:underline"
                          >
                            {request.student.lastName} {request.student.firstName}
                          </Link>{" "}
                          ·{" "}
                        </>
                      ) : null}
                      Demande par{" "}
                      {request.requestedBy
                        ? `${request.requestedBy.firstName} ${request.requestedBy.lastName}`
                        : "—"}{" "}
                      le{" "}
                      {request.createdAt.toLocaleDateString("fr-FR")}
                      {request.preferredAt && (
                        <> · Creneau souhaite : {request.preferredAt.toLocaleString("fr-FR")}</>
                      )}
                      {request.confirmedAt && (
                        <> · Confirme le {request.confirmedAt.toLocaleString("fr-FR")}</>
                      )}
                    </p>

                    {request.message && (
                      <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                        {request.message}
                      </p>
                    )}
                  </div>

                  <div className="lg:w-80 lg:shrink-0">
                    <AppointmentRequestActions
                      requestId={request.id}
                      status={request.status}
                      preferredAtValue={toLocalInputValue(request.preferredAt)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
