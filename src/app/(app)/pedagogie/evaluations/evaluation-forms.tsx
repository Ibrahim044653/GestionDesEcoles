"use client";

import {
  ActionForm,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import { EVALUATION_KINDS, EVALUATION_KIND_LABELS } from "@/lib/constants";
import { createEvaluationAction, setEvaluationStatusAction } from "../actions";

/** Creation d'une evaluation. */
export function EvaluationForm({
  classRooms,
  subjects,
  periods,
  isUniversity,
}: {
  classRooms: { id: string; name: string }[];
  subjects: { id: string; name: string; defaultCoefficient: number }[];
  periods: { id: string; name: string }[];
  isUniversity: boolean;
}) {
  return (
    <ActionForm action={createEvaluationAction} className="space-y-4" resetOnSuccess>
      <TextField name="title" label="Titre" required placeholder="Composition du 1er trimestre" />

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

      <SelectField
        name="gradingPeriodId"
        label="Periode"
        required
        placeholder="Choisir"
        options={periods.map((period) => ({ value: period.id, label: period.name }))}
        hint="Seules les periodes ouvertes sont proposees."
      />

      <FormGrid cols={2}>
        <SelectField
          name="kind"
          label="Type"
          defaultValue={EVALUATION_KINDS.DEVOIR}
          options={Object.values(EVALUATION_KINDS).map((kind) => ({
            value: kind,
            label: EVALUATION_KIND_LABELS[kind],
          }))}
        />
        <TextField name="date" label="Date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        <TextField name="maxScore" label="Bareme" type="number" min={1} max={100} defaultValue={20} required />
        <TextField name="coefficient" label="Coefficient" type="number" min={1} max={20} defaultValue={1} required />
      </FormGrid>

      {isUniversity && (
        <SelectField
          name="examSession"
          label="Session"
          defaultValue="NORMALE"
          options={[
            { value: "NORMALE", label: "Session normale" },
            { value: "RATTRAPAGE", label: "Session de rattrapage" },
          ]}
        />
      )}

      <SubmitButton className="btn-primary w-full">Creer l&apos;evaluation</SubmitButton>
    </ActionForm>
  );
}

/**
 * Transitions d'etat d'une evaluation.
 * La validation est un geste distinct de la saisie : elle releve du
 * responsable pedagogique, pas de l'enseignant qui a saisi les notes.
 */
export function EvaluationStatusButtons({
  evaluationId,
  status,
  canManage,
  canValidate,
}: {
  evaluationId: string;
  status: string;
  canManage: boolean;
  canValidate: boolean;
}) {
  if (status === "PUBLISHED") return null;

  if (status === "DRAFT" && canManage) {
    return (
      <ActionForm action={setEvaluationStatusAction} className="inline-block">
        <input type="hidden" name="evaluationId" value={evaluationId} />
        <input type="hidden" name="status" value="SUBMITTED" />
        <SubmitButton className="btn-ghost btn-sm">Soumettre</SubmitButton>
      </ActionForm>
    );
  }

  if (status === "SUBMITTED" && canValidate) {
    return (
      <ActionForm action={setEvaluationStatusAction} className="inline-block">
        <input type="hidden" name="evaluationId" value={evaluationId} />
        <input type="hidden" name="status" value="VALIDATED" />
        <SubmitButton className="btn-primary btn-sm">Valider</SubmitButton>
      </ActionForm>
    );
  }

  return null;
}
