"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ActionResult } from "@/lib/errors";
import type { ImportPreview } from "@/lib/domain/student-import";
import { commitImportAction, previewImportAction } from "./actions";

/**
 * Assistant d'import en deux etapes.
 *
 * Etape 1 : depot du fichier -> apercu detaille (lignes valides, erreurs,
 *           doublons), sans aucune ecriture d'eleve.
 * Etape 2 : validation explicite -> seules les lignes valides sont importees.
 */
export function ImportWizard({
  academicYears,
}: {
  academicYears: { id: string; name: string; isCurrent: boolean }[];
}) {
  const [previewState, previewAction, previewPending] = useActionState<
    ActionResult<unknown> | null,
    FormData
  >(previewImportAction, null);

  const [commitState, commitAction, commitPending] = useActionState<
    ActionResult<unknown> | null,
    FormData
  >(commitImportAction, null);

  const preview =
    previewState?.ok && !commitState?.ok ? (previewState.data as ImportPreview) : null;

  const [showAllIssues, setShowAllIssues] = useState(false);

  // Etape finale : import termine.
  if (commitState?.ok) {
    const result = commitState.data as { imported: number; failures: number };
    return (
      <div className="rounded-2xl border border-mint-200 bg-mint-50 p-6">
        <h2 className="text-lg font-semibold text-mint-700">Import termine</h2>
        <p className="mt-2 text-sm text-slate-700">{commitState.message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/eleves" className="btn-primary">
            Voir les {result.imported} eleve(s) importe(s)
          </Link>
          <Link href="/eleves/import" className="btn-secondary">
            Importer un autre fichier
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ------------------------- Etape 1 : depot ------------------------- */}
      {!preview && (
        <form action={previewAction} className="card card-pad">
          <h2 className="text-base font-semibold text-slate-900">1. Deposer le fichier</h2>
          <p className="mt-1 text-sm text-slate-600">
            Format CSV, separateur <code className="rounded bg-slate-100 px-1 text-xs">;</code> ou{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">,</code>. Les accents et les
            fichiers exportes depuis Excel sont geres automatiquement.
          </p>

          {previewState && !previewState.ok && (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <p className="font-semibold">{previewState.error}</p>
              {previewState.fieldErrors && (
                <ul className="mt-1 list-inside list-disc text-xs">
                  {Object.values(previewState.fieldErrors)
                    .flat()
                    .map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="academicYearId" className="field-label">
                Annee scolaire d&apos;inscription <span className="text-rose-600">*</span>
              </label>
              <select
                id="academicYearId"
                name="academicYearId"
                required
                defaultValue={academicYears.find((year) => year.isCurrent)?.id ?? ""}
                className="input"
              >
                <option value="">Choisir une annee</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                    {year.isCurrent ? " (en cours)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="file" className="field-label">
                Fichier CSV <span className="text-rose-600">*</span>
              </label>
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv,text/plain"
                required
                className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-600
                           file:mr-3 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-4 file:py-2
                           file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="submit" disabled={previewPending} className="btn-primary" aria-busy={previewPending}>
              {previewPending ? "Analyse du fichier…" : "Analyser le fichier"}
            </button>
            <Link href="/api/export/modele-import-eleves" className="btn-secondary">
              Telecharger le modele
            </Link>
          </div>
        </form>
      )}

      {/* ------------------------- Etape 2 : apercu ------------------------- */}
      {preview && (
        <>
          <section className="card card-pad">
            <h2 className="text-base font-semibold text-slate-900">
              2. Verifier l&apos;apercu — {preview.fileName}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Aucun eleve n&apos;a encore ete cree. Verifiez le rapport avant de valider.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile label="Lignes lues" value={preview.totalRows} tone="slate" />
              <SummaryTile label="Importables" value={preview.validRows} tone="mint" />
              <SummaryTile label="En erreur" value={preview.errorRows} tone="rose" />
              <SummaryTile label="Doublons" value={preview.duplicateRows} tone="amber" />
            </div>

            {preview.unknownClassCodes.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Codes de classe inconnus</p>
                <p className="mt-1">
                  Ces codes n&apos;existent pas pour l&apos;annee choisie :{" "}
                  <span className="font-mono">{preview.unknownClassCodes.join(", ")}</span>. Creez
                  les classes correspondantes ou corrigez le fichier.
                </p>
              </div>
            )}
          </section>

          {/* Rapport d'erreurs */}
          {preview.issues.length > 0 && (
            <section className="card">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="label-caps text-slate-500">Rapport de controle</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {preview.issues.length} anomalie(s) detectee(s). Les lignes en erreur ou en
                  doublon ne seront pas importees.
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Colonne</th>
                      <th>Type</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllIssues ? preview.issues : preview.issues.slice(0, 20)).map((issue, index) => (
                      <tr key={`${issue.line}-${issue.column}-${index}`}>
                        <td className="tabular">{issue.line}</td>
                        <td className="font-mono text-xs">{issue.column}</td>
                        <td>
                          <span
                            className={
                              issue.severity === "ERREUR"
                                ? "badge-danger"
                                : issue.severity === "DOUBLON"
                                  ? "badge-warning"
                                  : "badge-neutral"
                            }
                          >
                            {issue.severity}
                          </span>
                        </td>
                        <td className="text-slate-700">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.issues.length > 20 && (
                <div className="border-t border-slate-200 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setShowAllIssues((value) => !value)}
                    className="btn-ghost btn-sm"
                  >
                    {showAllIssues ? "Reduire" : `Afficher les ${preview.issues.length} anomalies`}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Apercu des lignes */}
          <section className="card">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="label-caps text-slate-500">Apercu des donnees</h3>
              <p className="mt-1 text-sm text-slate-600">
                {preview.sample.length} premiere(s) ligne(s) sur {preview.totalRows}.
              </p>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ligne</th>
                    <th>Etat</th>
                    <th>Nom</th>
                    <th>Prenom</th>
                    <th>Sexe</th>
                    <th>Naissance</th>
                    <th>Classe</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row) => (
                    <tr key={row.line} className={row.isValid ? "" : "bg-rose-50/40"}>
                      <td className="tabular">{row.line}</td>
                      <td>
                        {row.isValid ? (
                          <span className="badge-success">OK</span>
                        ) : row.isDuplicate ? (
                          <span className="badge-warning">Doublon</span>
                        ) : (
                          <span className="badge-danger">Erreur</span>
                        )}
                      </td>
                      <td className="font-medium">{row.lastName}</td>
                      <td>{row.firstName}</td>
                      <td>{row.gender === "UNSPECIFIED" ? "—" : row.gender}</td>
                      <td>{row.birthDate ? new Date(row.birthDate).toLocaleDateString("fr-FR") : "—"}</td>
                      <td className="font-mono text-xs">{row.classCode || "—"}</td>
                      <td className="text-slate-600">
                        {row.guardianLastName ? `${row.guardianLastName} ${row.guardianFirstName}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Validation */}
          <form action={commitAction} className="card card-pad">
            <input type="hidden" name="batchId" value={preview.batchId} />

            {commitState && !commitState.ok && (
              <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {commitState.error}
              </div>
            )}

            <h3 className="text-base font-semibold text-slate-900">3. Valider l&apos;import</h3>
            <p className="mt-1 text-sm text-slate-600">
              {preview.validRows} eleve(s) seront crees avec leur inscription, leur responsable
              legal et les frais obligatoires de leur classe.{" "}
              {preview.errorRows + preview.duplicateRows > 0 &&
                `Les ${preview.errorRows + preview.duplicateRows} autres lignes seront ignorees.`}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={commitPending || preview.validRows === 0}
                aria-busy={commitPending}
                className="btn-primary"
              >
                {commitPending
                  ? "Import en cours…"
                  : `Importer ${preview.validRows} eleve(s)`}
              </button>
              <Link href="/eleves/import" className="btn-secondary">
                Annuler et recommencer
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "mint" | "rose" | "amber";
}) {
  const styles = {
    slate: "bg-slate-50 border-slate-200 text-slate-600",
    mint: "bg-mint-50 border-mint-200 text-mint-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-3.5 ${styles}`}>
      <p className="label-caps">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular">{value}</p>
    </div>
  );
}
