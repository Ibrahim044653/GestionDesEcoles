"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/client/form";
import { cancelPaymentAction } from "../actions";

/**
 * Annulation d'un encaissement.
 *
 * Volontairement en deux temps (ouvrir le motif, puis confirmer) : une action
 * irreversible ne doit pas tenir en un seul clic. L'annulation conserve le
 * paiement et contrepasse l'ecriture comptable.
 */
export function CancelPaymentButton({
  paymentId,
  reference,
}: {
  paymentId: string;
  reference: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost btn-sm text-rose-700">
        Annuler
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-left">
      <p className="mb-2 text-xs font-semibold text-rose-900">
        Annuler le reglement {reference}
      </p>
      <ActionForm action={cancelPaymentAction} className="space-y-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <TextAreaField
          name="reason"
          label="Motif de l'annulation"
          required
          rows={2}
          hint="Conserve dans le journal d'audit et visible sur le recu reimprime."
        />
        <div className="flex gap-2">
          <SubmitButton
            className="btn-danger btn-sm"
            confirm="Confirmer l'annulation ? L'ecriture comptable sera contrepassee."
          >
            Confirmer l&apos;annulation
          </SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
            Fermer
          </button>
        </div>
      </ActionForm>
    </div>
  );
}
