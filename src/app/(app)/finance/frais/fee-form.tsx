"use client";

import { useState } from "react";
import {
  ActionForm,
  CheckboxField,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import { FEE_CATEGORIES, FEE_CATEGORY_LABELS } from "@/lib/constants";
import { createFeeItemAction } from "../actions";

type Installment = { label: string; percent: string; dueDate: string };

/**
 * Creation d'un frais avec son echeancier.
 *
 * Les tranches sont exprimees en pourcentage ; le serveur convertit en
 * montants entiers et garantit que leur somme egale exactement le montant du
 * frais (repartition au plus fort reste, aucune unite perdue).
 */
export function FeeItemForm({
  academicYearId,
  currencyLabel,
  levels,
  classRooms,
}: {
  academicYearId: string;
  currencyLabel: string;
  levels: { id: string; name: string }[];
  classRooms: { id: string; name: string }[];
}) {
  const [installments, setInstallments] = useState<Installment[]>([]);

  const totalPercent = installments.reduce(
    (total, installment) => total + (Number.parseFloat(installment.percent) || 0),
    0,
  );

  // Serialisation pour le serveur : pourcentages en centiemes de pourcent.
  const serializedPlan = JSON.stringify(
    installments
      .filter((installment) => installment.label && installment.dueDate)
      .map((installment) => ({
        label: installment.label,
        percentCenti: Math.round((Number.parseFloat(installment.percent) || 0) * 100),
        dueDate: installment.dueDate,
      })),
  );

  return (
    <ActionForm action={createFeeItemAction} className="space-y-4" resetOnSuccess>
      <input type="hidden" name="academicYearId" value={academicYearId} />
      <input type="hidden" name="installmentPlan" value={serializedPlan} />

      <FormGrid cols={1}>
        <TextField name="name" label="Libelle du frais" required placeholder="Scolarite annuelle" />

        <FormGrid cols={2}>
          <TextField name="code" label="Code" required placeholder="SCOL" hint="Unique pour l'annee." />
          <TextField
            name="amount"
            label={`Montant (${currencyLabel})`}
            required
            inputMode="decimal"
            placeholder="300000"
          />
        </FormGrid>

        <SelectField
          name="category"
          label="Categorie"
          required
          defaultValue={FEE_CATEGORIES.SCOLARITE}
          options={Object.values(FEE_CATEGORIES).map((category) => ({
            value: category,
            label: FEE_CATEGORY_LABELS[category],
          }))}
        />

        <FormGrid cols={2}>
          <SelectField
            name="levelId"
            label="Limiter a un niveau"
            placeholder="Tous les niveaux"
            options={levels.map((level) => ({ value: level.id, label: level.name }))}
          />
          <SelectField
            name="classRoomId"
            label="Limiter a une classe"
            placeholder="Toutes les classes"
            options={classRooms.map((room) => ({ value: room.id, label: room.name }))}
          />
        </FormGrid>
      </FormGrid>

      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <CheckboxField name="isMandatory" label="Frais obligatoire" defaultChecked />
        <CheckboxField
          name="autoAssign"
          label="Appliquer automatiquement a l'inscription"
          hint="Le frais sera ajoute au compte de chaque eleve concerne lors de son inscription."
          defaultChecked
        />
      </div>

      {/* ------------------------------ Echeancier ------------------------------ */}
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="label-caps px-1 text-slate-500">Echeancier (facultatif)</legend>

        {installments.length === 0 ? (
          <p className="text-xs text-slate-500">
            Sans echeancier, le frais est du en une seule fois.
          </p>
        ) : (
          <ul className="space-y-2">
            {installments.map((installment, index) => (
              <li key={index} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-5">
                  <label className="sr-only" htmlFor={`label-${index}`}>
                    Libelle de la tranche {index + 1}
                  </label>
                  <input
                    id={`label-${index}`}
                    value={installment.label}
                    onChange={(event) =>
                      setInstallments((current) =>
                        current.map((item, position) =>
                          position === index ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="1ere tranche"
                    className="input py-1.5 text-xs"
                  />
                </div>
                <div className="col-span-3">
                  <label className="sr-only" htmlFor={`percent-${index}`}>
                    Pourcentage de la tranche {index + 1}
                  </label>
                  <input
                    id={`percent-${index}`}
                    value={installment.percent}
                    onChange={(event) =>
                      setInstallments((current) =>
                        current.map((item, position) =>
                          position === index ? { ...item, percent: event.target.value } : item,
                        ),
                      )
                    }
                    inputMode="decimal"
                    placeholder="40"
                    className="input py-1.5 text-xs"
                  />
                </div>
                <div className="col-span-3">
                  <label className="sr-only" htmlFor={`due-${index}`}>
                    Echeance de la tranche {index + 1}
                  </label>
                  <input
                    id={`due-${index}`}
                    type="date"
                    value={installment.dueDate}
                    onChange={(event) =>
                      setInstallments((current) =>
                        current.map((item, position) =>
                          position === index ? { ...item, dueDate: event.target.value } : item,
                        ),
                      )
                    }
                    className="input py-1.5 text-xs"
                  />
                </div>
                <div className="col-span-1">
                  <button
                    type="button"
                    onClick={() =>
                      setInstallments((current) => current.filter((_, position) => position !== index))
                    }
                    className="btn-ghost btn-sm w-full text-rose-600"
                    aria-label={`Supprimer la tranche ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setInstallments((current) => [...current, { label: "", percent: "", dueDate: "" }])
            }
            className="btn-secondary btn-sm"
          >
            Ajouter une tranche
          </button>

          {installments.length > 0 && (
            <span
              className={`text-xs font-medium ${
                Math.abs(totalPercent - 100) < 0.01 ? "text-mint-700" : "text-amber-700"
              }`}
            >
              Total : {totalPercent.toFixed(0)} %
              {Math.abs(totalPercent - 100) >= 0.01 && " (doit faire 100 %)"}
            </span>
          )}
        </div>
      </fieldset>

      <SubmitButton className="btn-primary w-full">Ajouter au catalogue</SubmitButton>
    </ActionForm>
  );
}
