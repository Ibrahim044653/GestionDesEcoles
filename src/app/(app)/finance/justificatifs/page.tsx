import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PROOF_STATUS_LABELS } from "@/lib/constants";
import { listFinancialAccounts } from "@/lib/domain/school-context";
import { env } from "@/lib/env";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  FileIcon,
  CheckIcon,
  XIcon,
  AlertIcon,
} from "@/components/ui";
import { ProofReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Justificatifs de paiement" };

/**
 * Traitement des justificatifs deposes par les familles.
 *
 * REGLE CENTRALE : un justificatif EN_ATTENTE est une declaration. Il ne
 * figure dans aucun total encaisse et ne reduit aucun solde. Seule son
 * acceptation par une personne habilitee cree un encaissement reel et un recu.
 */
export default async function PaymentProofsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.PROOF_VIEW);
  const params = await searchParams;
  const { school } = context;

  const statusFilter = params.statut ?? "EN_ATTENTE";
  const canReview = hasPermission(context, PERMISSIONS.PROOF_REVIEW);

  const [proofs, counts, financialAccounts] = await Promise.all([
    prisma.paymentProof.findMany({
      where: { schoolId: school.id, ...(statusFilter !== "TOUS" ? { status: statusFilter } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        student: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            matricule: true,
            enrollments: {
              where: { status: "ACTIVE" },
              select: { classRoom: { select: { name: true } } },
              take: 1,
            },
          },
        },
        document: { select: { id: true, fileName: true, mimeType: true } },
        submittedBy: { select: { firstName: true, lastName: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
        payment: { select: { id: true, reference: true, receipt: { select: { number: true } } } },
      },
    }),
    prisma.paymentProof.groupBy({
      by: ["status"],
      where: { schoolId: school.id },
      _count: { _all: true },
      _sum: { declaredAmountMinor: true },
    }),
    listFinancialAccounts(school.id),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const countFor = (status: string) => counts.find((row) => row.status === status);

  const pending = countFor("EN_ATTENTE");
  const accepted = countFor("ACCEPTE");
  const rejected = countFor("REJETE");

  return (
    <>
      <PageHeader
        title="Justificatifs de paiement"
        description="Declarations deposees par les familles, en attente de verification par la comptabilite."
      />

      <div className="mb-5">
        <Alert tone="info" title="Un justificatif n'est pas un encaissement">
          Tant qu&apos;un justificatif est <strong>en attente</strong>, son montant n&apos;entre
          dans aucun total encaisse et ne reduit pas le solde de la famille. L&apos;acceptation
          cree un encaissement reel, emet un recu et passe l&apos;ecriture comptable
          correspondante.
          {env.integrations.ocr.configured
            ? " L'extraction OCR disponible est purement indicative et ne vaut jamais validation."
            : " L'OCR n'est pas active : la verification est entierement manuelle."}
        </Alert>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          tone="iris"
          label="En attente"
          value={money(pending?._sum.declaredAmountMinor ?? 0)}
          hint={`${pending?._count._all ?? 0} justificatif(s) a verifier.`}
          icon={<AlertIcon className="size-[18px]" />}
        />
        <StatCard
          tone="mint"
          label="Acceptes"
          value={money(accepted?._sum.declaredAmountMinor ?? 0)}
          hint={`${accepted?._count._all ?? 0} transforme(s) en encaissement.`}
          icon={<CheckIcon className="size-[18px]" />}
        />
        <StatCard
          tone="rose"
          label="Rejetes"
          value={money(rejected?._sum.declaredAmountMinor ?? 0)}
          hint={`${rejected?._count._all ?? 0} refuse(s) avec motif communique.`}
          icon={<XIcon className="size-[18px]" />}
        />
      </div>

      {/* Filtre de statut */}
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filtrer par statut">
        {[
          { value: "EN_ATTENTE", label: "En attente" },
          { value: "ACCEPTE", label: "Acceptes" },
          { value: "REJETE", label: "Rejetes" },
          { value: "TOUS", label: "Tous" },
        ].map((option) => (
          <Link
            key={option.value}
            href={`/finance/justificatifs?statut=${option.value}`}
            aria-current={statusFilter === option.value ? "page" : undefined}
            className={
              statusFilter === option.value
                ? "btn bg-brand-600 text-white btn-sm"
                : "btn-secondary btn-sm"
            }
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {proofs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileIcon className="size-8" />}
            title={statusFilter === "EN_ATTENTE" ? "Aucun justificatif en attente" : "Aucun justificatif"}
            description={
              statusFilter === "EN_ATTENTE"
                ? "Tous les justificatifs deposes ont ete traites."
                : "Aucune declaration ne correspond a ce filtre."
            }
          />
        </Card>
      ) : statusFilter === "EN_ATTENTE" && canReview ? (
        /* Vue de traitement : une carte par justificatif, avec le formulaire d'arbitrage */
        <div className="space-y-4">
          {proofs.map((proof) => (
            <Card key={proof.id} padded={false}>
              <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
                {/* Informations declarees */}
                <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r lg:col-span-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/eleves/${proof.student.id}`}
                        className="text-base font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {proof.student.lastName} {proof.student.firstName}
                      </Link>
                      <p className="text-sm text-slate-500">
                        {proof.student.matricule} —{" "}
                        {proof.student.enrollments[0]?.classRoom.name ?? "non inscrit"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold text-slate-900 tabular">
                        {money(proof.declaredAmountMinor)}
                      </p>
                      <p className="text-xs text-slate-500">montant declare</p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-slate-500">Mode declare</dt>
                      <dd className="font-medium text-slate-900">
                        {PAYMENT_METHOD_LABELS[proof.declaredMethod] ?? proof.declaredMethod}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Reference declaree</dt>
                      <dd className="font-mono text-xs font-medium text-slate-900">
                        {proof.declaredReference || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Date declaree</dt>
                      <dd className="font-medium text-slate-900">
                        {formatDate(proof.declaredPaidAt, school.locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Depose</dt>
                      <dd className="font-medium text-slate-900">
                        {formatRelative(proof.createdAt, school.locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Depose par</dt>
                      <dd className="font-medium text-slate-900">
                        {proof.submittedBy
                          ? `${proof.submittedBy.firstName} ${proof.submittedBy.lastName}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Piece jointe</dt>
                      <dd>
                        {proof.document ? (
                          <Link
                            href={`/api/files/${proof.document.id}`}
                            target="_blank"
                            className="font-medium text-brand-700 hover:underline"
                          >
                            Ouvrir le fichier
                          </Link>
                        ) : (
                          <span className="text-slate-400">Aucune</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {proof.ocrStatus === "DONE" && (
                    <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5">
                      <p className="label-caps text-slate-500">Extraction OCR (indicative)</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Cette extraction ne vaut pas validation : verifiez le justificatif et le
                        releve du compte beneficiaire avant d&apos;accepter.
                      </p>
                    </div>
                  )}
                </div>

                {/* Arbitrage */}
                <div className="bg-slate-50/60 p-5">
                  <p className="label-caps mb-3 text-slate-500">Decision</p>
                  <ProofReviewForm
                    proofId={proof.id}
                    declaredAmountMinor={proof.declaredAmountMinor}
                    currencyLabel={school.currency}
                    financialAccounts={financialAccounts.map((account) => ({
                      id: account.id,
                      label: account.name,
                    }))}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Vue tableau pour l'historique */
        <Card padded={false}>
          <DataTable
            caption="Justificatifs deposes"
            columns={[
              { key: "date", label: "Depose le" },
              { key: "student", label: "Eleve" },
              { key: "amount", label: "Montant declare", align: "right" },
              { key: "method", label: "Mode" },
              { key: "status", label: "Statut" },
              { key: "result", label: "Suite donnee" },
            ]}
          >
            {proofs.map((proof) => (
              <tr key={proof.id}>
                <td className="whitespace-nowrap">{formatDateTime(proof.createdAt, school.locale)}</td>
                <td>
                  <Link
                    href={`/eleves/${proof.student.id}`}
                    className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                  >
                    {proof.student.lastName} {proof.student.firstName}
                  </Link>
                  <span className="block font-mono text-xs text-slate-400">{proof.student.matricule}</span>
                </td>
                <td className="num">{money(proof.declaredAmountMinor)}</td>
                <td>{PAYMENT_METHOD_LABELS[proof.declaredMethod] ?? proof.declaredMethod}</td>
                <td>
                  <Badge
                    tone={
                      proof.status === "ACCEPTE" ? "success" : proof.status === "REJETE" ? "danger" : "warning"
                    }
                  >
                    {PROOF_STATUS_LABELS[proof.status] ?? proof.status}
                  </Badge>
                </td>
                <td className="text-xs text-slate-600">
                  {proof.status === "ACCEPTE" && proof.payment ? (
                    <Link
                      href={`/api/documents/recu/${proof.payment.id}`}
                      target="_blank"
                      className="text-brand-700 hover:underline"
                    >
                      Recu {proof.payment.receipt?.number ?? proof.payment.reference}
                    </Link>
                  ) : proof.status === "REJETE" ? (
                    <span className="text-rose-700">{proof.rejectionReason}</span>
                  ) : (
                    "En attente de verification"
                  )}
                  {proof.reviewedBy && (
                    <span className="block text-slate-400">
                      par {proof.reviewedBy.firstName} {proof.reviewedBy.lastName}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}
    </>
  );
}
