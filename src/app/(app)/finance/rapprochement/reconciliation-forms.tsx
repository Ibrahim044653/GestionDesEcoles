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
import { closeReconciliationAction, createReconciliationAction } from "./actions";

/** Ouverture d'un rapprochement sur une periode. */
export function NewReconciliationForm({
  accounts,
  currencyLabel,
  defaultStart,
  defaultEnd,
}: {
  accounts: { id: string; label: string }[];
  currencyLabel: string;
  defaultStart: string;
  defaultEnd: string;
}) {
  return (
    <ActionForm action={createReconciliationAction}>
      <FormGrid cols={2}>
        <SelectField
          name="financialAccountId"
          label="Compte financier"
          required
          options={accounts.map((account) => ({ value: account.id, label: account.label }))}
        />
        <TextField
          name="statementBalance"
          label={`Solde du releve (${currencyLabel})`}
          required
          inputMode="decimal"
          hint="Solde final figurant sur le releve bancaire. Un decouvert se saisit avec un signe moins."
        />
        <TextField name="periodStart" label="Debut de periode" type="date" required defaultValue={defaultStart} />
        <TextField name="periodEnd" label="Fin de periode" type="date" required defaultValue={defaultEnd} />
      </FormGrid>

      <div className="mt-4">
        <TextAreaField
          name="notes"
          label="Observations"
          rows={2}
          hint="Cheques en circulation, virements non credites, frais bancaires…"
        />
      </div>

      <FormActions>
        <SubmitButton pendingLabel="Calcul…">Ouvrir le rapprochement</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

/** Cloture d'un rapprochement : l'explication est exigee si l'ecart n'est pas nul. */
export function CloseReconciliationForm({
  reconciliationId,
  hasDifference,
  currentNotes,
}: {
  reconciliationId: string;
  hasDifference: boolean;
  currentNotes: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        Cloturer
      </button>
    );
  }

  return (
    <ActionForm action={closeReconciliationAction} className="space-y-2">
      <input type="hidden" name="reconciliationId" value={reconciliationId} />
      <TextAreaField
        name="notes"
        label={hasDifference ? "Explication de l'ecart" : "Observations"}
        rows={3}
        required={hasDifference}
        defaultValue={currentNotes}
        hint={
          hasDifference
            ? "Obligatoire : un ecart cloture sans explication est un ecart efface."
            : "Facultatif, le releve correspond a la comptabilite."
        }
      />
      <div className="flex gap-2">
        <SubmitButton className="btn-primary btn-sm" pendingLabel="…">
          Confirmer la cloture
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
          Annuler
        </button>
      </div>
    </ActionForm>
  );
}
