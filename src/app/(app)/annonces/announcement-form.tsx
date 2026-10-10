"use client";

import {
  ActionForm,
  CheckboxField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { createAnnouncementAction } from "./actions";

/** Redaction et publication d'une annonce. */
export function AnnouncementForm({ classRooms }: { classRooms: { id: string; name: string }[] }) {
  return (
    <ActionForm action={createAnnouncementAction} className="space-y-4" resetOnSuccess>
      <TextField name="title" label="Titre" required placeholder="Reunion parents-professeurs" />

      <TextAreaField
        name="body"
        label="Contenu"
        required
        rows={5}
        hint="Soyez factuel et precis : date, lieu, action attendue."
      />

      <fieldset>
        <legend className="field-label">Destinataires</legend>
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <CheckboxField
            name={`audience_${ROLES.GUARDIAN}`}
            label={ROLE_LABELS[ROLES.GUARDIAN]}
            defaultChecked
          />
          <CheckboxField name={`audience_${ROLES.STUDENT}`} label={ROLE_LABELS[ROLES.STUDENT]} />
          <CheckboxField name={`audience_${ROLES.TEACHER}`} label={ROLE_LABELS[ROLES.TEACHER]} />
        </div>
      </fieldset>

      {classRooms.length > 0 && (
        <SelectField
          name="classRoomId"
          label="Limiter a une classe"
          placeholder="Tout l'etablissement"
          options={classRooms.map((room) => ({ value: room.id, label: room.name }))}
        />
      )}

      <TextField
        name="expiresAt"
        label="Date d'expiration"
        type="date"
        hint="Facultatif : au-dela, l'annonce n'apparait plus aux familles."
      />

      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <CheckboxField name="isPinned" label="Epingler en tete de liste" />
        <CheckboxField
          name="notify"
          label="Envoyer une notification dans l'application"
          defaultChecked
        />
      </div>

      <SubmitButton className="btn-primary w-full">Publier l&apos;annonce</SubmitButton>
    </ActionForm>
  );
}
