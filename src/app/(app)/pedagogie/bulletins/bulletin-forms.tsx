"use client";

import { ActionForm, SubmitButton } from "@/components/client/form";
import { generateReportCardsAction, publishResultsAction } from "../actions";

/** Generation (ou regeneration) des bulletins d'une classe. */
export function GenerateReportCardsForm({
  classRoomId,
  gradingPeriodId,
}: {
  classRoomId: string;
  gradingPeriodId: string;
}) {
  return (
    <ActionForm action={generateReportCardsAction}>
      <input type="hidden" name="classRoomId" value={classRoomId} />
      <input type="hidden" name="gradingPeriodId" value={gradingPeriodId} />
      <SubmitButton className="btn-primary w-full" pendingLabel="Calcul en cours…">
        Generer les bulletins
      </SubmitButton>
    </ActionForm>
  );
}

/** Publication des resultats : irreversible, donc confirmee explicitement. */
export function PublishResultsForm({
  gradingPeriodId,
  periodName,
}: {
  gradingPeriodId: string;
  periodName: string;
}) {
  return (
    <ActionForm action={publishResultsAction}>
      <input type="hidden" name="gradingPeriodId" value={gradingPeriodId} />
      <SubmitButton
        className="btn-primary w-full"
        pendingLabel="Publication…"
        confirm={
          `Publier definitivement les resultats de "${periodName}" ?\n\n` +
          "Les familles y auront acces, la periode sera verrouillee pour tout l'etablissement " +
          "et des notifications seront envoyees. Cette action ne peut pas etre annulee."
        }
      >
        Publier les resultats
      </SubmitButton>
    </ActionForm>
  );
}
