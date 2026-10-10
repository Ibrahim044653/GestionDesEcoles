"use client";

import { useState } from "react";
import {
  ActionForm,
  FormActions,
  FormGrid,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { replyToThreadAction, startThreadAction } from "./actions";

/** Reponse a un fil existant. */
export function ReplyForm({ threadId }: { threadId: string }) {
  return (
    <ActionForm action={replyToThreadAction} resetOnSuccess className="space-y-3">
      <input type="hidden" name="threadId" value={threadId} />
      <TextAreaField
        name="body"
        label="Votre reponse"
        rows={4}
        required
        hint="Les messages ne peuvent etre ni modifies ni supprimes apres envoi."
      />
      <FormActions>
        <SubmitButton pendingLabel="Envoi…">Envoyer</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

/** Ouverture d'un nouveau fil. */
export function NewThreadForm({
  recipients,
  students,
}: {
  recipients: { id: string; label: string }[];
  students: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        Nouveau message
      </button>
    );
  }

  return (
    <ActionForm action={startThreadAction}>
      <FormGrid cols={2}>
        <SelectField
          name="participantIds"
          label="Destinataire"
          required
          options={recipients.map((recipient) => ({
            value: recipient.id,
            label: recipient.label,
          }))}
          hint="Seuls les membres de cet etablissement peuvent etre destinataires."
        />
        {students.length > 0 && (
          <SelectField
            name="studentId"
            label="Eleve concerne (facultatif)"
            options={[
              { value: "", label: "Aucun eleve en particulier" },
              ...students.map((student) => ({ value: student.id, label: student.label })),
            ]}
          />
        )}
      </FormGrid>

      <div className="mt-4 space-y-4">
        <TextField name="subject" label="Objet" required placeholder="Objet du message" />
        <TextAreaField name="body" label="Message" rows={5} required />
      </div>

      <FormActions>
        <SubmitButton pendingLabel="Envoi…">Envoyer</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Annuler
        </button>
      </FormActions>
    </ActionForm>
  );
}
