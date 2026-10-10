"use client";

import {
  ActionForm,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import {
  createAccountingPeriodAction,
  createExpenseCategoryAction,
  createFinancialAccountAction,
  createSupplierAction,
  setBudgetAction,
} from "../actions";

/** Creation d'une caisse, d'un compte bancaire ou Mobile Money. */
export function FinancialAccountForm() {
  return (
    <ActionForm action={createFinancialAccountAction} className="space-y-3" resetOnSuccess>
      <FormGrid cols={2}>
        <TextField name="code" label="Code" required placeholder="CAISSE-2" />
        <SelectField
          name="kind"
          label="Type"
          defaultValue="CAISSE"
          options={[
            { value: "CAISSE", label: "Caisse (especes)" },
            { value: "BANQUE", label: "Compte bancaire" },
            { value: "MOBILE_MONEY", label: "Compte Mobile Money" },
          ]}
        />
      </FormGrid>
      <TextField name="name" label="Libelle" required placeholder="Caisse secondaire" />
      <FormGrid cols={2}>
        <TextField name="bankName" label="Etablissement" placeholder="Nom de la banque" />
        <TextField name="accountNumber" label="Numero de compte" />
      </FormGrid>
      <p className="field-hint">
        Le compte du plan comptable est deduit du type : 571 caisse, 521 banque, 531 Mobile Money.
      </p>
      <SubmitButton className="btn-primary btn-sm w-full">Creer le compte</SubmitButton>
    </ActionForm>
  );
}

/** Categorie de depense rattachee a un compte de charge. */
export function ExpenseCategoryForm({
  chargeAccounts,
}: {
  chargeAccounts: { code: string; label: string }[];
}) {
  return (
    <ActionForm action={createExpenseCategoryAction} className="space-y-3" resetOnSuccess>
      <FormGrid cols={2}>
        <TextField name="code" label="Code" required placeholder="ASS" />
        <TextField name="name" label="Libelle" required placeholder="Assurances" />
      </FormGrid>
      <SelectField
        name="defaultAccountCode"
        label="Compte de charge"
        placeholder="Aucun (compte 628 par defaut)"
        options={chargeAccounts.map((account) => ({ value: account.code, label: account.label }))}
        hint="Determine l'imputation comptable lors du reglement d'une depense de cette categorie."
      />
      <SubmitButton className="btn-primary btn-sm w-full">Creer la categorie</SubmitButton>
    </ActionForm>
  );
}

/** Exercice comptable (periode cloturable). */
export function AccountingPeriodForm() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const startYear = month >= 8 ? year : year - 1;

  return (
    <ActionForm action={createAccountingPeriodAction} className="space-y-3" resetOnSuccess>
      <TextField name="name" label="Intitule" required defaultValue={`Exercice ${startYear}-${startYear + 1}`} />
      <FormGrid cols={2}>
        <TextField name="startDate" label="Debut" type="date" required defaultValue={`${startYear}-09-01`} />
        <TextField name="endDate" label="Fin" type="date" required defaultValue={`${startYear + 1}-08-31`} />
      </FormGrid>
      <SubmitButton className="btn-primary btn-sm w-full">Creer l&apos;exercice</SubmitButton>
    </ActionForm>
  );
}

/** Fournisseur de l'etablissement. */
export function SupplierForm() {
  return (
    <ActionForm action={createSupplierAction} className="space-y-3" resetOnSuccess>
      <FormGrid cols={2}>
        <TextField name="code" label="Code" required placeholder="FOURN-002" />
        <TextField name="name" label="Raison sociale" required />
      </FormGrid>
      <FormGrid cols={2}>
        <TextField name="phone" label="Telephone" type="tel" />
        <TextField name="email" label="E-mail" type="email" />
      </FormGrid>
      <TextField name="taxId" label="Numero fiscal" />
      <TextField name="address" label="Adresse" />
      <SubmitButton className="btn-primary btn-sm w-full">Enregistrer le fournisseur</SubmitButton>
    </ActionForm>
  );
}

/**
 * Budget previsionnel par categorie de depense.
 *
 * Le rapprochement budget / realise (ecran Rapports) compare ce montant aux
 * depenses REELLEMENT reglees de la categorie choisie.
 */
export function BudgetForm({
  academicYears,
  categories,
  currencyLabel,
}: {
  academicYears: { id: string; name: string; isCurrent: boolean }[];
  categories: { code: string; name: string }[];
  currencyLabel: string;
}) {
  return (
    <ActionForm action={setBudgetAction} className="space-y-3" resetOnSuccess>
      <SelectField
        name="academicYearId"
        label="Annee scolaire"
        required
        defaultValue={academicYears.find((year) => year.isCurrent)?.id}
        options={academicYears.map((year) => ({
          value: year.id,
          label: `${year.name}${year.isCurrent ? " (en cours)" : ""}`,
        }))}
      />

      <SelectField
        name="category"
        label="Categorie de depense"
        required
        placeholder="Choisir"
        options={categories.map((category) => ({
          value: category.code,
          label: `${category.code} — ${category.name}`,
        }))}
      />

      <FormGrid cols={2}>
        <TextField name="label" label="Libelle du poste" required placeholder="Budget salaires" />
        <TextField
          name="planned"
          label={`Montant prevu (${currencyLabel})`}
          required
          inputMode="decimal"
        />
      </FormGrid>

      <p className="field-hint">
        Enregistrer un poste portant le meme libelle met a jour le montant existant.
      </p>

      <SubmitButton className="btn-primary btn-sm w-full">Enregistrer le budget</SubmitButton>
    </ActionForm>
  );
}
