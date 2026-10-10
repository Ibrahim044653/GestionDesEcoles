import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireSchoolPage, guardianStudentIds, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AppointmentRequestForm, DocumentRequestForm } from "./request-forms";

export const metadata: Metadata = { title: "Mes demandes" };

const DOCUMENT_KIND_LABELS: Record<string, string> = {
  CERTIFICAT_SCOLARITE: "Certificat de scolarite",
  BULLETIN: "Bulletin",
  RELEVE: "Releve de compte",
  CARTE: "Carte scolaire",
  ATTESTATION: "Attestation",
  AUTRE: "Autre document",
};

const DOCUMENT_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  PENDING: { label: "En cours de traitement", tone: "warning" },
  READY: { label: "Pret a retirer", tone: "info" },
  DELIVERED: { label: "Remis", tone: "success" },
  REJECTED: { label: "Refuse", tone: "danger" },
};

const APPOINTMENT_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  PENDING: { label: "En attente de reponse", tone: "warning" },
  CONFIRMED: { label: "Confirme", tone: "success" },
  DECLINED: { label: "Decline", tone: "danger" },
  DONE: { label: "Effectue", tone: "neutral" },
};

/**
 * Demandes de la famille : documents officiels et rendez-vous.
 *
 * Les demandes affichees sont filtrees sur les enfants reellement rattaches au
 * compte (`guardianStudentIds`). Un parent ne voit jamais la demande d'une
 * autre famille, meme en forgeant un identifiant.
 */
export default async function ParentRequestsPage() {
  const context = await requireSchoolPage();
  const { school } = context;

  const canRequestDocument = hasPermission(context, PERMISSIONS.DOCUMENT_REQUEST);
  const canRequestAppointment = hasPermission(context, PERMISSIONS.APPOINTMENT_REQUEST);

  if (!canRequestDocument && !canRequestAppointment) {
    return (
      <Card>
        <EmptyState
          title="Espace reserve aux parents"
          description="Votre compte n'a pas de role parent dans cet etablissement."
        />
      </Card>
    );
  }

  const studentIds = await guardianStudentIds(context);

  if (studentIds.length === 0) {
    return (
      <>
        <PageHeader title="Mes demandes" />
        <Card>
          <EmptyState
            title="Aucun enfant rattache"
            description="Aucun eleve n'est associe a votre compte. Contactez le secretariat."
          />
        </Card>
      </>
    );
  }

  const [students, documentRequests, appointmentRequests] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds }, schoolId: school.id },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.documentRequest.findMany({
      where: { schoolId: school.id, studentId: { in: studentIds } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { student: { select: { firstName: true, lastName: true } } },
    }),
    prisma.appointmentRequest.findMany({
      where: { schoolId: school.id, studentId: { in: studentIds } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { student: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const children = students.map((student) => ({
    id: student.id,
    name: `${student.firstName} ${student.lastName}`,
  }));

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Mes enfants", href: "/parent" }, { label: "Mes demandes" }]}
        title="Mes demandes"
        description="Demandez un document officiel ou un rendez-vous, et suivez l'avancement."
      />

      <div className="mb-5">
        <Alert tone="info">
          Une demande n&apos;est pas une delivrance immediate : l&apos;etablissement la traite et
          vous notifie du resultat. Les documents sont remis sur place.
        </Alert>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {canRequestDocument && (
          <Card title="Demander un document" description="Certificat, bulletin, releve, carte…">
            <DocumentRequestForm students={children} />
          </Card>
        )}

        {canRequestAppointment && (
          <Card title="Demander un rendez-vous" description="Avec la direction ou le secretariat.">
            <AppointmentRequestForm students={children} />
          </Card>
        )}
      </div>

      <Card title="Mes demandes de documents" padded={false} className="mt-5">
        {documentRequests.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Aucune demande" description="Vous n'avez demande aucun document." />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documentRequests.map((request) => {
              const status = DOCUMENT_STATUS[request.status] ?? {
                label: request.status,
                tone: "neutral" as const,
              };
              return (
                <li key={request.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                  <div className="flex-1">
                    <span className="block text-sm font-medium text-slate-900">
                      {DOCUMENT_KIND_LABELS[request.kind] ?? request.kind}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {request.student.firstName} {request.student.lastName} ·{" "}
                      {formatDate(request.createdAt, school.locale)}
                    </span>
                    {request.note && (
                      <span className="mt-1 block text-xs italic text-slate-600">
                        {request.note}
                      </span>
                    )}
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Mes demandes de rendez-vous" padded={false} className="mt-5">
        {appointmentRequests.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Aucune demande"
              description="Vous n'avez sollicite aucun rendez-vous."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {appointmentRequests.map((request) => {
              const status = APPOINTMENT_STATUS[request.status] ?? {
                label: request.status,
                tone: "neutral" as const,
              };
              return (
                <li key={request.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1">
                      <span className="block text-sm font-medium text-slate-900">
                        {request.subject}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {request.student
                          ? `${request.student.firstName} ${request.student.lastName} · `
                          : ""}
                        Demande le {formatDate(request.createdAt, school.locale)}
                        {request.confirmedAt && (
                          <> · Rendez-vous le {request.confirmedAt.toLocaleString("fr-FR")}</>
                        )}
                      </span>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  {request.message && (
                    <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                      {request.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
