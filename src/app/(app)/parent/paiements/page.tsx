import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, guardianStudentIds } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PROOF_STATUS_LABELS } from "@/lib/constants";
import { loadStudentAccount } from "@/lib/domain/student-account";
import { getCurrentAcademicYear } from "@/lib/domain/school-context";
import { env } from "@/lib/env";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  ReceiptIcon,
  FileIcon,
} from "@/components/ui";
import { ProofSubmitForm } from "./proof-form";

export const metadata: Metadata = { title: "Paiements et justificatifs" };

/**
 * Suivi financier cote famille.
 *
 * Affiche distinctement : ce qui est du, ce qui est confirme par
 * l'etablissement, et ce qui a ete declare mais n'est pas encore verifie.
 * Cette distinction est au coeur du cahier des charges.
 */
export default async function ParentPaymentsPage() {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_ACCOUNT_VIEW_OWN);
  const { school } = context;

  const studentIds = await guardianStudentIds(context, { requireFinance: true });
  const academicYear = await getCurrentAcademicYear(school.id);
  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);

  if (studentIds.length === 0) {
    return (
      <>
        <PageHeader title="Paiements" />
        <Card>
          <EmptyState
            title="Aucun acces a la facturation"
            description="Vous n'etes autorise a consulter la facturation d'aucun enfant. Contactez le secretariat."
          />
        </Card>
      </>
    );
  }

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId: school.id },
    select: {
      id: true,
      matricule: true,
      firstName: true,
      lastName: true,
      enrollments: {
        where: { status: "ACTIVE" },
        select: { classRoom: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { lastName: "asc" },
  });

  const [accounts, payments, proofs] = await Promise.all([
    Promise.all(
      students.map((student) =>
        loadStudentAccount(student.id, school.id, { academicYearId: academicYear?.id }),
      ),
    ),
    prisma.payment.findMany({
      where: { studentId: { in: studentIds }, schoolId: school.id, status: "VALIDATED" },
      include: {
        receipt: { select: { number: true } },
        student: { select: { id: true, lastName: true, firstName: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
    prisma.paymentProof.findMany({
      where: { studentId: { in: studentIds }, schoolId: school.id },
      include: {
        student: { select: { id: true, lastName: true, firstName: true } },
        document: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const totals = accounts.reduce(
    (accumulator, account) => ({
      due: accumulator.due + account.netDueMinor,
      paid: accumulator.paid + account.paidMinor,
      pending: accumulator.pending + account.pendingProofMinor,
      balance: accumulator.balance + account.balanceMinor,
      overdue: accumulator.overdue + account.overdueMinor,
    }),
    { due: 0, paid: 0, pending: 0, balance: 0, overdue: 0 },
  );

  return (
    <>
      <PageHeader
        title="Paiements et justificatifs"
        description="Votre situation financiere et le depot de vos justificatifs de reglement."
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="sky" label="Total du" value={money(totals.due)} hint="Apres remises et bourses." />
        <StatCard
          tone="mint"
          label="Paye et confirme"
          value={money(totals.paid)}
          hint="Montants verifies par l'etablissement."
        />
        <StatCard
          tone="iris"
          label="En attente de confirmation"
          value={money(totals.pending)}
          hint="Declare par vous, pas encore verifie. Non deduit du solde."
          icon={<FileIcon className="size-[18px]" />}
        />
        <StatCard
          tone={totals.balance > 0 ? "rose" : "mint"}
          label="Reste a payer"
          value={money(totals.balance)}
          hint={
            totals.overdue > 0
              ? `Dont ${money(totals.overdue)} d'echeances depassees.`
              : "Aucune echeance depassee."
          }
        />
      </div>

      {totals.pending > 0 && (
        <div className="mb-5">
          <Alert tone="info" title="Pourquoi mon solde n'a-t-il pas baisse ?">
            Les {money(totals.pending)} que vous avez declares sont en cours de verification par la
            comptabilite. Votre solde sera mis a jour des que le reglement sera confirme sur le
            compte de l&apos;etablissement. Vous recevrez une notification.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Detail par enfant */}
          {students.map((student, index) => {
            const account = accounts[index];
            return (
              <Card
                key={student.id}
                title={`${student.lastName} ${student.firstName}`}
                description={`${student.matricule} — ${student.enrollments[0]?.classRoom.name ?? "non inscrit"}`}
                actions={
                  <Link
                    href={`/api/documents/releve-compte/${student.id}`}
                    target="_blank"
                    className="btn-secondary btn-sm"
                  >
                    Releve PDF
                  </Link>
                }
                padded={false}
              >
                {account.lines.length === 0 ? (
                  <div className="p-5">
                    <EmptyState title="Aucun frais" description="Aucun frais n'est applique a cet eleve." />
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {account.lines.map((line) => (
                      <div key={line.id} className="px-5 py-3.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{line.label}</p>
                            {line.discountMinor > 0 && (
                              <p className="text-xs text-mint-700">
                                Remise accordee : {money(line.discountMinor)}
                              </p>
                            )}
                          </div>
                          <p className="tabular text-sm">
                            <span className="font-semibold text-slate-900">{money(line.paidMinor)}</span>
                            <span className="text-slate-400"> / {money(line.netDueMinor)}</span>
                          </p>
                        </div>

                        {line.installments.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {line.installments.map((installment) => (
                              <li
                                key={installment.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-slate-600">
                                  {installment.label} — echeance{" "}
                                  {formatDate(installment.dueDate, school.locale)}
                                </span>
                                <span className="flex items-center gap-2">
                                  <span className="tabular text-slate-700">
                                    {money(installment.remainingMinor)} restant
                                  </span>
                                  {installment.remainingMinor === 0 ? (
                                    <Badge tone="success">Reglee</Badge>
                                  ) : installment.isOverdue ? (
                                    <Badge tone="danger">En retard</Badge>
                                  ) : (
                                    <Badge tone="neutral">A venir</Badge>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Reglements confirmes */}
          <Card title="Reglements confirmes" padded={false}>
            {payments.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<ReceiptIcon className="size-8" />}
                  title="Aucun reglement confirme"
                  description="Les reglements verifies par l'etablissement apparaitront ici avec leur recu."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "date", label: "Date" },
                  { key: "student", label: "Enfant" },
                  { key: "method", label: "Mode" },
                  { key: "amount", label: "Montant", align: "right" },
                  { key: "receipt", label: "", align: "right" },
                ]}
              >
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="whitespace-nowrap">{formatDate(payment.paidAt, school.locale)}</td>
                    <td>
                      {payment.student.lastName} {payment.student.firstName}
                    </td>
                    <td>{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</td>
                    <td className="num">{money(payment.amountMinor)}</td>
                    <td className="text-right">
                      <Link
                        href={`/api/documents/recu/${payment.id}`}
                        target="_blank"
                        className="btn-ghost btn-sm"
                      >
                        Recu
                      </Link>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>

          {/* Historique des justificatifs */}
          <Card title="Mes justificatifs deposes" padded={false}>
            {proofs.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Aucun justificatif" description="Vous n'avez encore rien depose." />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "date", label: "Depose le" },
                  { key: "student", label: "Enfant" },
                  { key: "amount", label: "Montant declare", align: "right" },
                  { key: "status", label: "Statut" },
                ]}
              >
                {proofs.map((proof) => (
                  <tr key={proof.id}>
                    <td className="whitespace-nowrap text-xs">
                      {formatDateTime(proof.createdAt, school.locale)}
                    </td>
                    <td className="text-sm">
                      {proof.student.lastName} {proof.student.firstName}
                    </td>
                    <td className="num">{money(proof.declaredAmountMinor)}</td>
                    <td>
                      <Badge
                        tone={
                          proof.status === "ACCEPTE"
                            ? "success"
                            : proof.status === "REJETE"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {PROOF_STATUS_LABELS[proof.status] ?? proof.status}
                      </Badge>
                      {proof.status === "REJETE" && proof.rejectionReason && (
                        <p className="mt-1 text-xs text-rose-700">
                          Motif : {proof.rejectionReason}
                        </p>
                      )}
                      {proof.status === "EN_ATTENTE" && (
                        <p className="mt-1 text-xs text-slate-500">
                          Non deduit de votre solde tant qu&apos;il n&apos;est pas confirme.
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        {/* Depot d'un justificatif */}
        <div>
          <Card title="Deposer un justificatif">
            {env.integrations.payment.configured ? (
              <p className="mb-3 text-xs text-slate-600">
                Le paiement en ligne est configure en mode{" "}
                <strong>{env.integrations.payment.mode}</strong>.
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-600">
                Le paiement en ligne n&apos;est pas disponible sur cet etablissement. Reglez a la
                caisse, par virement ou par Mobile Money, puis deposez ici votre justificatif.
              </p>
            )}

            <ProofSubmitForm
              students={students.map((student) => ({
                id: student.id,
                label: `${student.lastName} ${student.firstName}`,
              }))}
              currencyLabel={school.currency}
              maxUploadMb={Math.round(env.storage.maxUploadBytes / 1024 / 1024)}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
