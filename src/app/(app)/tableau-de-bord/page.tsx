import type { Metadata } from "next";
import Link from "next/link";
import { requireSchoolPage, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatMonthKey } from "@/lib/format";
import {
  getAcademicSnapshot,
  getEnrollmentSnapshot,
  getFinancialSnapshot,
  getMonthlyTrend,
  getPaymentMethodBreakdown,
  getTopDebtors,
} from "@/lib/domain/dashboard";
import { getCurrentAcademicYear } from "@/lib/domain/school-context";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import {
  Card,
  DataTable,
  EmptyState,
  GoalCard,
  PageHeader,
  PulseBanner,
  StatCard,
  Alert,
  UsersIcon,
  WalletIcon,
  ReceiptIcon,
  ChartIcon,
  ClipboardIcon,
  AlertIcon,
  PlusIcon,
  DownloadIcon,
} from "@/components/ui";

export const metadata: Metadata = { title: "Tableau de bord" };

/**
 * Tableau de bord adaptatif.
 *
 * Les blocs affiches dependent des permissions reelles de l'utilisateur :
 * un responsable pedagogique ne voit aucun chiffre financier, un caissier ne
 * voit ni le resultat ni la tresorerie. Les donnees proviennent exclusivement
 * de la base (aucune valeur de demonstration n'est fabriquee ici).
 */
export default async function DashboardPage() {
  const context = await requireSchoolPage();
  const { school } = context;

  const canSeeFinance = hasPermission(context, PERMISSIONS.DASHBOARD_FINANCE);
  const canSeeAcademic = hasPermission(context, PERMISSIONS.DASHBOARD_ACADEMIC);
  const canSeeOwner = hasPermission(context, PERMISSIONS.DASHBOARD_OWNER);

  const academicYear = await getCurrentAcademicYear(school.id);
  const filters = { schoolId: school.id, academicYearId: academicYear?.id };

  const [enrollment, finance, academic, trend, methods, debtors] = await Promise.all([
    getEnrollmentSnapshot(filters),
    canSeeFinance ? getFinancialSnapshot(filters) : Promise.resolve(null),
    canSeeAcademic ? getAcademicSnapshot(filters) : Promise.resolve(null),
    canSeeFinance ? getMonthlyTrend(school.id, { months: 8, academicYearId: academicYear?.id }) : Promise.resolve([]),
    canSeeFinance ? getPaymentMethodBreakdown(school.id) : Promise.resolve([]),
    canSeeFinance ? getTopDebtors(school.id, { academicYearId: academicYear?.id, limit: 6 }) : Promise.resolve([]),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);

  const chips = [
    { label: `${enrollment.activeStudents} eleves inscrits` },
    { label: `${enrollment.teacherCount} enseignants` },
    ...(finance && finance.overdueMinor > 0
      ? [{ label: `${money(finance.overdueMinor)} d'echeances depassees`, tone: "alert" as const }]
      : []),
    ...(academic && academic.evaluationsAwaitingValidation > 0
      ? [{ label: `${academic.evaluationsAwaitingValidation} evaluations a valider` }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={`Bonjour ${context.user.firstName}`}
        description={
          academicYear
            ? `${school.name} — annee scolaire ${academicYear.name}${academicYear.status === "CLOSED" ? " (cloturee)" : ""}`
            : school.name
        }
      />

      <PulseBanner
        eyebrow="Situation de l'etablissement"
        chips={chips}
        updatedLabel={`Mis a jour ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
        actions={
          <>
            {hasPermission(context, PERMISSIONS.PAYMENT_CREATE) && (
              <Link href="/finance/paiements/nouveau" className="btn bg-white text-slate-900 hover:bg-slate-100">
                <ReceiptIcon className="size-4" />
                Encaisser
              </Link>
            )}
            {hasPermission(context, PERMISSIONS.STUDENT_CREATE) && (
              <Link href="/eleves/nouveau" className="btn bg-brand-500 text-white hover:bg-brand-400">
                <PlusIcon className="size-4" />
                Nouvel eleve
              </Link>
            )}
          </>
        }
      />

      {!academicYear && (
        <div className="mb-6">
          <Alert tone="warning" title="Aucune annee scolaire configuree">
            Creez une annee scolaire pour commencer a inscrire des eleves et a emettre des frais.{" "}
            <Link href="/parametres/annees" className="font-semibold underline">
              Configurer maintenant
            </Link>
          </Alert>
        </div>
      )}

      {/* ---------------------------- Indicateurs ---------------------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="sky"
          label="Effectif actif"
          value={String(enrollment.activeStudents)}
          hint={`${enrollment.byGender.female} filles et ${enrollment.byGender.male} garcons repartis sur ${enrollment.byLevel.length} niveaux.`}
          icon={<UsersIcon className="size-[18px]" />}
          href="/eleves"
        />

        {finance ? (
          <>
            <StatCard
              tone="mint"
              label="Encaissements"
              value={money(finance.collectedMinor)}
              hint={`${formatPercent(finance.collectionRateCenti, school.locale)} du montant facture a ce jour.`}
              icon={<WalletIcon className="size-[18px]" />}
              href="/finance/paiements"
            />
            <StatCard
              tone="rose"
              label="Impayes"
              value={money(finance.receivableMinor)}
              hint={
                finance.overdueMinor > 0
                  ? `Dont ${money(finance.overdueMinor)} d'echeances deja depassees.`
                  : "Aucune echeance depassee a ce jour."
              }
              icon={<AlertIcon className="size-[18px]" />}
              href="/rapports/impayes"
            />
            <StatCard
              tone="iris"
              label="Resultat"
              value={money(finance.resultMinor)}
              hint={`Produits moins charges. Tresorerie : ${money(finance.treasuryMinor)}.`}
              icon={<ChartIcon className="size-[18px]" />}
              href="/finance/comptabilite"
            />
          </>
        ) : (
          academic && (
            <>
              <StatCard
                tone="mint"
                label="Notes saisies"
                value={String(academic.gradesEntered)}
                hint={`${academic.evaluationsTotal} evaluations creees sur l'annee.`}
                icon={<ClipboardIcon className="size-[18px]" />}
                href="/pedagogie/evaluations"
              />
              <StatCard
                tone="rose"
                label="Absences du mois"
                value={String(academic.absencesThisMonth)}
                hint={`${academic.lateThisMonth} retards enregistres sur la meme periode.`}
                icon={<AlertIcon className="size-[18px]" />}
                href="/pedagogie/absences"
              />
              <StatCard
                tone="iris"
                label="Devoirs a corriger"
                value={String(academic.submissionsAwaitingGrading)}
                hint={`${academic.assignmentsOpen} devoirs actuellement publies.`}
                icon={<ClipboardIcon className="size-[18px]" />}
                href="/pedagogie/devoirs"
              />
            </>
          )
        )}
      </div>

      {/* ------------------------- Objectifs et alertes ------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card
            title="Objectifs de pilotage"
            description="Avancement mesure sur les donnees reelles de l'etablissement."
            actions={
              hasPermission(context, PERMISSIONS.REPORT_EXPORT) && (
                <Link href="/rapports" className="btn-secondary btn-sm">
                  <DownloadIcon className="size-4" />
                  Rapports
                </Link>
              )
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {finance && (
                <>
                  <GoalCard
                    title="Recouvrement des frais"
                    status={finance.collectionRateCenti >= 8500 ? "Sur la cible" : "En retard"}
                    statusTone={finance.collectionRateCenti >= 8500 ? "success" : "warning"}
                    caption={`${money(finance.collectedMinor)} encaisses sur ${money(finance.billedMinor)} factures.`}
                    targetLabel="Cible 85 %"
                    valueLabel={formatPercent(finance.collectionRateCenti, school.locale)}
                    percent={finance.collectionRateCenti / 100}
                    barTone={finance.collectionRateCenti >= 8500 ? "brand" : "amber"}
                  />
                  <GoalCard
                    title="Maitrise des impayes"
                    status={
                      finance.billedMinor > 0 && finance.receivableMinor / Math.max(finance.billedMinor, 1) > 0.15
                        ? "Risque"
                        : "Maitrise"
                    }
                    statusTone={
                      finance.billedMinor > 0 && finance.receivableMinor / Math.max(finance.billedMinor, 1) > 0.15
                        ? "danger"
                        : "success"
                    }
                    caption={`${money(finance.receivableMinor)} restent a recouvrer.`}
                    targetLabel="Cible < 15 %"
                    valueLabel={formatPercent(10_000 - finance.collectionRateCenti, school.locale)}
                    percent={(10_000 - finance.collectionRateCenti) / 100}
                    barTone="rose"
                  />
                </>
              )}

              <GoalCard
                title="Taux de remplissage"
                status={fillRate(enrollment) >= 80 ? "Satisfaisant" : "Places disponibles"}
                statusTone={fillRate(enrollment) >= 80 ? "success" : "neutral"}
                caption={`${enrollment.activeStudents} eleves pour ${totalCapacity(enrollment)} places ouvertes.`}
                targetLabel="Cible 80 %"
                valueLabel={`${fillRate(enrollment)} %`}
                percent={fillRate(enrollment)}
              />

              {academic && (
                <GoalCard
                  title="Evaluations validees"
                  status={academic.evaluationsAwaitingValidation === 0 ? "A jour" : "En attente"}
                  statusTone={academic.evaluationsAwaitingValidation === 0 ? "success" : "warning"}
                  caption={`${academic.evaluationsAwaitingValidation} evaluations attendent une validation.`}
                  targetLabel="Cible 0 en attente"
                  valueLabel={String(academic.evaluationsAwaitingValidation)}
                  percent={
                    academic.evaluationsTotal === 0
                      ? 100
                      : 100 - (academic.evaluationsAwaitingValidation / academic.evaluationsTotal) * 100
                  }
                />
              )}
            </div>
          </Card>
        </div>

        {/* ---------------------- Points d'attention ---------------------- */}
        <Card title="Points d'attention" description="Ce qui demande une action aujourd'hui.">
          <ul className="space-y-3 text-sm">
            {finance && finance.pendingProofMinor > 0 && (
              <AttentionItem
                tone="warning"
                href="/finance/justificatifs"
                title={`${money(finance.pendingProofMinor)} de justificatifs en attente`}
                detail="Ces montants ne sont PAS comptes comme encaisses tant qu'un comptable ne les a pas confirmes."
              />
            )}
            {finance && finance.overdueMinor > 0 && (
              <AttentionItem
                tone="danger"
                href="/rapports/impayes"
                title={`${money(finance.overdueMinor)} d'echeances depassees`}
                detail="Relancer les familles concernees."
              />
            )}
            {academic && academic.submissionsAwaitingGrading > 0 && (
              <AttentionItem
                tone="info"
                href="/pedagogie/devoirs"
                title={`${academic.submissionsAwaitingGrading} devoirs remis a corriger`}
                detail="Les eleves attendent leur retour."
              />
            )}
            {finance && finance.expenseCommittedMinor > 0 && (
              <AttentionItem
                tone="info"
                href="/finance/depenses"
                title={`${money(finance.expenseCommittedMinor)} de depenses approuvees non reglees`}
                detail="A prevoir dans la tresorerie."
              />
            )}

            {(!finance || (finance.pendingProofMinor === 0 && finance.overdueMinor === 0)) &&
              (!academic || academic.submissionsAwaitingGrading === 0) && (
                <li>
                  <EmptyState
                    title="Rien ne requiert votre attention"
                    description="Les justificatifs, echeances et corrections sont a jour."
                  />
                </li>
              )}
          </ul>
        </Card>
      </div>

      {/* --------------------------- Blocs financiers --------------------------- */}
      {finance && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card
              title="Evolution mensuelle"
              description="Facture, encaisse et depense sur les 8 derniers mois."
            >
              <MonthlyTrendChart
                data={trend}
                currency={school.currency}
                locale={school.locale}
              />
            </Card>
          </div>

          <Card title="Modes de reglement" description="Repartition des encaissements valides.">
            {methods.length === 0 ? (
              <EmptyState title="Aucun encaissement" description="Les reglements apparaitront ici." />
            ) : (
              <ul className="space-y-3">
                {methods.map((method) => {
                  const total = methods.reduce((sum, item) => sum + item.amountMinor, 0);
                  const share = total > 0 ? (method.amountMinor / total) * 100 : 0;
                  return (
                    <li key={method.method}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-700">
                          {PAYMENT_METHOD_LABELS[method.method] ?? method.method}
                        </span>
                        <span className="tabular text-slate-600">{money(method.amountMinor)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {method.count} operation{method.count > 1 ? "s" : ""} — {share.toFixed(0)} %
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ------------------------------ Impayes ------------------------------ */}
      {finance && debtors.length > 0 && (
        <div className="mt-6">
          <Card
            title="Principaux soldes restant dus"
            description="Eleves dont le solde est le plus eleve."
            actions={
              <Link href="/rapports/impayes" className="btn-secondary btn-sm">
                Voir tout
              </Link>
            }
            padded={false}
          >
            <DataTable
              columns={[
                { key: "student", label: "Eleve" },
                { key: "matricule", label: "Matricule" },
                { key: "class", label: "Classe" },
                { key: "balance", label: "Solde du", align: "right" },
              ]}
            >
              {debtors.map((debtor) => (
                <tr key={debtor.studentId}>
                  <td>
                    <Link
                      href={`/eleves/${debtor.studentId}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {debtor.name}
                    </Link>
                  </td>
                  <td className="font-mono text-xs text-slate-500">{debtor.matricule}</td>
                  <td>{debtor.className}</td>
                  <td className="num text-rose-700">{money(debtor.balanceMinor)}</td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </div>
      )}

      {/* --------------------------- Effectifs par niveau --------------------------- */}
      <div className="mt-6">
        <Card title="Effectifs par niveau" description="Occupation des classes ouvertes.">
          {enrollment.byLevel.length === 0 ? (
            <EmptyState
              title="Aucune classe ouverte"
              description="Creez des niveaux et des classes pour inscrire des eleves."
              action={
                <Link href="/parametres/classes" className="btn-primary btn-sm">
                  Configurer les classes
                </Link>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enrollment.byLevel.map((level) => {
                const rate = level.capacity > 0 ? (level.count / level.capacity) * 100 : 0;
                return (
                  <li key={level.levelId} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{level.levelName}</span>
                      <span className="tabular text-sm text-slate-600">
                        {level.count}
                        <span className="text-slate-400"> / {level.capacity}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={rate > 95 ? "h-full bg-rose-500" : "h-full bg-brand-500"}
                        style={{ width: `${Math.min(100, rate)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function AttentionItem({
  tone,
  title,
  detail,
  href,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  detail: string;
  href: string;
}) {
  const dot = { info: "bg-sky-500", warning: "bg-amber-500", danger: "bg-rose-500" }[tone];

  return (
    <li>
      <Link
        href={href}
        className="flex gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:bg-slate-50"
      >
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-slate-900">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Histogramme mensuel en CSS pur : lisible, imprimable et sans dependance
 * de graphiques (fonctionne meme sur connexion lente).
 */
function MonthlyTrendChart({
  data,
  currency,
  locale,
}: {
  data: { month: string; billedMinor: number; collectedMinor: number; expenseMinor: number }[];
  currency: string;
  locale: string;
}) {
  const max = Math.max(
    1,
    ...data.flatMap((point) => [point.billedMinor, point.collectedMinor, point.expenseMinor]),
  );

  if (data.every((point) => point.billedMinor === 0 && point.collectedMinor === 0)) {
    return <EmptyState title="Pas encore de mouvements" description="Les montants apparaitront des la premiere facturation." />;
  }

  return (
    <figure>
      <ul className="flex h-52 items-end justify-between gap-2" role="list">
        {data.map((point) => (
          <li key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-44 w-full items-end justify-center gap-0.5" aria-hidden>
              <div
                className="w-1/3 rounded-t bg-sky-300"
                style={{ height: `${(point.billedMinor / max) * 100}%` }}
                title={`Facture : ${formatMoney(point.billedMinor, currency, locale)}`}
              />
              <div
                className="w-1/3 rounded-t bg-brand-500"
                style={{ height: `${(point.collectedMinor / max) * 100}%` }}
                title={`Encaisse : ${formatMoney(point.collectedMinor, currency, locale)}`}
              />
              <div
                className="w-1/3 rounded-t bg-rose-300"
                style={{ height: `${(point.expenseMinor / max) * 100}%` }}
                title={`Depense : ${formatMoney(point.expenseMinor, currency, locale)}`}
              />
            </div>
            <span className="truncate text-[10px] text-slate-500">{formatMonthKey(point.month, locale)}</span>
          </li>
        ))}
      </ul>

      <figcaption className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <LegendDot className="bg-sky-300" label="Facture" />
        <LegendDot className="bg-brand-500" label="Encaisse" />
        <LegendDot className="bg-rose-300" label="Depenses payees" />
      </figcaption>

      {/* Equivalent textuel : accessibilite et impression. */}
      <table className="sr-only">
        <caption>Evolution mensuelle des montants factures, encaisses et depenses</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Facture</th>
            <th scope="col">Encaisse</th>
            <th scope="col">Depenses</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.month}>
              <th scope="row">{formatMonthKey(point.month, locale)}</th>
              <td>{formatMoney(point.billedMinor, currency, locale)}</td>
              <td>{formatMoney(point.collectedMinor, currency, locale)}</td>
              <td>{formatMoney(point.expenseMinor, currency, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function totalCapacity(enrollment: { byLevel: { capacity: number }[] }): number {
  return enrollment.byLevel.reduce((total, level) => total + level.capacity, 0);
}

function fillRate(enrollment: { activeStudents: number; byLevel: { capacity: number }[] }): number {
  const capacity = totalCapacity(enrollment);
  return capacity === 0 ? 0 : Math.round((enrollment.activeStudents / capacity) * 100);
}
