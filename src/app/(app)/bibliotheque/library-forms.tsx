"use client";

import { useState } from "react";
import {
  ActionForm,
  FormActions,
  FormGrid,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import {
  closeLoanAction,
  lendItemAction,
  retireLibraryItemAction,
  saveLibraryItemAction,
} from "./actions";

/** Ajout d'un ouvrage au fonds. */
export function NewItemForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary btn-sm">
        Ajouter un ouvrage
      </button>
    );
  }

  return (
    <ActionForm action={saveLibraryItemAction} resetOnSuccess>
      <FormGrid cols={2}>
        <TextField
          name="reference"
          label="Cote"
          required
          placeholder="Ex. : LIT-0042"
          hint="Code interne, unique dans l'etablissement."
        />
        <SelectField
          name="kind"
          label="Type"
          required
          options={[
            { value: "LIVRE", label: "Livre" },
            { value: "MANUEL", label: "Manuel scolaire" },
            { value: "REVUE", label: "Revue" },
            { value: "MULTIMEDIA", label: "Multimedia" },
            { value: "AUTRE", label: "Autre" },
          ]}
        />
        <TextField name="title" label="Titre" required className="sm:col-span-2" />
        <TextField name="author" label="Auteur" />
        <TextField name="publisher" label="Editeur" />
        <TextField name="isbn" label="ISBN" />
        <TextField name="category" label="Categorie" placeholder="Ex. : Litterature, Sciences" />
        <TextField
          name="totalCopies"
          label="Exemplaires detenus"
          type="number"
          min={1}
          defaultValue={1}
          required
          hint="La disponibilite est calculee : exemplaires detenus moins prets en cours."
        />
        <TextField name="shelf" label="Emplacement" placeholder="Ex. : Rayon B, etagere 3" />
      </FormGrid>

      <div className="mt-4">
        <TextAreaField name="notes" label="Notes" rows={2} />
      </div>

      <FormActions>
        <SubmitButton pendingLabel="Enregistrement…">Ajouter au fonds</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Annuler
        </button>
      </FormActions>
    </ActionForm>
  );
}

/** Pret d'un exemplaire. */
export function LendForm({
  items,
  borrowers,
  defaultDueDate,
}: {
  items: { id: string; label: string; available: number }[];
  borrowers: { value: string; label: string }[];
  defaultDueDate: string;
}) {
  const available = items.filter((item) => item.available > 0);

  if (available.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Aucun exemplaire disponible : tous les ouvrages du fonds sont actuellement pretes.
      </p>
    );
  }

  if (borrowers.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Aucun emprunteur disponible : enregistrez d&apos;abord des eleves ou du personnel.
      </p>
    );
  }

  return (
    <ActionForm action={lendItemAction} resetOnSuccess>
      <FormGrid cols={2}>
        <SelectField
          name="itemId"
          label="Ouvrage"
          required
          options={available.map((item) => ({
            value: item.id,
            label: `${item.label} — ${item.available} dispo.`,
          }))}
        />
        <SelectField name="borrower" label="Emprunteur" required options={borrowers} />
        <TextField
          name="dueDate"
          label="Retour attendu"
          type="date"
          defaultValue={defaultDueDate}
          hint="Pre-rempli avec la duree de pret standard."
        />
        <TextField name="notes" label="Observation" />
      </FormGrid>

      <FormActions>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer le pret</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

/** Retour ou declaration de perte. */
export function LoanCloseActions({ loanId }: { loanId: string }) {
  const [losing, setLosing] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ActionForm action={closeLoanAction}>
          <input type="hidden" name="loanId" value={loanId} />
          <input type="hidden" name="status" value="RENDU" />
          <SubmitButton className="btn-primary btn-sm" pendingLabel="…">
            Retour
          </SubmitButton>
        </ActionForm>

        <button
          type="button"
          onClick={() => setLosing((open) => !open)}
          className="btn-ghost btn-sm"
        >
          {losing ? "Annuler" : "Declarer perdu"}
        </button>
      </div>

      {losing && (
        <ActionForm action={closeLoanAction} className="space-y-2">
          <input type="hidden" name="loanId" value={loanId} />
          <input type="hidden" name="status" value="PERDU" />
          <TextField name="condition" label="Circonstances" />
          <SubmitButton
            className="btn-danger btn-sm"
            confirm="Declarer cet exemplaire perdu ? Le pret reste a l'historique de l'emprunteur."
            pendingLabel="…"
          >
            Confirmer la perte
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

/** Retrait d'un ouvrage du fonds. */
export function RetireItemButton({ itemId, title }: { itemId: string; title: string }) {
  return (
    <ActionForm action={retireLibraryItemAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton
        className="btn-ghost btn-sm"
        confirm={`Retirer « ${title} » du fonds ? L'historique des prets est conserve.`}
        pendingLabel="…"
      >
        Retirer
      </SubmitButton>
    </ActionForm>
  );
}
