"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/client/form";
import { formatScore } from "@/lib/domain/grades";
import { reviseGradeAction, saveGradesAction } from "../../actions";

type StudentRow = {
  id: string;
  matricule: string;
  name: string;
  gradeId: string | null;
  scoreCenti: number | null;
  isAbsent: boolean;
  isExcused: boolean;
  revisions: { id: string; reason: string; previous: number | null; next: number | null; createdAt: string }[];
};

/**
 * Tableau de saisie des notes.
 *
 * Saisie au clavier de haut en bas : chaque champ accepte « 15 » ou « 15,25 ».
 * La validation definitive est faite cote serveur ; l'indication locale
 * (bordure rouge) ne sert qu'au confort de saisie.
 */
export function GradeEntryTable({
  evaluationId,
  maxScore,
  students,
  locale,
  readOnly,
  canRevise,
}: {
  evaluationId: string;
  maxScore: number;
  students: StudentRow[];
  locale: string;
  readOnly: boolean;
  canRevise: boolean;
}) {
  const [absents, setAbsents] = useState<Record<string, boolean>>(
    Object.fromEntries(students.map((student) => [student.id, student.isAbsent])),
  );
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      students.map((student) => [
        student.id,
        student.scoreCenti === null ? "" : (student.scoreCenti / 100).toFixed(2).replace(".", ","),
      ]),
    ),
  );
  const [revising, setRevising] = useState<string | null>(null);

  const isOutOfRange = (raw: string) => {
    if (raw.trim() === "") return false;
    const value = Number.parseFloat(raw.replace(",", "."));
    return !Number.isFinite(value) || value < 0 || value > maxScore;
  };

  const enteredCount = students.filter(
    (student) => absents[student.id] || values[student.id]?.trim() !== "",
  ).length;

  if (readOnly) {
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Eleve</th>
              <th className="text-right">Note / {maxScore}</th>
              <th>Observation</th>
              {canRevise && <th className="text-right">Correction</th>}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td className="font-mono text-xs text-slate-500">{student.matricule}</td>
                <td className="font-medium text-slate-900">{student.name}</td>
                <td className="num">
                  {student.isAbsent ? "—" : formatScore(student.scoreCenti, locale)}
                </td>
                <td className="text-xs">
                  {student.isAbsent && (
                    <span className={student.isExcused ? "badge-info" : "badge-warning"}>
                      {student.isExcused ? "Absence excusee" : "Absent"}
                    </span>
                  )}
                </td>
                {canRevise && (
                  <td className="text-right">
                    {student.gradeId &&
                      (revising === student.gradeId ? (
                        <div className="min-w-64 text-left">
                          <ActionForm action={reviseGradeAction} className="space-y-2">
                            <input type="hidden" name="gradeId" value={student.gradeId} />
                            <div>
                              <label className="field-label text-xs" htmlFor={`rev-${student.id}`}>
                                Nouvelle note
                              </label>
                              <input
                                id={`rev-${student.id}`}
                                name="score"
                                defaultValue={
                                  student.scoreCenti === null
                                    ? ""
                                    : (student.scoreCenti / 100).toFixed(2).replace(".", ",")
                                }
                                inputMode="decimal"
                                className="input py-1 text-sm"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                name="isAbsent"
                                defaultChecked={student.isAbsent}
                                className="size-3.5 rounded border-slate-300"
                              />
                              Absent
                            </label>
                            <TextAreaField name="reason" label="Motif de la correction" required rows={2} />
                            <div className="flex gap-1.5">
                              <SubmitButton className="btn-primary btn-sm">Corriger</SubmitButton>
                              <button
                                type="button"
                                onClick={() => setRevising(null)}
                                className="btn-secondary btn-sm"
                              >
                                Annuler
                              </button>
                            </div>
                          </ActionForm>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRevising(student.gradeId)}
                          className="btn-ghost btn-sm"
                        >
                          Corriger
                        </button>
                      ))}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ActionForm action={saveGradesAction}>
      <input type="hidden" name="evaluationId" value={evaluationId} />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Eleve</th>
              <th style={{ width: 130 }}>Note / {maxScore}</th>
              <th style={{ width: 110 }}>Absent</th>
              <th style={{ width: 120 }}>Excuse</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, index) => {
              const absent = absents[student.id];
              const invalid = isOutOfRange(values[student.id] ?? "");

              return (
                <tr key={student.id}>
                  <td className="font-mono text-xs text-slate-500">{student.matricule}</td>
                  <td className="font-medium text-slate-900">{student.name}</td>
                  <td>
                    <label className="sr-only" htmlFor={`note-${student.id}`}>
                      Note de {student.name}
                    </label>
                    <input
                      id={`note-${student.id}`}
                      name={`note_${student.id}`}
                      value={absent ? "" : (values[student.id] ?? "")}
                      disabled={absent}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [student.id]: event.target.value }))
                      }
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="—"
                      aria-invalid={invalid || undefined}
                      autoFocus={index === 0}
                      className={`input py-1 text-right tabular ${invalid ? "input-error" : ""}`}
                    />
                  </td>
                  <td>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        name={`absent_${student.id}`}
                        checked={absent}
                        onChange={(event) =>
                          setAbsents((current) => ({ ...current, [student.id]: event.target.checked }))
                        }
                        className="size-4 rounded border-slate-300 text-brand-600"
                      />
                      Absent
                    </label>
                  </td>
                  <td>
                    {absent && (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          name={`excuse_${student.id}`}
                          defaultChecked={student.isExcused}
                          className="size-4 rounded border-slate-300 text-brand-600"
                        />
                        Excusee
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <p className="text-sm text-slate-600">
          {enteredCount} / {students.length} eleve(s) renseigne(s).
          {students.some((student) => isOutOfRange(values[student.id] ?? "")) && (
            <span className="ml-2 font-medium text-rose-600">
              Certaines notes sortent du bareme.
            </span>
          )}
        </p>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les notes</SubmitButton>
      </div>
    </ActionForm>
  );
}
