"use client";

import {
  ActionForm,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import {
  assignSubjectToUnitAction,
  createSubjectAction,
  createTeachingUnitAction,
} from "../actions";

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

/**
 * Creation d'une unite d'enseignement (UE).
 * Les credits de l'UE sont ceux acquis lorsqu'elle est validee ; ceux des
 * elements constitutifs qui la composent sont saisis sur chaque matiere.
 */
export function TeachingUnitForm({
  levels,
  tracks,
}: {
  levels: { id: string; name: string }[];
  tracks: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={createTeachingUnitAction} className="space-y-3" resetOnSuccess>
      <TextField name="name" label="Intitule" required placeholder="Algorithmique et programmation" />

      <FormGrid cols={2}>
        <TextField name="code" label="Code" required placeholder="UE-INFO-1" />
        <TextField name="credits" label="Credits" type="number" min={0} max={60} defaultValue={6} />
      </FormGrid>

      <FormGrid cols={2}>
        <TextField name="semester" label="Semestre" type="number" min={1} max={12} defaultValue={1} />
        {levels.length > 0 && (
          <SelectField
            name="levelId"
            label="Niveau"
            placeholder="Tous"
            options={levels.map((level) => ({ value: level.id, label: level.name }))}
          />
        )}
      </FormGrid>

      {tracks.length > 0 && (
        <SelectField
          name="trackId"
          label="Filiere"
          placeholder="Toutes"
          options={tracks.map((track) => ({ value: track.id, label: track.name }))}
        />
      )}

      <SubmitButton className="btn-primary btn-sm w-full">
        Creer l&apos;unite d&apos;enseignement
      </SubmitButton>
    </ActionForm>
  );
}

/** Rattachement d'une matiere existante a une unite d'enseignement. */
export function AssignSubjectToUnitForm({
  subjects,
  teachingUnits,
}: {
  subjects: { id: string; label: string }[];
  teachingUnits: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={assignSubjectToUnitAction} className="space-y-3">
      <SelectField
        name="subjectId"
        label="Matiere"
        required
        placeholder="Choisir"
        options={subjects.map((subject) => ({ value: subject.id, label: subject.label }))}
      />
      <SelectField
        name="teachingUnitId"
        label="Unite d'enseignement"
        placeholder="Detacher (aucune UE)"
        options={teachingUnits.map((unit) => ({ value: unit.id, label: unit.label }))}
      />
      <SubmitButton className="btn-secondary btn-sm w-full">Appliquer</SubmitButton>
    </ActionForm>
  );
}
