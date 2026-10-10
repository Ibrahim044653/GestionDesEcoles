"use client";

import {
  ActionForm,
  FileField,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { submitProofAction } from "../actions";

/**
 * Depot d'un justificatif de paiement par une famille.
 *
 * Le libelle est explicite sur la portee du geste : il s'agit d'une
 * DECLARATION, pas d'un encaissement. Le message de confirmation le repete.
 */
export function ProofSubmitForm({
  students,
  currencyLabel,
  maxUploadMb,
}: {
  students: { id: string; label: string }[];
  currencyLabel: string;
  maxUploadMb: number;
}) {
  return (
    <ActionForm action={submitProofAction} className="space-y-4" resetOnSuccess>
      <SelectField
        name="studentId"
        label="Enfant concerne"
        required
        defaultValue={students.length === 1 ? students[0].id : undefined}
        placeholder={students.length === 1 ? undefined : "Choisir"}
        options={students.map((student) => ({ value: student.id, label: student.label }))}
      />

      <TextField
        name="declaredAmount"
        label={`Montant verse (${currencyLabel})`}
        required
        inputMode="decimal"
        hint="Indiquez le montant exact figurant sur votre justificatif."
      />

      <SelectField
        name="declaredMethod"
        label="Mode de reglement"
        required
        defaultValue={PAYMENT_METHODS.MOBILE_MONEY}
        options={Object.values(PAYMENT_METHODS)
          .filter((method) => method !== "EN_LIGNE")
          .map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
      />

      <FormGrid cols={2}>
        <TextField
          name="declaredReference"
          label="Reference"
          hint="Numero de transaction, de cheque ou d'avis."
        />
        <TextField
          name="declaredPaidAt"
          label="Date du versement"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </FormGrid>

      <FileField
        name="file"
        label="Justificatif"
        required
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint={`Photo ou PDF du recu, maximum ${maxUploadMb} Mo. Formats acceptes : JPEG, PNG, WebP, PDF.`}
      />

      <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
        Votre depot sera <strong>verifie</strong> par la comptabilite avant d&apos;etre pris en
        compte. Tant qu&apos;il est en attente, le montant n&apos;est pas deduit de votre solde.
        Vous serez notifie de la decision.
      </div>

      <SubmitButton className="btn-primary w-full" pendingLabel="Envoi en cours…">
        Transmettre le justificatif
      </SubmitButton>
    </ActionForm>
  );
}
