import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSchoolPage, guardianStudentIds, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate, formatRelative } from "@/lib/format";
import { formatScore } from "@/lib/domain/grades";
import { loadStudentAccount } from "@/lib/domain/student-account";
import { getCurrentAcademicYear } from "@/lib/domain/school-context";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  PulseBanner,
  UsersIcon,
  FileIcon,
  ReceiptIcon,
} from "@/components/ui";

export const metadata: Metadata = { title: "Espace parent" };

/**
 * Espace parent : vue d'ensemble de chaque enfant rattache.
 *
 * ISOLATION : la liste des enfants provient exclusivement de
 * guardianStudentIds, qui ne retourne que les eleves explicitement rattaches
 * a ce parent dans l'etablissement actif.
 */
export default async function ParentHomePage() {
  const context = await requireSchoolPage();
  const { school } = context;

  if (!hasPermission(context, PERMISSIONS.STUDENT_VIEW_OWN)) {
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
  const academicYear = await getCurrentAcademicYear(school.id);
  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);

  if (studentIds.length === 0) {
    return (
      <>
        <PageHeader title="Mes enfants" />
        <Card>
          <EmptyState
            icon={<UsersIcon className="size-8" />}
            title="Aucun enfant rattache"
            description="Aucun eleve n'est associe a votre compte dans cet etablissement. Contactez le secretariat pour faire le rattachement."
          />
        </Card>
      </>
    );
  }

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId: school.id },
    include: {
      enrollments: {
        where: { status: "ACTIVE" },
        include: { classRoom: { select: { name: true } }, academicYear: { select: { name: true } } },
        take: 1,
      },
      guardians: {
        where: { guardian: { userId: context.user.id } },
        select: { canViewGrades: true, canViewFinance: true },
      },
      reportCards: {
        include: { gradingPeriod: { select: { name: true, status: true } } },
        orderBy: { publishedAt: "desc" },
        take: 1,
      },
      paymentProofs: {
        where: { status: "EN_ATTENTE" },
        select: { id: true, declaredAmountMinor: true, createdAt: true },
      },
    },
    orderBy: { lastName: "asc" },
  });

  // Le compte financier n'est charge que si le parent y est autorise.
  const accounts = await Promise.all(
    students.map(async (student) =>
      student.guardians[0]?.canViewFinance
        ? loadStudentAccount(student.id, school.id, { academicYearId: academicYear?.id })
        : null,
    ),
  );

  const [announcements, notifications, upcomingAssignments] = await Promise.all([
    prisma.announcement.findMany({
      where: {
        schoolId: school.id,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 4,
    }),
    prisma.notification.findMany({
      where: { userId: context.user.id, schoolId: school.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.assignment.findMany({
      where: {
        schoolId: school.id,
        status: "PUBLISHED",
        dueAt: { gte: new Date() },
        submissions: { some: { studentId: { in: studentIds } } },
      },
      orderBy: { dueAt: "asc" },
      take: 5,
      include: { subject: { select: { name: true } }, classRoom: { select: { name: true } } },
    }),
  ]);

  const totalDue = accounts.reduce((total, account) => total + (account?.balanceMinor ?? 0), 0);
  const totalPending = accounts.reduce((total, account) => total + (account?.pendingProofMinor ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`Bonjour ${context.user.firstName}`}
        description={`${school.name} — ${academicYear ? `annee ${academicYear.name}` : "suivi de scolarite"}`}
      />

      <PulseBanner
        eyebrow="Vos enfants"
        chips={[
          { label: `${students.length} enfant${students.length > 1 ? "s" : ""} suivi${students.length > 1 ? "s" : ""}` },
          ...(totalDue > 0 ? [{ label: `${money(totalDue)} restant du`, tone: "alert" as const }] : []),
          ...(totalPending > 0 ? [{ label: `${money(totalPending)} en attente de confirmation` }] : []),
        ]}
        actions={
          <Link href="/parent/paiements" className="btn bg-white text-slate-900 hover:bg-slate-100">
            <ReceiptIcon className="size-4" />
            Deposer un justificatif
          </Link>
        }
      />

      {totalPending > 0 && (
        <div className="mb-5">
          <Alert tone="info" title="Justificatifs en cours de verification">
            {money(totalPending)} ont ete declares et attendent la confirmation de
            l&apos;etablissement. Ce montant n&apos;est pas encore deduit de votre solde : il le
            sera une fois le reglement verifie.
          </Alert>
        </div>
      )}

      {/* ------------------------------ Enfants ------------------------------ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {students.map((student, index) => {
          const account = accounts[index];
          const permissions = student.guardians[0];
          const enrollment = student.enrollments[0];
          const reportCard = student.reportCards[0];

          return (
            <Card
              key={student.id}
              title={`${student.lastName} ${student.firstName}`}
              description={`${student.matricule} — ${enrollment?.classRoom.name ?? "non inscrit"}`}
            >
              <div className="grid grid-cols-2 gap-3">
                {permissions?.canViewGrades && (
                  <div className="rounded-xl bg-sky-50 p-3">
                    <p className="label-caps text-sky-700">Derniere moyenne</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 tabular">
                      {reportCard ? formatScore(reportCard.averageCenti, school.locale) : "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {reportCard
                        ? `${reportCard.gradingPeriod.name}${reportCard.rank ? ` · rang ${reportCard.rank}/${reportCard.classSize}` : ""}`
                        : "Aucun bulletin publie"}
                    </p>
                  </div>
                )}

                {permissions?.canViewFinance && account && (
                  <div
                    className={`rounded-xl p-3 ${account.balanceMinor > 0 ? "bg-rose-50" : "bg-mint-50"}`}
                  >
                    <p
                      className={`label-caps ${account.balanceMinor > 0 ? "text-rose-700" : "text-mint-700"}`}
                    >
                      {account.overpaidMinor > 0 ? "Trop-percu" : "Solde restant"}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 tabular">
                      {money(account.overpaidMinor > 0 ? account.overpaidMinor : account.balanceMinor)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {money(account.paidMinor)} regle sur {money(account.netDueMinor)}
                    </p>
                  </div>
                )}
              </div>

              {!permissions?.canViewFinance && (
                <p className="mt-3 text-xs text-slate-500">
                  Vous n&apos;etes pas autorise a consulter la facturation de cet enfant.
                </p>
              )}

              {student.paymentProofs.length > 0 && (
                <p className="mt-3 rounded-lg bg-iris-50 px-3 py-2 text-xs text-iris-700">
                  {student.paymentProofs.length} justificatif(s) en attente de confirmation (
                  {money(
                    student.paymentProofs.reduce((total, proof) => total + proof.declaredAmountMinor, 0),
                  )}
                  ).
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/parent/enfant/${student.id}`} className="btn-primary btn-sm">
                  Voir le detail
                </Link>
                {permissions?.canViewFinance && (
                  <Link
                    href={`/api/documents/releve-compte/${student.id}`}
                    target="_blank"
                    className="btn-secondary btn-sm"
                  >
                    Releve de compte
                  </Link>
                )}
                <Link
                  href={`/api/documents/certificat-scolarite/${student.id}`}
                  target="_blank"
                  className="btn-secondary btn-sm"
                >
                  Certificat
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {/* --------------------- Devoirs, annonces, notifications --------------------- */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Devoirs a venir" padded={false}>
          {upcomingAssignments.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucun devoir a venir" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingAssignments.map((assignment) => (
                <li key={assignment.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">{assignment.title}</p>
                  <p className="text-xs text-slate-500">
                    {assignment.subject.name} — {assignment.classRoom.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    a rendre le {formatDate(assignment.dueAt, school.locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Annonces de l'etablissement" padded={false}>
          {announcements.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucune annonce" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {announcements.map((announcement) => (
                <li key={announcement.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{announcement.title}</p>
                    {announcement.isPinned && <Badge tone="info">Important</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{announcement.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(announcement.publishedAt, school.locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Notifications recentes" padded={false}>
          {notifications.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucune notification" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <li key={notification.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    {!notification.readAt && (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                      <p className="text-xs text-slate-600">{notification.body}</p>
                      <p className="text-xs text-slate-400">
                        {formatRelative(notification.createdAt, school.locale)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-5 flex items-start gap-2 text-xs text-slate-500">
        <FileIcon className="mt-0.5 size-3.5 shrink-0" />
        Vous ne voyez que les enfants qui vous sont officiellement rattaches. Pour ajouter un
        enfant ou modifier vos autorisations, adressez-vous au secretariat de
        l&apos;etablissement.
      </p>
    </>
  );
}
