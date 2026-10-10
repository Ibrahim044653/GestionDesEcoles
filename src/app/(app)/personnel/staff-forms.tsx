"use client";

import { useState } from "react";
import {
  ActionForm,
  CheckboxField,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { assignTeachingAction, createStaffAction, toggleStaffAccessAction } from "./actions";

const JOB_OPTIONS = [
  { value: "ENSEIGNANT", label: "Enseignant" },
  { value: "DIRECTION", label: "Direction" },
  { value: "ADMINISTRATIF", label: "Administratif" },
  { value: "COMPTABLE", label: "Comptable" },
  { value: "CAISSIER", label: "Caissier" },
  { value: "TECHNIQUE", label: "Technique" },
];

/** Creation d'un membre du personnel, avec acces applicatif optionnel. */
export function StaffForm() {
  const [withAccount, setWithAccount] = useState(true);

  return (
    <ActionForm action={createStaffAction} className="space-y-4" resetOnSuccess>
      <FormGrid cols={2}>
        <TextField name="lastName" label="Nom" required />
        <TextField name="firstName" label="Prenom" required />
      </FormGrid>

      <FormGrid cols={2}>
        <TextField name="email" label="E-mail professionnel" type="email" />
        <TextField name="phone" label="Telephone" type="tel" />
      </FormGrid>

      <FormGrid cols={2}>
        <SelectField name="jobTitle" label="Fonction" defaultValue="ENSEIGNANT" options={JOB_OPTIONS} />
        <SelectField
          name="gender"
          label="Sexe"
          defaultValue="UNSPECIFIED"
          options={[
            { value: "UNSPECIFIED", label: "Non precise" },
            { value: "F", label: "Feminin" },
            { value: "M", label: "Masculin" },
          ]}
        />
      </FormGrid>

      <TextField name="qualification" label="Qualification" placeholder="Professeur de mathematiques" />

      <FormGrid cols={2}>
        <SelectField
          name="contractType"
          label="Type de contrat"
          defaultValue="CDI"
          options={[
            { value: "CDI", label: "CDI" },
            { value: "CDD", label: "CDD" },
            { value: "VACATAIRE", label: "Vacataire" },
            { value: "STAGE", label: "Stage" },
          ]}
        />
        <TextField name="contractStart" label="Debut du contrat" type="date" />
      </FormGrid>

      <div className="space-y-3 rounded-lg bg-slate-50 p-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            name="createAccount"
            checked={withAccount}
            onChange={(event) => setWithAccount(event.target.checked)}
            className="mt-0.5 size-4 rounded border-slate-300 text-brand-600"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">
              Creer un acces a l&apos;application
            </span>
            <span className="block text-xs text-slate-500">
              Un mot de passe provisoire sera genere ; il devra etre change a la premiere connexion.
            </span>
          </span>
        </label>

        {withAccount && (
          <SelectField
            name="roleCode"
            label="Role dans l'etablissement"
            defaultValue="TEACHER"
            options={STAFF_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
            hint="Determine les ecrans et les actions autorises."
          />
        )}
      </div>

      <SubmitButton className="btn-primary w-full">Enregistrer</SubmitButton>
    </ActionForm>
  );
}

/** Affectation classe + matiere a un enseignant. */
export function TeachingAssignmentForm({
  teachers,
  classRooms,
  subjects,
}: {
  teachers: { id: string; label: string }[];
  classRooms: { id: string; name: string }[];
  subjects: { id: string; name: string; defaultCoefficient: number }[];
}) {
  return (
    <ActionForm action={assignTeachingAction} className="space-y-3">
      <SelectField
        name="staffId"
        label="Enseignant"
        required
        placeholder="Choisir"
        options={teachers.map((teacher) => ({ value: teacher.id, label: teacher.label }))}
      />
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
      <TextField
        name="coefficient"
        label="Coefficient dans cette classe"
        type="number"
        min={1}
        max={20}
        defaultValue={1}
      />
      <SubmitButton className="btn-primary btn-sm w-full">Affecter</SubmitButton>
    </ActionForm>
  );
}

/** Activation / suspension de l'acces applicatif. */
export function StaffAccessButton({ staffId, enabled }: { staffId: string; enabled: boolean }) {
  return (
    <ActionForm action={toggleStaffAccessAction} className="inline-block">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="enable" value={enabled ? "false" : "true"} />
      <SubmitButton
        className={enabled ? "btn-ghost btn-sm text-rose-700" : "btn-secondary btn-sm"}
        confirm={
          enabled
            ? "Suspendre l'acces de cette personne ? Ses sessions en cours seront fermees immediatement."
            : undefined
        }
      >
        {enabled ? "Suspendre" : "Reactiver"}
      </SubmitButton>
    </ActionForm>
  );
}
