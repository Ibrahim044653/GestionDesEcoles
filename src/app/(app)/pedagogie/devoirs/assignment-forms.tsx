"use client";

import { useState } from "react";
import {
  ActionForm,
  CheckboxField,
  FormGrid,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { createAssignmentAction, gradeSubmissionAction } from "../actions";

/** Creation d'un devoir, publiable immediatement. */
export function AssignmentForm({
  classRooms,
  subjects,
}: {
  classRooms: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
}) {
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <ActionForm action={createAssignmentAction} className="space-y-4" resetOnSuccess>
      <TextField name="title" label="Titre" required placeholder="Exercices du chapitre 3" />

      <FormGrid cols={2}>
        <SelectField
          name="classRoomId"
          label="Classe"
          required
          placeholder="Choisir"
          options={classRooms.map((room) => ({ value: room.id, label: room.name }))}
        />
        <SelectField
          name="subjectId"
          label="Matiere"
          required
          placeholder="Choisir"
          options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
        />
      </FormGrid>

      <TextAreaField
        name="description"
        label="Consignes"
        rows={3}
        hint="Visible par les eleves et leurs parents une fois le devoir publie."
      />

      <FormGrid cols={2}>
        <TextField name="dueAt" label="A rendre avant le" type="date" required defaultValue={inAWeek} />
        <TextField name="maxScore" label="Bareme" type="number" min={1} max={100} defaultValue={20} />
      </FormGrid>

      <CheckboxField
        name="publish"
        label="Publier immediatement"
        hint="Les eleves de la classe verront le devoir et pourront deposer leur travail."
        defaultChecked
      />

      <SubmitButton className="btn-primary w-full">Creer le devoir</SubmitButton>
    </ActionForm>
  );
}

/** Notation d'une remise, repliee par defaut pour ne pas alourdir la liste. */
export function GradeSubmissionForm({
  submissionId,
  maxScore,
  currentScoreCenti,
  currentFeedback,
}: {
  submissionId: string;
  maxScore: number;
  currentScoreCenti: number | null;
  currentFeedback: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        {currentScoreCenti === null ? "Corriger" : "Modifier la correction"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <ActionForm action={gradeSubmissionAction} className="space-y-3">
        <input type="hidden" name="submissionId" value={submissionId} />

        <FormGrid cols={2}>
          <TextField
            name="score"
            label={`Note (sur ${maxScore})`}
            inputMode="decimal"
            defaultValue={
              currentScoreCenti === null ? "" : (currentScoreCenti / 100).toFixed(2).replace(".", ",")
            }
          />
        </FormGrid>

        <TextAreaField
          name="feedback"
          label="Commentaire a l'eleve"
          rows={2}
          defaultValue={currentFeedback}
        />

        <div className="flex gap-2">
          <SubmitButton className="btn-primary btn-sm">Enregistrer</SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
            Fermer
          </button>
        </div>
      </ActionForm>
    </div>
  );
}
