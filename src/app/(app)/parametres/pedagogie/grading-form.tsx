"use client";

import {
  ActionForm,
  CheckboxField,
  FormActions,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import type { GradingSettings } from "@/lib/domain/grades";
import { updateGradingSettingsAction } from "../actions";

/** Reglages de notation de l'etablissement. */
export function GradingSettingsForm({ settings }: { settings: GradingSettings }) {
  return (
    <ActionForm action={updateGradingSettingsAction} onSuccessMessage="Reglages enregistres.">
      <FormGrid cols={2}>
        <TextField
          name="maxScore"
          label="Bareme de reference"
          type="number"
          min={1}
          max={100}
          defaultValue={settings.maxScore}
          required
          hint="Toutes les notes sont ramenees a ce bareme pour les moyennes."
        />
        <TextField
          name="passMark"
          label="Moyenne de passage"
          inputMode="decimal"
          defaultValue={(settings.passMarkCenti / 100).toFixed(2).replace(".", ",")}
          hint="Seuil de validation d'une matiere ou d'un credit."
        />
      </FormGrid>

      <div className="mt-6">
        <SelectField
          name="absenceRule"
          label="Traitement des absences non excusees"
          defaultValue={settings.absenceRule}
          options={[
            { value: "EXCLURE", label: "Exclure du calcul (ne penalise pas l'eleve)" },
            { value: "ZERO", label: "Compter zero (penalise l'eleve)" },
          ]}
          hint="Determine si une absence a une evaluation pese sur la moyenne."
        />
      </div>

      <div className="mt-6 space-y-3 rounded-lg bg-slate-50 p-4">
        <CheckboxField
          name="excusedAlwaysExcluded"
          label="Une absence excusee est toujours exclue du calcul"
          hint="Recommande : une absence justifiee ne doit pas penaliser l'eleve, quelle que soit la regle generale."
          defaultChecked={settings.excusedAlwaysExcluded}
        />
        <CheckboxField
          name="rankingEnabled"
          label="Afficher le classement sur les bulletins"
          hint="Certains etablissements ou reglementations interdisent le classement. Les ex aequo sont geres (1, 2, 2, 4)."
          defaultChecked={settings.rankingEnabled}
        />
      </div>

      <div className="mt-6">
        <SelectField
          name="resitRule"
          label="Session de rattrapage"
          defaultValue={settings.resitRule}
          options={[
            { value: "MEILLEURE", label: "Retenir la meilleure des deux sessions" },
            { value: "REMPLACE", label: "Le rattrapage remplace toujours la session normale" },
            { value: "IGNORER", label: "Ne pas tenir compte du rattrapage" },
          ]}
          hint="La substitution porte sur la moyenne de la matiere, pas sur une note isolee. Les deux sessions restent consultables."
        />
      </div>

      <div className="mt-4">
        <TextField
          name="resitCap"
          label="Plafond de la note de rattrapage (facultatif)"
          inputMode="decimal"
          defaultValue={
            settings.resitCapCenti === null
              ? ""
              : (settings.resitCapCenti / 100).toFixed(2).replace(".", ",")
          }
          hint="Laisser vide pour ne pas plafonner. Un plafond ne ramene jamais un eleve sous sa note de session normale."
        />
      </div>

      <FormActions>
        <SubmitButton>Enregistrer les regles</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
