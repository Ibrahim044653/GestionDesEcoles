"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client/form";
import { updateSubscriptionStatusAction } from "./actions";

const STATUS_OPTIONS = [
  { value: "TRIAL", label: "Essai" },
  { value: "ACTIVE", label: "Actif" },
  { value: "PAST_DUE", label: "Impaye" },
  { value: "SUSPENDED", label: "Suspendu" },
  { value: "CANCELLED", label: "Resilie" },
];

/**
 * Changement d'etat d'un abonnement.
 * Les transitions restrictives (suspension, resiliation) sont confirmees
 * explicitement, avec rappel que les donnees ne sont pas supprimees.
 */
export function SubscriptionStatusForm({
  subscriptionId,
  currentStatus,
}: {
  subscriptionId: string;
  currentStatus: string;
}) {
  const [status, setStatus] = useState(currentStatus);

  const confirmMessage =
    status === "SUSPENDED"
      ? "Suspendre cet abonnement ?\n\nL'acces applicatif sera bloque pour tous les utilisateurs de l'organisation. AUCUNE donnee ne sera supprimee."
      : status === "CANCELLED"
        ? "Resilier cet abonnement ?\n\nL'acces sera bloque. Les donnees sont conservees : proposez un export complet au client."
        : undefined;

  return (
    <ActionForm action={updateSubscriptionStatusAction} className="flex items-end gap-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />

      <div>
        <label htmlFor={`status-${subscriptionId}`} className="sr-only">
          Statut de l&apos;abonnement
        </label>
        <select
          id={`status-${subscriptionId}`}
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="input py-1 text-xs"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton
        className="btn-secondary btn-sm"
        disabled={status === currentStatus}
        confirm={confirmMessage}
      >
        Appliquer
      </SubmitButton>
    </ActionForm>
  );
}
