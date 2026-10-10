"use client";

import { useState } from "react";
import {
  ActionForm,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { reviewProofAction } from "../actions";

/**
 * Arbitrage d'un justificatif.
 *
 * Deux chemins distincts et explicites :
 *  - ACCEPTER : le comptable confirme un montant (pouvant differer de celui
 *    declare) ; un encaissement reel et un recu sont alors crees.
 *  - REJETER  : un motif est obligatoire, il est transmis a la famille.
 */
export function ProofReviewForm({
  proofId,
  declaredAmountMinor,
  currencyLabel,
  financialAccounts,
}: {
  proofId: string;
  declaredAmountMinor: number;
  currencyLabel: string;
  financialAccounts: { id: string; label: string }[];
}) {
  const [decision, setDecision] = useState<"ACCEPTE" | "REJETE">("ACCEPTE");

  return (
    <ActionForm action={reviewProofAction} className="space-y-3">
      <input type="hidden" name="proofId" value={proofId} />
      <input type="hidden" name="decision" value={decision} />

      <div className="flex gap-2" role="radiogroup" aria-label="Decision">
        <button
          type="button"
          role="radio"
          aria-checked={decision === "ACCEPTE"}
          onClick={() => setDecision("ACCEPTE")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            decision === "ACCEPTE"
              ? "border-mint-200 bg-mint-50 text-mint-700"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Accepter
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={decision === "REJETE"}
          onClick={() => setDecision("REJETE")}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            decision === "REJETE"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Rejeter
        </button>
      </div>

      {decision === "ACCEPTE" ? (
        <>
          <TextField
            name="confirmedAmount"
            label={`Montant confirme (${currencyLabel})`}
            inputMode="decimal"
            defaultValue={String(declaredAmountMinor)}
            hint="Montant reellement constate sur le compte. Peut differer du montant declare."
          />

          {financialAccounts.length > 0 && (
            <SelectField
              name="financialAccountId"
              label="Compte crediteur"
              placeholder="Non precise"
              options={financialAccounts.map((account) => ({
                value: account.id,
                label: account.label,
              }))}
            />
          )}

          <SubmitButton
            className="btn-primary btn-sm w-full"
            pendingLabel="Validation…"
            confirm="Confirmer l'encaissement ? Un recu sera emis et l'ecriture comptable passee."
          >
            Accepter et encaisser
          </SubmitButton>

          <p className="text-xs text-slate-500">
            Verifiez le releve du compte beneficiaire avant d&apos;accepter : une capture d&apos;ecran
            ne prouve pas la reception des fonds.
          </p>
        </>
      ) : (
        <>
          <TextAreaField
            name="rejectionReason"
            label="Motif du rejet"
            required
            rows={3}
            hint="Transmis a la famille par notification. Soyez precis et factuel."
          />
          <SubmitButton className="btn-danger btn-sm w-full" pendingLabel="Enregistrement…">
            Rejeter le justificatif
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
