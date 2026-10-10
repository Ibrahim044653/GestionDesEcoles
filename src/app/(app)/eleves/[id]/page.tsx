import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission, assertSameSchoolOrNotFound } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatScore } from "@/lib/domain/grades";
import { loadStudentAccount } from "@/lib/domain/student-account";
import { getCurrentAcademicYear, listClassRooms } from "@/lib/domain/school-context";
import {
  ATTENDANCE_STATUS_LABELS,
  DISCOUNT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PROOF_STATUS_LABELS,
  STUDENT_STATUS_LABELS,
} from "@/lib/constants";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  StatCard,
  DownloadIcon,
  ReceiptIcon,
  FileIcon,
  WalletIcon,
  AlertIcon,
  CheckIcon,
} from "@/components/ui";
import { GuardianForm, StudentStatusForm, EnrollmentForm } from "./forms";

export const metadata: Metadata = { title: "Dossier eleve" };

/**
 * Dossier complet d'un eleve : identite, scolarite, compte financier,
 * resultats, absences et documents.
 *
 * L'acces est verifie deux fois : permission STUDENT_VIEW, puis appartenance
 * de l'eleve a l'etablissement actif (assertSameSchoolOrNotFound). Un identifiant
 * appartenant a une autre ecole renvoie une page 404, sans indiquer qu'il
 * existe ailleurs.
 */
export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_VIEW);
  const { id } = await params;
  const { school } = context;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      enrollments: {
        include: {
          classRoom: { include: { level: true, track: true } },
          academicYear: true,
        },
        orderBy: { enrolledAt: "desc" },
      },
      guardians: { include: { guardian: true } },
      reportCards: {
        include: { gradingPeriod: { select: { name: true, status: true } } },
        orderBy: { publishedAt: "desc" },
      },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!student) notFound();
  await assertSameSchoolOrNotFound(context, student, "student");

  const canSeeFinance = hasPermission(context, PERMISSIONS.STUDENT_ACCOUNT_VIEW);
  const canManageEnrollment = hasPermission(context, PERMISSIONS.ENROLLMENT_MANAGE);
  const canUpdate = hasPermission(context, PERMISSIONS.STUDENT_UPDATE);

  const academicYear = await getCurrentAcademicYear(school.id);

  const [account, payments, proofs, attendanceSummary, classRooms] = await Promise.all([
    canSeeFinance ? loadStudentAccount(student.id, school.id) : Promise.resolve(null),
    canSeeFinance
      ? prisma.payment.findMany({
          where: { studentId: student.id, schoolId: school.id },
          include: { receipt: { select: { number: true } }, cashier: { select: { firstName: true, lastName: true } } },
          orderBy: { paidAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    canSeeFinance
      ? prisma.paymentProof.findMany({
          where: { studentId: student.id, schoolId: school.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { studentId: student.id, schoolId: school.id },
      _count: { _all: true },
    }),
    canManageEnrollment && academicYear
      ? listClassRooms(school.id, academicYear.id)
      : Promise.resolve([]),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const currentEnrollment = student.enrollments.find((enrollment) => enrollment.status === "ACTIVE");
  const absences = attendanceSummary.find((row) => row.status === "ABSENT")?._count._all ?? 0;
  const lateCount = attendanceSummary.find((row) => row.status === "RETARD")?._count._all ?? 0;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Eleves", href: "/eleves" }, { label: `${student.lastName} ${student.firstName}` }]}
        title={`${student.lastName} ${student.firstName}`}
        description={`Matricule ${student.matricule} — ${currentEnrollment ? currentEnrollment.classRoom.name : "non inscrit cette annee"}`}
        actions={
          <>
            <Link href={`/api/documents/certificat-scolarite/${student.id}`} className="btn-secondary" target="_blank">
              <FileIcon className="size-4" />
              Certificat
            </Link>
            <Link href={`/api/documents/carte-scolaire/${student.id}`} className="btn-secondary" target="_blank">
              Carte scolaire
            </Link>
            {canSeeFinance && (
              <Link href={`/api/documents/releve-compte/${student.id}`} className="btn-secondary" target="_blank">
                <DownloadIcon className="size-4" />
                Releve de compte
              </Link>
            )}
            {canUpdate && (
              <Link href={`/eleves/${student.id}/modifier`} className="btn-primary">
                Modifier le dossier
              </Link>
            )}
          </>
        }
      />

      {student.status !== "ACTIVE" && (
        <div className="mb-5">
          <Alert tone="warning" title={`Eleve ${STUDENT_STATUS_LABELS[student.status] ?? student.status}`}>
            {student.statusReason || "Aucun motif renseigne."}
            {student.archivedAt && ` — depuis le ${formatDate(student.archivedAt, school.locale)}.`}{" "}
            L&apos;historique reste consultable et n&apos;a pas ete supprime.
          </Alert>
        </div>
      )}

      {/* --------------------------- Compte financier --------------------------- */}
      {canSeeFinance && account && (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              tone="sky"
              label="Total du (net)"
              value={money(account.netDueMinor)}
              hint={
                account.discountMinor > 0
                  ? `Apres ${money(account.discountMinor)} de remises accordees.`
                  : "Aucune remise accordee."
              }
              icon={<WalletIcon className="size-[18px]" />}
            />
            <StatCard
              tone="mint"
              label="Paye et valide"
              value={money(account.paidMinor)}
              hint={`${formatPercent(account.settlementRateCenti, school.locale)} du montant du.`}
              icon={<CheckIcon className="size-[18px]" />}
            />
            <StatCard
              tone={account.pendingProofMinor > 0 ? "iris" : "slate"}
              label="En attente de confirmation"
              value={money(account.pendingProofMinor)}
              hint="Justificatifs deposes par la famille. NON deduits du solde tant qu'ils ne sont pas valides."
              icon={<FileIcon className="size-[18px]" />}
            />
            <StatCard
              tone={account.balanceMinor > 0 ? "rose" : "mint"}
              label={account.overpaidMinor > 0 ? "Trop-percu" : "Solde restant du"}
              value={money(account.overpaidMinor > 0 ? account.overpaidMinor : account.balanceMinor)}
              hint={
                account.overdueMinor > 0
                  ? `Dont ${money(account.overdueMinor)} d'echeances depassees.`
                  : account.overpaidMinor > 0
                    ? "Un remboursement peut etre demande."
                    : "Aucune echeance depassee."
              }
              icon={<AlertIcon className="size-[18px]" />}
            />
          </div>

          {account.pendingProofMinor > 0 && (
            <div className="mb-5">
              <Alert tone="info" title="Justificatifs en attente">
                {money(account.pendingProofMinor)} ont ete declares par la famille mais ne sont pas
                encore confirmes par la comptabilite. Ce montant n&apos;est volontairement{" "}
                <strong>pas</strong> deduit du solde.
              </Alert>
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ------------------------- Frais et echeances ------------------------- */}
          {canSeeFinance && account && (
            <Card
              title="Frais et echeances"
              description="Detail de ce qui est du, des remises et des reglements imputes."
              padded={false}
              actions={
                hasPermission(context, PERMISSIONS.PAYMENT_CREATE) && (
                  <Link href={`/finance/paiements/nouveau?eleve=${student.id}`} className="btn-primary btn-sm">
                    <ReceiptIcon className="size-4" />
                    Encaisser
                  </Link>
                )
              }
            >
              {account.lines.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="Aucun frais applique"
                    description="Les frais sont appliques automatiquement a l'inscription, ou manuellement depuis la page Frais scolaires."
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {account.lines.map((line) => (
                    <div key={line.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{line.label}</p>
                          <p className="text-xs text-slate-500">
                            Brut {money(line.grossMinor)}
                            {line.discountMinor > 0 && ` — remise ${money(line.discountMinor)}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="tabular text-sm font-semibold text-slate-900">
                            {money(line.paidMinor)} / {money(line.netDueMinor)}
                          </p>
                          <p className={`text-xs ${line.remainingMinor > 0 ? "text-rose-600" : "text-mint-700"}`}>
                            {line.remainingMinor > 0 ? `Reste ${money(line.remainingMinor)}` : "Solde"}
                          </p>
                        </div>
                      </div>

                      {line.installments.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {line.installments.map((installment) => (
                            <li
                              key={installment.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                            >
                              <span className="font-medium text-slate-700">{installment.label}</span>
                              <span className="text-slate-500">
                                echeance {formatDate(installment.dueDate, school.locale)}
                              </span>
                              <span className="tabular text-slate-700">
                                {money(installment.paidMinor)} / {money(installment.amountMinor)}
                              </span>
                              {installment.remainingMinor === 0 ? (
                                <Badge tone="success">Reglee</Badge>
                              ) : installment.isOverdue ? (
                                <Badge tone="danger">Depassee</Badge>
                              ) : (
                                <Badge tone="neutral">A venir</Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ---------------------------- Reglements ---------------------------- */}
          {canSeeFinance && (
            <Card title="Reglements enregistres" padded={false}>
              {payments.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="Aucun reglement" description="Aucun encaissement n'a encore ete enregistre." />
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "receipt", label: "Recu" },
                    { key: "method", label: "Mode" },
                    { key: "cashier", label: "Encaisse par" },
                    { key: "amount", label: "Montant", align: "right" },
                    { key: "actions", label: "", align: "right" },
                  ]}
                >
                  {payments.map((payment) => (
                    <tr key={payment.id} className={payment.status === "CANCELLED" ? "opacity-60" : ""}>
                      <td>{formatDate(payment.paidAt, school.locale)}</td>
                      <td className="font-mono text-xs">
                        {payment.receipt?.number ?? payment.reference}
                        {payment.status === "CANCELLED" && (
                          <Badge tone="danger">Annule</Badge>
                        )}
                      </td>
                      <td>{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</td>
                      <td className="text-slate-600">
                        {payment.cashier ? `${payment.cashier.firstName} ${payment.cashier.lastName}` : "—"}
                      </td>
                      <td className="num">{money(payment.amountMinor)}</td>
                      <td className="text-right">
                        <Link
                          href={`/api/documents/recu/${payment.id}`}
                          target="_blank"
                          className="btn-ghost btn-sm"
                        >
                          Recu PDF
                        </Link>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          )}

          {/* --------------------------- Justificatifs --------------------------- */}
          {canSeeFinance && proofs.length > 0 && (
            <Card title="Justificatifs deposes" padded={false}>
              <DataTable
                columns={[
                  { key: "date", label: "Depose le" },
                  { key: "amount", label: "Montant declare", align: "right" },
                  { key: "method", label: "Mode declare" },
                  { key: "status", label: "Statut" },
                ]}
              >
                {proofs.map((proof) => (
                  <tr key={proof.id}>
                    <td>{formatDateTime(proof.createdAt, school.locale)}</td>
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
                      {proof.status === "REJETE" && proof.rejectionReason && (
                        <p className="mt-1 text-xs text-rose-700">{proof.rejectionReason}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          )}

          {/* ------------------------------ Bulletins ------------------------------ */}
          <Card title="Resultats scolaires" padded={false}>
            {student.reportCards.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Aucun bulletin"
                  description="Les bulletins apparaissent une fois generes par le service pedagogique."
                />
              </div>
            ) : (
              <DataTable
                columns={[
                  { key: "period", label: "Periode" },
                  { key: "average", label: "Moyenne", align: "right" },
                  { key: "rank", label: "Rang", align: "right" },
                  { key: "classAverage", label: "Moyenne classe", align: "right" },
                  { key: "actions", label: "", align: "right" },
                ]}
              >
                {student.reportCards.map((reportCard) => (
                  <tr key={reportCard.id}>
                    <td className="font-medium text-slate-900">{reportCard.gradingPeriod.name}</td>
                    <td className="num">{formatScore(reportCard.averageCenti, school.locale)}</td>
                    <td className="num">
                      {reportCard.rank ? `${reportCard.rank} / ${reportCard.classSize}` : "—"}
                    </td>
                    <td className="num text-slate-600">
                      {formatScore(reportCard.classAverageCenti, school.locale)}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/api/documents/bulletin/${student.id}/${reportCard.gradingPeriodId}`}
                        target="_blank"
                        className="btn-ghost btn-sm"
                      >
                        Bulletin PDF
                      </Link>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        {/* ----------------------------- Colonne droite ----------------------------- */}
        <div className="space-y-5">
          <Card title="Identite">
            <FieldGrid cols={2}>
              <Field label="Date de naissance">{formatDate(student.birthDate, school.locale)}</Field>
              <Field label="Lieu de naissance">{student.birthPlace}</Field>
              <Field label="Sexe">
                {student.gender === "F" ? "Feminin" : student.gender === "M" ? "Masculin" : "Non precise"}
              </Field>
              <Field label="Nationalite">{student.nationality}</Field>
              <Field label="Telephone">{student.phone}</Field>
              <Field label="E-mail">{student.email}</Field>
              <Field label="Adresse">{student.address}</Field>
              <Field label="Groupe sanguin">{student.bloodGroup}</Field>
              <Field label="Contact d'urgence">
                {student.emergencyContactName}
                {student.emergencyContactPhone && ` — ${student.emergencyContactPhone}`}
              </Field>
              <Field label="Etablissement precedent">{student.previousSchool}</Field>
            </FieldGrid>

            {student.medicalNotes && (
              <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5">
                <p className="label-caps text-amber-700">Observations medicales</p>
                <p className="mt-1 text-sm text-amber-900">{student.medicalNotes}</p>
              </div>
            )}
          </Card>

          <Card title="Assiduite">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-rose-50 px-3 py-2.5">
                <p className="label-caps text-rose-700">Absences</p>
                <p className="mt-0.5 text-2xl font-semibold text-slate-900 tabular">{absences}</p>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2.5">
                <p className="label-caps text-amber-700">Retards</p>
                <p className="mt-0.5 text-2xl font-semibold text-slate-900 tabular">{lateCount}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {attendanceSummary.map((row) => (
                <li key={row.status} className="flex justify-between">
                  <span>{ATTENDANCE_STATUS_LABELS[row.status] ?? row.status}</span>
                  <span className="tabular">{row._count._all}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* ------------------------- Responsables legaux ------------------------- */}
          <Card title="Responsables legaux">
            {student.guardians.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun responsable rattache.</p>
            ) : (
              <ul className="space-y-3">
                {student.guardians.map((link) => (
                  <li key={link.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {link.guardian.lastName} {link.guardian.firstName}
                        </p>
                        <p className="text-xs text-slate-500">{link.relation}</p>
                      </div>
                      {link.isPrimary && <Badge tone="info">Principal</Badge>}
                    </div>
                    <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {link.guardian.phone && <dd>{link.guardian.phone}</dd>}
                      {link.guardian.email && <dd className="truncate">{link.guardian.email}</dd>}
                    </dl>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={link.canViewGrades ? "success" : "neutral"}>
                        {link.canViewGrades ? "Voit les notes" : "Notes masquees"}
                      </Badge>
                      <Badge tone={link.canViewFinance ? "success" : "neutral"}>
                        {link.canViewFinance ? "Voit la facturation" : "Finances masquees"}
                      </Badge>
                      <Badge tone={link.guardian.userId ? "info" : "neutral"}>
                        {link.guardian.userId ? "Acces parent actif" : "Pas de compte"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canUpdate && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand-700 hover:underline">
                  Rattacher un responsable
                </summary>
                <div className="mt-3">
                  <GuardianForm studentId={student.id} />
                </div>
              </details>
            )}
          </Card>

          {/* ---------------------------- Scolarite ---------------------------- */}
          <Card title="Parcours scolaire">
            {student.enrollments.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune inscription enregistree.</p>
            ) : (
              <ol className="space-y-2.5">
                {student.enrollments.map((enrollment) => (
                  <li key={enrollment.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {enrollment.classRoom.name}
                      </span>
                      <Badge tone={enrollment.status === "ACTIVE" ? "success" : "neutral"}>
                        {enrollment.status === "ACTIVE" ? "En cours" : "Terminee"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {enrollment.academicYear.name} — {enrollment.kind.toLowerCase()}
                      {enrollment.decision !== "EN_ATTENTE" && ` — ${enrollment.decision}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            {canManageEnrollment && academicYear && !currentEnrollment && classRooms.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand-700 hover:underline">
                  Inscrire pour {academicYear.name}
                </summary>
                <div className="mt-3">
                  <EnrollmentForm
                    studentId={student.id}
                    academicYearId={academicYear.id}
                    classRooms={classRooms.map((room) => ({
                      id: room.id,
                      name: room.name,
                      remaining: room.capacity - room._count.enrollments,
                    }))}
                  />
                </div>
              </details>
            )}
          </Card>

          {hasPermission(context, PERMISSIONS.STUDENT_ARCHIVE) && student.status === "ACTIVE" && (
            <Card title="Depart de l'eleve">
              <p className="mb-3 text-xs text-slate-600">
                Enregistre un transfert, un abandon ou une fin de scolarite. Aucune donnee
                n&apos;est supprimee : le dossier reste consultable et exportable.
              </p>
              <StudentStatusForm studentId={student.id} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
