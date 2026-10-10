"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/client/form";
import { closePeriodAction, reverseEntryAction } from "../actions";

/**
 * Contrepassation d'une ecriture validee.
 * L'ecriture d'origine est conservee ; une ecriture miroir est creee et liee.
 */
export function ReverseEntryButton({ entryId, reference }: { entryId: string; reference: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        Contrepasser
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="mb-2 text-xs font-semibold text-amber-900">Contrepasser {reference}</p>
      <ActionForm action={reverseEntryAction} className="space-y-2">
        <input type="hidden" name="entryId" value={entryId} />
        <TextAreaField
          name="reason"
          label="Motif"
          required
          rows={2}
          hint="L'ecriture d'origine est conservee et marquee contrepassee."
        />
        <div className="flex gap-2">
          <SubmitButton className="btn-primary btn-sm">Confirmer</SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
            Annuler
          </button>
        </div>
      </ActionForm>
    </div>
  );
}

/** Cloture d'une periode comptable : operation irreversible. */
export function ClosePeriodButton({ periodId, name }: { periodId: string; name: string }) {
  return (
    <ActionForm action={closePeriodAction}>
      <input type="hidden" name="periodId" value={periodId} />
      <SubmitButton
        className="btn-secondary btn-sm"
        confirm={`Cloturer definitivement la periode "${name}" ? Aucune ecriture ne pourra plus y etre ajoutee.`}
      >
        Cloturer
      </SubmitButton>
    </ActionForm>
  );
}
