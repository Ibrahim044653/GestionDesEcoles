"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/client/form";
import { updateAppointmentRequestAction, updateDocumentRequestAction } from "./actions";

/**
 * Formulaires de traitement des demandes.
 *
 * Le motif n'est pas seulement exige par le serveur : il est AFFICHE comme
 * obligatoire des que l'agent choisit « refuser », pour qu'il ne decouvre pas
 * la contrainte apres coup.
 */
export function DocumentRequestActions({
  requestId,
  status,
  canDownload,
  downloadHref,
}: {
  requestId: string;
  status: string;
  canDownload: boolean;
  downloadHref: string | null;
}) {
  const [refusing, setRefusing] = useState(false);

  if (status === "DELIVERED" || status === "REJECTED") {
    return (
      <div className="flex flex-wrap gap-2">
        {canDownload && downloadHref && (
          <a href={downloadHref} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
            Rouvrir le document
          </a>
        )}
        <ActionForm action={updateDocumentRequestAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="status" value="PENDING" />
          <SubmitButton
            className="btn-ghost btn-sm"
            confirm="Rouvrir cette demande ?"
            pendingLabel="…"
          >
            Rouvrir
          </SubmitButton>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canDownload && downloadHref && (
          <a href={downloadHref} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
            Editer le document
          </a>
        )}

        {status === "PENDING" && (
          <ActionForm action={updateDocumentRequestAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="status" value="READY" />
            <SubmitButton className="btn-primary btn-sm" pendingLabel="…">
              Marquer pret
            </SubmitButton>
          </ActionForm>
        )}

        {status === "READY" && (
          <ActionForm action={updateDocumentRequestAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="status" value="DELIVERED" />
            <SubmitButton className="btn-primary btn-sm" pendingLabel="…">
              Marquer remis
            </SubmitButton>
          </ActionForm>
        )}

        <button
          type="button"
          onClick={() => setRefusing((open) => !open)}
          className="btn-ghost btn-sm"
        >
          {refusing ? "Annuler" : "Refuser"}
        </button>
      </div>

      {refusing && (
        <ActionForm action={updateDocumentRequestAction} className="space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="status" value="REJECTED" />
          <TextAreaField
            name="note"
            label="Motif du refus"
            rows={2}
            required
            hint="Ce motif est transmis a la famille."
          />
          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
            Confirmer le refus
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

export function AppointmentRequestActions({
  requestId,
  status,
  preferredAtValue,
}: {
  requestId: string;
  status: string;
  preferredAtValue: string;
}) {
  const [mode, setMode] = useState<"none" | "confirm" | "decline">("none");

  if (status === "DONE") {
    return <span className="text-xs text-slate-500">Rendez-vous clos.</span>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "CONFIRMED" && (
          <button
            type="button"
            onClick={() => setMode(mode === "confirm" ? "none" : "confirm")}
            className="btn-primary btn-sm"
          >
            {mode === "confirm" ? "Annuler" : "Confirmer"}
          </button>
        )}

        {status === "CONFIRMED" && (
          <ActionForm action={updateAppointmentRequestAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="status" value="DONE" />
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
              Marquer effectue
            </SubmitButton>
          </ActionForm>
        )}

        {status !== "DECLINED" && (
          <button
            type="button"
            onClick={() => setMode(mode === "decline" ? "none" : "decline")}
            className="btn-ghost btn-sm"
          >
            {mode === "decline" ? "Annuler" : "Decliner"}
          </button>
        )}
      </div>

      {mode === "confirm" && (
        <ActionForm action={updateAppointmentRequestAction} className="space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="status" value="CONFIRMED" />
          <TextField
            name="confirmedAt"
            label="Date et heure retenues"
            type="datetime-local"
            required
            defaultValue={preferredAtValue}
            hint="Pre-remplie avec le creneau souhaite par la famille, modifiable."
          />
          <TextAreaField name="reply" label="Message a la famille" rows={2} />
          <SubmitButton className="btn-primary btn-sm" pendingLabel="…">
            Confirmer le rendez-vous
          </SubmitButton>
        </ActionForm>
      )}

      {mode === "decline" && (
        <ActionForm action={updateAppointmentRequestAction} className="space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="status" value="DECLINED" />
          <TextAreaField
            name="reply"
            label="Motif"
            rows={2}
            required
            hint="Ce motif est transmis a la famille."
          />
          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
            Decliner
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
