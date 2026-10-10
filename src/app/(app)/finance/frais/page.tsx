import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { FEE_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { parseInstallmentPlan } from "@/lib/domain/fees";
import {
  getCurrentAcademicYear,
  listAcademicYears,
  listClassRooms,
  listLevels,
} from "@/lib/domain/school-context";
import {
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  StatCard,
  WalletIcon,
  PlusIcon,
} from "@/components/ui";
import { FeeItemForm } from "./fee-form";

export const metadata: Metadata = { title: "Frais scolaires" };

/**
 * Catalogue des frais : ce qui est du "en general", par annee, niveau,
 * filiere ou classe. L'affectation a un eleve cree une ligne distincte
 * (FeeAssignment), ce qui permet de modifier un tarif sans reecrire
 * l'historique de facturation.
 */
export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.FEE_VIEW);
  const params = await searchParams;
  const { school } = context;

  const currentYear = await getCurrentAcademicYear(school.id);
  const academicYearId = params.annee ?? currentYear?.id;

  const [feeItems, academicYears, levels, classRooms, assignmentStats] = await Promise.all([
    academicYearId
      ? prisma.feeItem.findMany({
          where: { schoolId: school.id, academicYearId },
          orderBy: [{ category: "asc" }, { name: "asc" }],
          include: {
            level: { select: { name: true } },
            track: { select: { name: true } },
            classRoom: { select: { name: true } },
            _count: { select: { assignments: true } },
          },
        })
      : Promise.resolve([]),
    listAcademicYears(school.id),
    listLevels(school.id),
    academicYearId ? listClassRooms(school.id, academicYearId) : Promise.resolve([]),
    academicYearId
      ? prisma.feeAssignment.aggregate({
          where: { schoolId: school.id, academicYearId, status: "ACTIVE" },
          _sum: { grossAmountMinor: true },
          _count: { _all: true },
        })
      : Promise.resolve(null),
  ]);

  const money = (amount: number) => formatMoney(amount, school.currency, school.locale);
  const canManage = hasPermission(context, PERMISSIONS.FEE_MANAGE);
  const selectedYear = academicYears.find((year) => year.id === academicYearId);

  return (
    <>
      <PageHeader
        title="Frais scolaires"
        description="Catalogue des frais applicables, avec leur echeancier type. Les frais marques « automatique » sont appliques a chaque nouvelle inscription."
      />

      {/* Selecteur d'annee */}
      {academicYears.length > 0 && (
        <form method="get" action="/finance/frais" className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="annee" className="field-label">
              Annee scolaire
            </label>
            <select id="annee" name="annee" defaultValue={academicYearId ?? ""} className="input w-56">
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isCurrent ? " (en cours)" : ""}
                  {year.status === "CLOSED" ? " — cloturee" : ""}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">
            Afficher
          </button>
        </form>
      )}

      {selectedYear?.status === "CLOSED" && (
        <div className="mb-5">
          <Alert tone="warning" title="Annee cloturee">
            Cette annee scolaire est cloturee : aucun nouveau frais ne peut y etre ajoute ni
            affecte.
          </Alert>
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          tone="sky"
          label="Frais au catalogue"
          value={String(feeItems.length)}
          hint={`${feeItems.filter((item) => item.autoAssign).length} applique(s) automatiquement.`}
          icon={<WalletIcon className="size-[18px]" />}
        />
        <StatCard
          tone="mint"
          label="Total facture (brut)"
          value={money(assignmentStats?._sum.grossAmountMinor ?? 0)}
          hint={`${assignmentStats?._count._all ?? 0} ligne(s) de frais affectee(s) a des eleves.`}
        />
        <StatCard
          tone="slate"
          label="Categories utilisees"
          value={String(new Set(feeItems.map((item) => item.category)).size)}
          hint="Inscription, scolarite, cantine, transport, etc."
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Catalogue des frais" padded={false}>
            {feeItems.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<WalletIcon className="size-8" />}
                  title="Aucun frais configure"
                  description={
                    academicYearId
                      ? "Ajoutez les frais d'inscription, de scolarite et les frais annexes pour cette annee."
                      : "Creez d'abord une annee scolaire."
                  }
                />
              </div>
            ) : (
              <DataTable
                caption="Catalogue des frais"
                columns={[
                  { key: "name", label: "Frais" },
                  { key: "scope", label: "Portee" },
                  { key: "amount", label: "Montant", align: "right" },
                  { key: "plan", label: "Echeancier" },
                  { key: "assigned", label: "Affecte", align: "right" },
                ]}
              >
                {feeItems.map((item) => {
                  const plan = parseInstallmentPlan(item.installmentPlan);
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="block font-medium text-slate-900">{item.name}</span>
                        <span className="text-xs text-slate-500">
                          {FEE_CATEGORY_LABELS[item.category] ?? item.category} —{" "}
                          <span className="font-mono">{item.code}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.isMandatory && <Badge tone="info">Obligatoire</Badge>}
                          {item.autoAssign && <Badge tone="success">Automatique</Badge>}
                          {!item.isActive && <Badge tone="neutral">Inactif</Badge>}
                        </span>
                      </td>
                      <td className="text-sm text-slate-600">
                        {item.classRoom?.name ??
                          item.level?.name ??
                          item.track?.name ?? (
                            <span className="text-slate-400">Tout l&apos;etablissement</span>
                          )}
                      </td>
                      <td className="num">{money(item.amountMinor)}</td>
                      <td className="text-xs text-slate-600">
                        {plan.length === 0 ? (
                          <span className="text-slate-400">Paiement unique</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {plan.map((entry, index) => (
                              <li key={`${item.id}-${index}`}>
                                {entry.label} —{" "}
                                {entry.amountMinor !== undefined
                                  ? money(entry.amountMinor)
                                  : `${((entry.percentCenti ?? 0) / 100).toFixed(0)} %`}{" "}
                                <span className="text-slate-400">
                                  ({formatDate(entry.dueDate, school.locale)})
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="num text-slate-600">{item._count.assignments}</td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </Card>
        </div>

        {canManage && academicYearId && selectedYear?.status !== "CLOSED" && (
          <Card title="Ajouter un frais" description="Il sera disponible pour l'annee selectionnee.">
            <FeeItemForm
              academicYearId={academicYearId}
              currencyLabel={school.currency}
              levels={levels.map((level) => ({ id: level.id, name: level.name }))}
              classRooms={classRooms.map((room) => ({ id: room.id, name: room.name }))}
            />
          </Card>
        )}
      </div>

      {!canManage && (
        <p className="mt-4 text-xs text-slate-500">
          <PlusIcon className="inline size-3" /> La modification du catalogue est reservee aux
          profils habilites (proprietaire, comptable).
        </p>
      )}
    </>
  );
}
