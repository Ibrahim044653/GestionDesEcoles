"use client";

import { ActionForm, SubmitButton } from "@/components/client/form";
import { markAllReadAction } from "./actions";

/** Marque toutes les notifications de l'utilisateur comme lues. */
export function MarkAllReadButton() {
  return (
    <ActionForm action={markAllReadAction}>
      <SubmitButton className="btn-secondary" pendingLabel="Mise a jour…">
        Tout marquer comme lu
      </SubmitButton>
    </ActionForm>
  );
}
