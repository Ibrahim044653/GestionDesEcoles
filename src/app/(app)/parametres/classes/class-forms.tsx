"use client";

import {
  ActionForm,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import { createClassRoomAction, createLevelAction } from "../actions";

/** Creation d'un niveau de cursus. */
export function LevelForm({ nextOrder }: { nextOrder: number }) {
  return (
    <ActionForm action={createLevelAction} className="space-y-3" resetOnSuccess>
      <FormGrid cols={2}>
        <TextField name="code" label="Code" required placeholder="6EME" />
        <TextField name="sortOrder" label="Ordre" type="number" min={0} defaultValue={nextOrder} />
      </FormGrid>
      <TextField name="name" label="Libelle" required placeholder="Sixieme" />
      <SubmitButton className="btn-primary btn-sm w-full">Creer le niveau</SubmitButton>
    </ActionForm>
  );
}

/** Creation d'une classe pour une annee donnee. */
export function ClassRoomForm({
  levels,
  tracks,
  academicYears,
  teachers,
}: {
  levels: { id: string; name: string }[];
  tracks: { id: string; name: string }[];
  academicYears: { id: string; name: string; isCurrent: boolean }[];
  teachers: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={createClassRoomAction} className="space-y-3" resetOnSuccess>
      <SelectField
        name="academicYearId"
        label="Annee scolaire"
        required
        defaultValue={academicYears.find((year) => year.isCurrent)?.id}
        options={academicYears.map((year) => ({
          value: year.id,
          label: `${year.name}${year.isCurrent ? " (en cours)" : ""}`,
        }))}
      />

      <SelectField
        name="levelId"
        label="Niveau"
        required
        placeholder="Choisir"
        options={levels.map((level) => ({ value: level.id, label: level.name }))}
      />

      <FormGrid cols={2}>
        <TextField name="name" label="Nom de la classe" required placeholder="6EME-A" />
        <TextField name="code" label="Code" required placeholder="6EME-A" hint="Utilise a l'import CSV." />
      </FormGrid>

      <FormGrid cols={2}>
        <TextField name="capacity" label="Capacite" type="number" min={1} max={500} defaultValue={35} required />
        <TextField name="roomLabel" label="Salle" placeholder="Salle 12" />
      </FormGrid>

      {tracks.length > 0 && (
        <SelectField
          name="trackId"
          label="Filiere"
          placeholder="Aucune"
          options={tracks.map((track) => ({ value: track.id, label: track.name }))}
        />
      )}

      {teachers.length > 0 && (
        <SelectField
          name="mainTeacherId"
          label="Professeur principal"
          placeholder="A designer plus tard"
          options={teachers.map((teacher) => ({ value: teacher.id, label: teacher.label }))}
        />
      )}

      <SubmitButton className="btn-primary btn-sm w-full">Creer la classe</SubmitButton>
    </ActionForm>
  );
}
