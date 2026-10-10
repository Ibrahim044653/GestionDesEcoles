"use client";

import { useState } from "react";
import {
  ActionForm,
  CheckboxField,
  FormActions,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import type { FinanceSettings } from "@/lib/domain/finance-settings";
import {
  applyLateFeesAction,
  applySiblingDiscountsAction,
  updateFinanceAutomationSettingsAction,
} from "./actions";

/** Affichage d'un taux en centiemes de pourcent : 250 -> "2,5". */
function percentValue(centi: number): string {
  if (centi === 0) return "";
  return String(centi / 100).replace(".", ",");
}

export function FinanceAutomationSettingsForm({
  settings,
  currencyLabel,
  categories,
}: {
  settings: FinanceSettings;
  currencyLabel: string;
  categories: { value: string; label: string }[];
}) {
  const [mode, setMode] = useState(settings.lateFee.mode);

  const tier = (minChildren: number) =>
    percentValue(
      settings.siblingDiscount.tiers.find((item) => item.minChildren === minChildren)
        ?.percentCenti ?? 0,
    );

  return (
    <ActionForm action={updateFinanceAutomationSettingsAction}>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Penalites de retard</legend>

        <CheckboxField
          name="lateFeeEnabled"
          label="Activer les penalites de retard"
          hint="Desactivees, aucune penalite n'est jamais calculee ni appliquee."
          defaultChecked={settings.lateFee.enabled}
        />

        <FormGrid cols={2}>
          <div>
            <label htmlFor="lateFeeMode" className="field-label">
              Mode de calcul
            </label>
            <select
              id="lateFeeMode"
              name="lateFeeMode"
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
              className="input"
            >
              <option value="FIXE">Montant fixe</option>
              <option value="POURCENTAGE">Pourcentage du reste du (une fois)</option>
              <option value="POURCENTAGE_PAR_JOUR">Pourcentage du reste du par jour</option>
            </select>
            <p className="field-hint">La penalite porte sur le reste du, pas sur le montant initial.</p>
          </div>

          <TextField
            name="lateFeeGraceDays"
            label="Jours de tolerance"
            type="number"
            min={0}
            max={365}
            defaultValue={settings.lateFee.graceDays}
            hint="Aucune penalite avant ce delai apres l'echeance."
          />

          {mode === "FIXE" ? (
            <TextField
              name="lateFeeFixed"
              label={`Montant de la penalite (${currencyLabel})`}
              inputMode="decimal"
              defaultValue={settings.lateFee.fixedMinor ? String(settings.lateFee.fixedMinor) : ""}
            />
          ) : (
            <TextField
              name="lateFeePercent"
              label={mode === "POURCENTAGE_PAR_JOUR" ? "Taux par jour (%)" : "Taux (%)"}
              inputMode="decimal"
              defaultValue={percentValue(settings.lateFee.percentCenti)}
            />
          )}

          <TextField
            name="lateFeeCap"
            label="Plafond (% du montant de l'echeance)"
            inputMode="decimal"
            defaultValue={
              settings.lateFee.capPercentCenti === null
                ? ""
                : percentValue(settings.lateFee.capPercentCenti)
            }
            hint="Laisser vide pour ne pas plafonner. Fortement recommande en mode « par jour »."
          />
        </FormGrid>

        {/* Les champs masques par le mode restent soumis a leur valeur actuelle,
            pour ne pas effacer un reglage que l'ecran n'affiche pas. */}
        {mode === "FIXE" ? (
          <input
            type="hidden"
            name="lateFeePercent"
            value={percentValue(settings.lateFee.percentCenti)}
          />
        ) : (
          <input
            type="hidden"
            name="lateFeeFixed"
            value={settings.lateFee.fixedMinor ? String(settings.lateFee.fixedMinor) : ""}
          />
        )}
      </fieldset>

      <fieldset className="mt-8 space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Remise fratrie</legend>

        <CheckboxField
          name="siblingEnabled"
          label="Activer la remise fratrie"
          hint="La remise est accordee au declenchement du traitement, jamais a l'insu de l'etablissement."
          defaultChecked={settings.siblingDiscount.enabled}
        />

        <FormGrid cols={3}>
          <TextField
            name="siblingTier2"
            label="A partir de 2 enfants (%)"
            inputMode="decimal"
            defaultValue={tier(2)}
          />
          <TextField
            name="siblingTier3"
            label="A partir de 3 enfants (%)"
            inputMode="decimal"
            defaultValue={tier(3)}
          />
          <TextField
            name="siblingTier4"
            label="A partir de 4 enfants (%)"
            inputMode="decimal"
            defaultValue={tier(4)}
          />
        </FormGrid>

        <div>
          <span className="field-label">Categories de frais concernees</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {categories.map((category) => (
              <label key={category.value} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="siblingCategories"
                  value={category.value}
                  defaultChecked={settings.siblingDiscount.categories.includes(category.value)}
                  className="size-4 rounded border-slate-300"
                />
                {category.label}
              </label>
            ))}
          </div>
          <p className="field-hint">Aucune case cochee : toutes les categories sont concernees.</p>
        </div>
      </fieldset>

      <FormActions>
        <SubmitButton>Enregistrer les regles</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

/** Declenchement du calcul des penalites. */
export function ApplyLateFeesForm({
  academicYearId,
  pendingCount,
}: {
  academicYearId: string;
  pendingCount: number;
}) {
  return (
    <ActionForm action={applyLateFeesAction}>
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <SubmitButton
        disabled={pendingCount === 0}
        confirm={`Appliquer les penalites sur ${pendingCount} echeance(s) ? Les familles verront la penalite sur leur compte.`}
        pendingLabel="Application…"
      >
        {pendingCount === 0
          ? "Rien a appliquer"
          : `Appliquer sur ${pendingCount} echeance(s)`}
      </SubmitButton>
    </ActionForm>
  );
}

/** Declenchement de l'attribution des remises fratrie. */
export function ApplySiblingDiscountsForm({
  academicYearId,
  pendingCount,
}: {
  academicYearId: string;
  pendingCount: number;
}) {
  return (
    <ActionForm action={applySiblingDiscountsAction}>
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <SubmitButton
        disabled={pendingCount === 0}
        confirm={`Accorder ${pendingCount} remise(s) fratrie ?`}
        pendingLabel="Application…"
      >
        {pendingCount === 0 ? "Rien a accorder" : `Accorder ${pendingCount} remise(s)`}
      </SubmitButton>
    </ActionForm>
  );
}
