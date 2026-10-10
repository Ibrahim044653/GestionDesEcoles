"use client";

import { useState } from "react";
import { ActionForm, FileField, SubmitButton, TextAreaField } from "@/components/client/form";
import { submitAssignmentAction } from "../pedagogie/actions";
import { uploadSubmissionAttachmentAction } from "../fichiers/actions";

/**
 * Depot d'un travail par l'eleve.
 *
 * Le serveur determine lui-meme si la remise est en retard (comparaison avec
 * la date limite) : l'horloge du poste de l'eleve n'est pas utilisee.
 */
export function SubmitWorkForm({
  assignmentId,
  currentContent,
  alreadySubmitted,
}: {
  assignmentId: string;
  currentContent: string;
  alreadySubmitted: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={alreadySubmitted ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
      >
        {alreadySubmitted ? "Modifier ma remise" : "Deposer mon travail"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <ActionForm action={submitAssignmentAction} className="space-y-3">
        <input type="hidden" name="assignmentId" value={assignmentId} />

        <TextAreaField
          name="content"
          label="Mon travail"
          rows={5}
          defaultValue={currentContent}
          hint="Saisissez votre reponse. Vous pouvez modifier votre remise tant que l'enseignant ne l'a pas corrigee."
        />

        <div className="flex gap-2">
          <SubmitButton className="btn-primary btn-sm">Remettre</SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
            Annuler
          </button>
        </div>
      </ActionForm>

      {/* Depot de fichier : formulaire distinct, pour pouvoir joindre un
          document sans avoir a ressaisir le texte deja remis. */}
      <div className="mt-3 border-t border-slate-200 pt-3">
        <ActionForm action={uploadSubmissionAttachmentAction} className="space-y-2" resetOnSuccess>
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <FileField
            name="file"
            label="Joindre un fichier"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            hint="Photo de votre copie ou document PDF."
          />
          <SubmitButton className="btn-secondary btn-sm" pendingLabel="Envoi…">
            Envoyer le fichier
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
