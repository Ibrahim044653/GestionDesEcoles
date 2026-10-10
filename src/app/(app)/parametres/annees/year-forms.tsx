"use client";

import {
  ActionForm,
  CheckboxField,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import {
  closeAcademicYearAction,
  createAcademicYearAction,
  createGradingPeriodAction,
} from "../actions";

/** Creation d'une annee scolaire. */
export function AcademicYearForm() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  // La rentree est en septembre : avant septembre, l'annee "courante" a debute l'annee civile precedente.
  const startYear = month >= 8 ? year : year - 1;

  return (
    <ActionForm action={createAcademicYearAction} className="space-y-4" resetOnSuccess>
      <TextField
        name="name"
        label="Nom de l'annee"
        required
        defaultValue={`${startYear}-${startYear + 1}`}
        hint="Convention courante : 2025-2026."
      />
      <FormGrid cols={2}>
        <TextField name="startDate" label="Debut" type="date" required defaultValue={`${startYear}-09-15`} />
        <TextField name="endDate" label="Fin" type="date" required defaultValue={`${startYear + 1}-07-10`} />
      </FormGrid>
      <CheckboxField
        name="isCurrent"
        label="Definir comme annee en cours"
        hint="Les autres annees perdront ce statut."
        defaultChecked
      />
      <SubmitButton className="btn-primary w-full">Creer l&apos;annee</SubmitButton>
    </ActionForm>
  );
}

/** Creation d'une periode d'evaluation au sein d'une annee. */
export function GradingPeriodForm({
  academicYearId,
  defaultKind,
  nextOrder,
}: {
  academicYearId: string;
  defaultKind: string;
  nextOrder: number;
}) {
  return (
    <ActionForm action={createGradingPeriodAction} className="space-y-3" resetOnSuccess>
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="sortOrder" value={nextOrder} />

      <FormGrid cols={2}>
        <TextField
          name="name"
          label="Nom"
          required
          defaultValue={`${defaultKind === "SEMESTRE" ? "Semestre" : "Trimestre"} ${nextOrder}`}
        />
        <SelectField
          name="kind"
          label="Type"
          defaultValue={defaultKind}
          options={[
            { value: "TRIMESTRE", label: "Trimestre" },
            { value: "SEMESTRE", label: "Semestre" },
            { value: "MODULE", label: "Module" },
          ]}
        />
        <TextField name="startDate" label="Debut" type="date" required />
        <TextField name="endDate" label="Fin" type="date" required />
      </FormGrid>

      <SubmitButton className="btn-primary btn-sm">Ajouter la periode</SubmitButton>
    </ActionForm>
  );
}

/** Cloture d'une annee scolaire. */
export function CloseYearButton({
  academicYearId,
  name,
}: {
  academicYearId: string;
  name: string;
}) {
  return (
    <ActionForm action={closeAcademicYearAction} className="inline-block">
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <SubmitButton
        className="btn-secondary btn-sm"
        confirm={
          `Cloturer l'annee ${name} ?\n\n` +
          "Aucune nouvelle inscription ni aucun nouveau frais ne pourra y etre ajoute. " +
          "Les donnees existantes restent consultables et exportables."
        }
      >
        Cloturer
      </SubmitButton>
    </ActionForm>
  );
}
