"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  FormGrid,
  IdempotencyKeyField,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import type { ActionResult } from "@/lib/errors";
import { recordPaymentAction } from "../../actions";

/**
 * Saisie d'un encaissement.
 *
 * IDEMPOTENCE : un champ cache porte une cle unique generee au montage du
 * formulaire. Si l'utilisateur double-clique ou si la requete est rejouee,
 * le serveur reconnait la cle et renvoie le paiement deja enregistre au lieu
 * d'en creer un second. Le message le signale explicitement.
 */
export function PaymentForm({
  studentId,
  studentName,
  currency,
  currencyLabel,
  suggestedAmountMinor,
  financialAccounts,
}: {
  studentId: string;
  studentName: string;
  currency: string;
  currencyLabel: string;
  suggestedAmountMinor: number;
  financialAccounts: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult<unknown> | null, FormData>(
    recordPaymentAction,
    null,
  );

  const success = state?.ok
    ? (state.data as { paymentId: string; receiptNumber: string; wasDuplicate: boolean })
    : null;

  // Apres enregistrement : confirmation + acces direct au recu.
  if (success) {
    return (
      <div
        className={`rounded-xl border p-5 ${
          success.wasDuplicate ? "border-amber-200 bg-amber-50" : "border-mint-200 bg-mint-50"
        }`}
        role="status"
      >
        <h3 className={`text-base font-semibold ${success.wasDuplicate ? "text-amber-900" : "text-mint-700"}`}>
          {success.wasDuplicate ? "Reglement deja enregistre" : "Encaissement enregistre"}
        </h3>
        <p className="mt-1.5 text-sm text-slate-700">{state?.ok ? state.message : null}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/api/documents/recu/${success.paymentId}`} target="_blank" className="btn-primary btn-sm">
            Imprimer le recu
          </Link>
          <Link href={`/eleves/${studentId}`} className="btn-secondary btn-sm">
            Voir le dossier de l&apos;eleve
          </Link>
          <Link href="/finance/paiements/nouveau" className="btn-secondary btn-sm">
            Nouvel encaissement
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="studentId" value={studentId} />
      <IdempotencyKeyField />

      {state && !state.ok && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">{state.error}</p>
          {state.fieldErrors && (
            <ul className="mt-1 list-inside list-disc text-xs">
              {Object.values(state.fieldErrors)
                .flat()
                .map((message) => (
                  <li key={message}>{message}</li>
                ))}
            </ul>
          )}
        </div>
      )}

      <p className="mb-4 text-sm text-slate-600">
        Eleve : <strong className="text-slate-900">{studentName}</strong>
      </p>

      <FormGrid cols={2}>
        <TextField
          name="amount"
          label={`Montant recu (${currencyLabel})`}
          required
          inputMode="decimal"
          defaultValue={suggestedAmountMinor > 0 ? String(suggestedAmountMinor) : ""}
          hint="Le montant est impute automatiquement sur les echeances les plus anciennes."
        />

        <SelectField
          name="method"
          label="Mode de reglement"
          required
          defaultValue={PAYMENT_METHODS.ESPECES}
          options={Object.values(PAYMENT_METHODS).map((method) => ({
            value: method,
            label: PAYMENT_METHOD_LABELS[method],
          }))}
        />

        <TextField
          name="paidAt"
          label="Date du reglement"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
        />

        <TextField
          name="externalReference"
          label="Reference externe"
          hint="Numero de transaction Mobile Money, de cheque ou d'avis de virement."
        />

        {financialAccounts.length > 0 && (
          <SelectField
            name="financialAccountId"
            label="Caisse / compte crediteur"
            placeholder="Non precise"
            options={financialAccounts.map((account) => ({
              value: account.id,
              label: account.label,
            }))}
          />
        )}

        <TextAreaField name="note" label="Observation" rows={2} className="sm:col-span-2" />
      </FormGrid>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <Link href="/finance/paiements" className="btn-secondary">
          Annuler
        </Link>
        <SubmitButton pendingLabel="Enregistrement…">
          Encaisser et editer le recu
        </SubmitButton>
      </div>

      {pending && (
        <p className="mt-2 text-right text-xs text-slate-500">
          Ne rechargez pas la page : l&apos;operation est protegee contre les doubles
          enregistrements.
        </p>
      )}
    </form>
  );
}
