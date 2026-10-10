"use client";

import {
  ActionForm,
  CheckboxField,
  FormActions,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import { OPTIONAL_MODULES, OPTIONAL_MODULE_LABELS, SCHOOL_TYPES, SCHOOL_TYPE_LABELS } from "@/lib/constants";
import { updateSchoolAction } from "./actions";

/** Identite, devise, regle de matricule et modules de l'etablissement. */
export function SchoolSettingsForm({
  school,
  enabledModules,
  nextMatriculeExample,
}: {
  school: {
    name: string;
    code: string;
    type: string;
    address: string;
    city: string;
    country: string;
    phone: string;
    email: string;
    website: string;
    currency: string;
    locale: string;
    matriculePattern: string;
  };
  enabledModules: string[];
  nextMatriculeExample: string;
}) {
  return (
    <ActionForm action={updateSchoolAction} onSuccessMessage="Parametres enregistres.">
      <fieldset>
        <legend className="label-caps mb-3 text-slate-500">Identite</legend>
        <FormGrid cols={2}>
          <TextField name="name" label="Nom de l'etablissement" required defaultValue={school.name} />
          <TextField
            name="code"
            label="Code"
            required
            defaultValue={school.code}
            hint="Identifiant court, utilise dans les matricules et les references."
          />
          <SelectField
            name="type"
            label="Type d'etablissement"
            defaultValue={school.type}
            options={Object.values(SCHOOL_TYPES).map((type) => ({
              value: type,
              label: SCHOOL_TYPE_LABELS[type],
            }))}
            hint="Determine la terminologie (trimestres / semestres, credits)."
          />
        </FormGrid>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="label-caps mb-3 text-slate-500">Coordonnees</legend>
        <FormGrid cols={2}>
          <TextField name="address" label="Adresse" defaultValue={school.address} />
          <TextField name="city" label="Ville" defaultValue={school.city} />
          <TextField name="country" label="Pays" defaultValue={school.country} hint="Code ISO sur 2 lettres." />
          <TextField name="phone" label="Telephone" type="tel" defaultValue={school.phone} />
          <TextField name="email" label="E-mail" type="email" defaultValue={school.email} />
          <TextField name="website" label="Site web" defaultValue={school.website} />
        </FormGrid>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="label-caps mb-3 text-slate-500">Devise et format</legend>
        <FormGrid cols={2}>
          <TextField
            name="currency"
            label="Devise"
            defaultValue={school.currency}
            hint="Code ISO sur 3 lettres (XOF, EUR...). Le nombre de decimales en decoule."
          />
          <TextField
            name="locale"
            label="Format regional"
            defaultValue={school.locale}
            hint="Ex. fr-CI : influence l'affichage des montants et des dates."
          />
          <TextField
            name="matriculePattern"
            label="Format du matricule"
            defaultValue={school.matriculePattern}
            hint="Jetons : {SCHOOL}, {YEAR}, {YY}, {SEQ:4}."
            className="sm:col-span-2"
          />
        </FormGrid>
        <p className="mt-2 text-xs text-slate-500">
          Prochain matricule attribue :{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
            {nextMatriculeExample}
          </code>
        </p>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="label-caps mb-3 text-slate-500">Modules optionnels</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {Object.values(OPTIONAL_MODULES).map((moduleCode) => (
            <CheckboxField
              key={moduleCode}
              name={`module_${moduleCode}`}
              label={OPTIONAL_MODULE_LABELS[moduleCode]}
              defaultChecked={enabledModules.includes(moduleCode)}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Activer un module le rend disponible dans la navigation. Les modules sans integration
          externe fonctionnent entierement hors ligne.
        </p>
      </fieldset>

      <FormActions>
        <SubmitButton>Enregistrer les parametres</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
