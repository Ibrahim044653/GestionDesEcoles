import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { FEE_CATEGORIES, FEE_CATEGORY_LABELS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { getCurrentAcademicYear } from "@/lib/domain/school-context";
import { parseFinanceSettings } from "@/lib/domain/finance-settings";
import { computeLateFees, computeSiblingDiscounts } from "@/lib/domain/fee-automation";
import { Alert, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import {
  ApplyLateFeesForm,
  ApplySiblingDiscountsForm,
  FinanceAutomationSettingsForm,
} from "./automation-forms";

export const metadata: Metadata = { title: "Automatisations financieres" };

/**
 * Penalites de retard et remise fratrie.
 *
 * L'ecran montre TOUJOURS l'apercu avant l'application : le responsable voit
 * exactement quelles familles sont concernees et pour quels montants avant de
 * valider. Aucun traitement de fond n'applique quoi que ce soit tout seul.
 */
export default async function FinanceAutomationPage() {
  const context = await requirePagePermission(PERMISSIONS.FEE_MANAGE);
  const { school } = context;

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);

  const [schoolRow, academicYear] = await Promise.all([
    prisma.school.findUniqueOrThrow({
      where: { id: school.id },
      select: { accountingSettings: true },
    }),
    getCurrentAcademicYear(school.id),
  ]);

  const settings = parseFinanceSettings(schoolRow.accountingSettings);
  const canConfigure = hasPermission(context, PERMISSIONS.SCHOOL_CONFIGURE_FINANCE);
  const canGrantDiscount = hasPermission(context, PERMISSIONS.DISCOUNT_GRANT);

  const [lateFees, siblingDiscounts] = academicYear
    ? await Promise.all([
        computeLateFees({ schoolId: school.id, academicYearId: academicYear.id }),
        computeSiblingDiscounts({ schoolId: school.id, academicYearId: academicYear.id }),
      ])
    : [
        { lines: [], totalNewMinor: 0, enabled: false },
        { lines: [], enabled: false },
      ];

  const siblingToGrant = siblingDiscounts.lines.filter((line) => !line.alreadyGranted);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Finances", href: "/finance/frais" },
          { label: "Automatisations" },
        ]}
        title="Penalites et remises automatiques"
        description="Regles de l'etablissement, apercu des effets, puis application explicite."
      />

      {!academicYear ? (
        <Card>
          <EmptyState
            title="Aucune annee scolaire en cours"
            description="Definissez l'annee scolaire courante avant de calculer penalites et remises."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5">
            <Alert tone="warning" title="Rien ne s'applique tout seul">
              Enregistrer une regle ne modifie aucun compte. Les penalites et les remises ne sont
              ecrites qu&apos;au declenchement du traitement ci-dessous, et l&apos;operation est
              tracee au journal d&apos;audit.
            </Alert>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              tone={settings.lateFee.enabled ? "sky" : "slate"}
              label="Penalites de retard"
              value={settings.lateFee.enabled ? "Activees" : "Desactivees"}
              hint={
                settings.lateFee.enabled
                  ? `Tolerance de ${settings.lateFee.graceDays} jour(s).`
                  : "Aucune penalite n'est calculee."
              }
            />
            <StatCard
              tone={lateFees.lines.length > 0 ? "rose" : "mint"}
              label="Echeances a mettre a jour"
              value={String(lateFees.lines.length)}
              hint={
                lateFees.lines.length > 0
                  ? `Variation : ${money(lateFees.totalNewMinor)}`
                  : "Les penalites sont a jour."
              }
            />
            <StatCard
              tone={siblingToGrant.length > 0 ? "iris" : "mint"}
              label="Remises fratrie a accorder"
              value={String(siblingToGrant.length)}
              hint={
                settings.siblingDiscount.enabled
                  ? `${siblingDiscounts.lines.length - siblingToGrant.length} deja accordee(s).`
                  : "Remise fratrie desactivee."
              }
            />
          </div>

          {canConfigure && (
            <Card
              title="Regles de l'etablissement"
              description="Ces reglages decrivent ce que l'etablissement a decide, pas ce qui est deja applique."
              className="mb-5"
            >
              <FinanceAutomationSettingsForm
                settings={settings}
                currencyLabel={school.currency}
                categories={Object.values(FEE_CATEGORIES).map((value) => ({
                  value,
                  label: FEE_CATEGORY_LABELS[value] ?? value,
                }))}
              />
            </Card>
          )}

          <Card
            title="Penalites de retard"
            description={`Annee ${academicYear.name}. La penalite est recalculee, jamais cumulee : rejouer le traitement ne la double pas.`}
            padded={false}
            className="mb-5"
            actions={
              <ApplyLateFeesForm
                academicYearId={academicYear.id}
                pendingCount={lateFees.lines.length}
              />
            }
          >
            {!lateFees.enabled ? (
              <div className="p-5 text-sm text-slate-600">
                Les penalites de retard sont desactivees pour cet etablissement.
              </div>
            ) : lateFees.lines.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Rien a appliquer"
                  description="Aucune echeance ne necessite de mise a jour de penalite."
                />
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Eleve</th>
                      <th>Echeance</th>
                      <th>Date limite</th>
                      <th className="text-right">Montant</th>
                      <th className="text-right">Deja paye</th>
                      <th className="text-right">Penalite actuelle</th>
                      <th className="text-right">Penalite calculee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateFees.lines.slice(0, 200).map((line) => (
                      <tr key={line.installmentId}>
                        <td>
                          <span className="block text-sm text-slate-900">{line.studentName}</span>
                          <span className="font-mono text-xs text-slate-400">{line.matricule}</span>
                        </td>
                        <td className="text-sm text-slate-600">{line.label}</td>
                        <td className="text-sm text-slate-600">
                          {formatDate(line.dueDate, school.locale)}
                        </td>
                        <td className="num">{money(line.amountMinor)}</td>
                        <td className="num">{money(line.paidMinor)}</td>
                        <td className="num text-slate-500">{money(line.currentPenaltyMinor)}</td>
                        <td className="num font-semibold text-rose-700">
                          {money(line.newPenaltyMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lateFees.lines.length > 200 && (
                  <p className="px-5 py-3 text-xs text-slate-500">
                    {lateFees.lines.length - 200} ligne(s) supplementaires non affichees. Toutes
                    seront traitees a l&apos;application.
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card
            title="Remise fratrie"
            description="Une remise fratrie deja presente sur un frais n'est jamais ecrasee."
            padded={false}
            actions={
              canGrantDiscount ? (
                <ApplySiblingDiscountsForm
                  academicYearId={academicYear.id}
                  pendingCount={siblingToGrant.length}
                />
              ) : undefined
            }
          >
            {!siblingDiscounts.enabled ? (
              <div className="p-5 text-sm text-slate-600">
                La remise fratrie est desactivee pour cet etablissement.
              </div>
            ) : siblingDiscounts.lines.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aucune famille concernee"
                  description="Aucun eleve n'atteint un palier de remise fratrie."
                />
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Eleve</th>
                      <th>Frais</th>
                      <th className="text-right">Montant brut</th>
                      <th className="text-right">Enfants</th>
                      <th className="text-right">Remise</th>
                      <th>Etat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siblingDiscounts.lines.slice(0, 200).map((line) => (
                      <tr key={line.feeAssignmentId}>
                        <td>
                          <span className="block text-sm text-slate-900">{line.studentName}</span>
                          <span className="font-mono text-xs text-slate-400">{line.matricule}</span>
                        </td>
                        <td className="text-sm text-slate-600">{line.label}</td>
                        <td className="num">{money(line.grossAmountMinor)}</td>
                        <td className="num">{line.childCount}</td>
                        <td className="num">{(line.percentCenti / 100).toFixed(2)} %</td>
                        <td className="text-sm">
                          {line.alreadyGranted ? (
                            <span className="text-slate-500">Deja accordee</span>
                          ) : (
                            <span className="font-medium text-iris-700">A accorder</span>
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
      )}
    </>
  );
}
