"use client";

import {
  ActionForm,
  FormActions,
  FormGrid,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { requestAppointmentAction, requestDocumentAction } from "../actions";

type Child = { id: string; name: string };

/** Demande d'un document officiel aupres de l'etablissement. */
export function DocumentRequestForm({ students }: { students: Child[] }) {
  return (
    <ActionForm action={requestDocumentAction} resetOnSuccess>
      <FormGrid cols={2}>
        <SelectField
          name="studentId"
          label="Enfant concerne"
          required
          options={students.map((child) => ({ value: child.id, label: child.name }))}
        />
        <SelectField
          name="kind"
          label="Document demande"
          required
          options={[
            { value: "CERTIFICAT_SCOLARITE", label: "Certificat de scolarite" },
            { value: "BULLETIN", label: "Bulletin" },
            { value: "RELEVE", label: "Releve de compte" },
            { value: "CARTE", label: "Carte scolaire" },
            { value: "ATTESTATION", label: "Attestation" },
            { value: "AUTRE", label: "Autre document" },
          ]}
        />
      </FormGrid>

      <div className="mt-4">
        <TextAreaField
          name="note"
          label="Precisions"
          rows={2}
          hint="Periode concernee, nombre d'exemplaires, usage prevu…"
        />
      </div>

      <FormActions>
        <SubmitButton pendingLabel="Envoi…">Envoyer la demande</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

/** Demande de rendez-vous avec l'etablissement. */
export function AppointmentRequestForm({ students }: { students: Child[] }) {
  return (
    <ActionForm action={requestAppointmentAction} resetOnSuccess>
      <FormGrid cols={2}>
        <SelectField
          name="studentId"
          label="Enfant concerne"
          required
          options={students.map((child) => ({ value: child.id, label: child.name }))}
        />
        <TextField
          name="preferredAt"
          label="Creneau souhaite"
          type="datetime-local"
          hint="Indicatif : l'etablissement confirmera une date."
        />
      </FormGrid>

      <div className="mt-4 space-y-4">
        <TextField
          name="subject"
          label="Objet du rendez-vous"
          required
          placeholder="Ex. : suivi des resultats du 2e trimestre"
        />
        <TextAreaField name="message" label="Message" rows={3} />
      </div>

      <FormActions>
        <SubmitButton pendingLabel="Envoi…">Demander un rendez-vous</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
