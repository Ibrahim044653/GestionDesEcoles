"use client";

import {
  ActionForm,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import { createSubjectAction } from "../actions";

/** Creation d'une matiere (ou d'un element constitutif dans le superieur). */
export function SubjectForm({
  isHigherEducation,
  teachingUnits,
}: {
  isHigherEducation: boolean;
  teachingUnits: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={createSubjectAction} className="space-y-3" resetOnSuccess>
      <TextField name="name" label="Libelle" required placeholder="Mathematiques" />

      <FormGrid cols={2}>
        <TextField name="code" label="Code" required placeholder="MATH" />
        <TextField
          name="defaultCoefficient"
          label="Coefficient"
          type="number"
          min={1}
          max={20}
          defaultValue={1}
          required
        />
      </FormGrid>

      {isHigherEducation && (
        <>
          <TextField
            name="credits"
            label="Credits"
            type="number"
            min={0}
            max={60}
            defaultValue={0}
            hint="Credits LMD attribues a cet element constitutif."
          />
          {teachingUnits.length > 0 && (
            <SelectField
              name="teachingUnitId"
              label="Unite d'enseignement"
              placeholder="Aucune"
              options={teachingUnits.map((unit) => ({ value: unit.id, label: unit.label }))}
            />
          )}
        </>
      )}

      <SubmitButton className="btn-primary btn-sm w-full">Creer la matiere</SubmitButton>
    </ActionForm>
  );
}
