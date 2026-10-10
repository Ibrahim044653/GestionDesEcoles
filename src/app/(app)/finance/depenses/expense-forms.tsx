"use client";

import { useState } from "react";
import {
  ActionForm,
  FormGrid,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { approveExpenseAction, createExpenseAction, payExpenseAction } from "../actions";

/** Saisie d'une demande de depense. */
export function ExpenseForm({
  currencyLabel,
  categories,
  suppliers,
  financialAccounts,
}: {
  currencyLabel: string;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  financialAccounts: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={createExpenseAction} className="space-y-4" resetOnSuccess>
      <TextField name="label" label="Objet de la depense" required placeholder="Facture d'electricite - octobre" />

      <FormGrid cols={2}>
        <TextField name="amount" label={`Montant (${currencyLabel})`} required inputMode="decimal" />
        <SelectField
          name="categoryId"
          label="Categorie"
          required
          placeholder="Choisir"
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
        />
      </FormGrid>

      <SelectField
        name="supplierId"
        label="Fournisseur"
        placeholder="Aucun fournisseur"
        options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
      />

      <FormGrid cols={2}>
        <TextField name="invoiceNumber" label="Numero de facture" />
        <TextField name="invoiceDate" label="Date de facture" type="date" />
        <TextField name="dueDate" label="Echeance de paiement" type="date" />
        <SelectField
          name="paymentMethod"
          label="Mode de reglement prevu"
          defaultValue={PAYMENT_METHODS.VIREMENT}
          options={Object.values(PAYMENT_METHODS).map((method) => ({
            value: method,
            label: PAYMENT_METHOD_LABELS[method],
          }))}
        />
      </FormGrid>

      {financialAccounts.length > 0 && (
        <SelectField
          name="financialAccountId"
          label="Compte a debiter"
          placeholder="Non precise"
          options={financialAccounts.map((account) => ({ value: account.id, label: account.name }))}
        />
      )}

      <TextAreaField name="description" label="Description" rows={2} />

      <SubmitButton className="btn-primary w-full">Enregistrer la demande</SubmitButton>
    </ActionForm>
  );
}

/**
 * Actions contextuelles sur une depense, selon son statut et les droits
 * de l'utilisateur.
 */
export function ExpenseDecisionButtons({
  expenseId,
  status,
  canApprove,
  canPay,
}: {
  expenseId: string;
  status: string;
  canApprove: boolean;
  canPay: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);

  if (status === "REQUESTED" || status === "DRAFT") {
    if (!canApprove) return <span className="text-xs text-slate-400">En attente</span>;

    if (rejecting) {
      return (
        <div className="min-w-56 text-left">
          <ActionForm action={approveExpenseAction} className="space-y-2">
            <input type="hidden" name="expenseId" value={expenseId} />
            <input type="hidden" name="decision" value="REJECTED" />
            <TextAreaField name="rejectionReason" label="Motif du refus" required rows={2} />
            <div className="flex gap-1.5">
              <SubmitButton className="btn-danger btn-sm">Refuser</SubmitButton>
              <button type="button" onClick={() => setRejecting(false)} className="btn-secondary btn-sm">
                Annuler
              </button>
            </div>
          </ActionForm>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-1.5">
        <ActionForm action={approveExpenseAction}>
          <input type="hidden" name="expenseId" value={expenseId} />
          <input type="hidden" name="decision" value="APPROVED" />
          <SubmitButton className="btn-primary btn-sm">Approuver</SubmitButton>
        </ActionForm>
        <button type="button" onClick={() => setRejecting(true)} className="btn-ghost btn-sm text-rose-700">
          Refuser
        </button>
      </div>
    );
  }

  if (status === "APPROVED" && canPay) {
    return (
      <ActionForm action={payExpenseAction}>
        <input type="hidden" name="expenseId" value={expenseId} />
        <SubmitButton
          className="btn-primary btn-sm"
          confirm="Confirmer le reglement ? L'ecriture comptable sera passee et la tresorerie diminuee."
        >
          Marquer payee
        </SubmitButton>
      </ActionForm>
    );
  }

  return <span className="text-xs text-slate-400">—</span>;
}
