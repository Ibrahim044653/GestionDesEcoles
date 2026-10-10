"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/client/form";
import { ENROLLMENT_DECISIONS } from "@/lib/constants";
import { formatScore } from "@/lib/domain/grades";
import { recordClassDecisionsAction, updateReportCardAction } from "./actions";

const DECISION_LABELS: Record<string, string> = {
  EN_ATTENTE: "En attente",
  ADMIS: "Admis",
  REDOUBLE: "Redouble",
  EXCLU: "Exclu",
  ORIENTE: "Oriente",
};

type Student = {
  id: string;
  matricule: string;
  name: string;
  averageCenti: number | null;
  rank: number | null;
  classSize: number | null;
  reportCardId: string | null;
  appreciation: string;
  decision: string;
  decisionNote: string;
};

/**
 * Tableau de deliberation.
 *
 * Le bouton « proposer » pre-remplit les decisions a partir de la moyenne de
 * passage : c'est une aide a la saisie, pas une decision automatique. Le
 * conseil reste libre de modifier chaque ligne avant d'enregistrer.
 */
export function ClassDecisionsForm({
  classRoomId,
  academicYearId,
  passMarkCenti,
  locale,
  students,
}: {
  classRoomId: string;
  academicYearId: string;
  passMarkCenti: number;
  locale: string;
  students: Student[];
}) {
  const [decisions, setDecisions] = useState<Record<string, string>>(
    Object.fromEntries(students.map((student) => [student.id, student.decision])),
  );
  const [appreciationOuverte, setAppreciationOuverte] = useState<string | null>(null);

  const proposer = () =>
    setDecisions(
      Object.fromEntries(
        students.map((student) => [
          student.id,
          student.averageCenti === null
            ? "EN_ATTENTE"
            : student.averageCenti >= passMarkCenti
              ? "ADMIS"
              : "REDOUBLE",
        ]),
      ),
    );

  const compte = (valeur: string) =>
    students.filter((student) => decisions[student.id] === valeur).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
        <button type="button" onClick={proposer} className="btn-secondary btn-sm">
          Proposer selon la moyenne de passage
        </button>
        <span className="text-xs text-slate-500">
          Seuil : {formatScore(passMarkCenti, locale)}. Proposition modifiable ligne par ligne.
        </span>
      </div>

      <ActionForm action={recordClassDecisionsAction}>
        <input type="hidden" name="classRoomId" value={classRoomId} />
        <input type="hidden" name="academicYearId" value={academicYearId} />

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Eleve</th>
                <th className="text-right">Moyenne</th>
                <th className="text-right">Rang</th>
                <th style={{ width: 150 }}>Decision</th>
                <th>Observation</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const admissible =
                  student.averageCenti !== null && student.averageCenti >= passMarkCenti;

                return (
                  <tr key={student.id}>
                    <td>
                      <span className="block font-medium text-slate-900">{student.name}</span>
                      <span className="font-mono text-xs text-slate-400">{student.matricule}</span>

                      {student.reportCardId && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setAppreciationOuverte(
                                appreciationOuverte === student.id ? null : student.id,
                              )
                            }
                            className="mt-1 block text-xs font-medium text-brand-700 hover:underline"
                          >
                            {student.appreciation ? "Modifier l'appreciation" : "Ajouter une appreciation"}
                          </button>
                          {student.appreciation && (
                            <span className="mt-0.5 block max-w-xs text-xs italic text-slate-500">
                              {student.appreciation}
                            </span>
                          )}
                        </>
                      )}
                    </td>

                    <td className="num">
                      {student.averageCenti === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className={admissible ? "text-mint-700" : "text-rose-700"}>
                          {formatScore(student.averageCenti, locale)}
                        </span>
                      )}
                    </td>

                    <td className="num text-slate-600">
                      {student.rank ? `${student.rank} / ${student.classSize}` : "—"}
                    </td>

                    <td>
                      <label className="sr-only" htmlFor={`decision-${student.id}`}>
                        Decision pour {student.name}
                      </label>
                      <select
                        id={`decision-${student.id}`}
                        name={`decision_${student.id}`}
                        value={decisions[student.id]}
                        onChange={(event) =>
                          setDecisions((current) => ({
                            ...current,
                            [student.id]: event.target.value,
                          }))
                        }
                        className={`input py-1 text-sm ${
                          decisions[student.id] === "ADMIS"
                            ? "border-mint-200 bg-mint-50"
                            : decisions[student.id] === "REDOUBLE" ||
                                decisions[student.id] === "EXCLU"
                              ? "border-rose-200 bg-rose-50"
                              : ""
                        }`}
                      >
                        {Object.values(ENROLLMENT_DECISIONS).map((valeur) => (
                          <option key={valeur} value={valeur}>
                            {DECISION_LABELS[valeur]}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <label className="sr-only" htmlFor={`note-${student.id}`}>
                        Observation pour {student.name}
                      </label>
                      <input
                        id={`note-${student.id}`}
                        name={`note_${student.id}`}
                        defaultValue={student.decisionNote}
                        placeholder="Observation du conseil"
                        className="input py-1 text-sm"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <p className="text-sm text-slate-600">
            {compte("ADMIS")} admis · {compte("REDOUBLE")} redoublent · {compte("ORIENTE")} orientes
            · {compte("EXCLU")} exclus · {compte("EN_ATTENTE")} en attente
          </p>
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer les decisions</SubmitButton>
        </div>
      </ActionForm>

      {/* Appreciation : formulaire distinct, ouvert a la demande. */}
      {appreciationOuverte && (
        <div className="border-t border-slate-200 bg-slate-50 p-5">
          {(() => {
            const student = students.find((s) => s.id === appreciationOuverte);
            if (!student?.reportCardId) return null;

            return (
              <ActionForm action={updateReportCardAction} className="max-w-2xl space-y-3">
                <input type="hidden" name="reportCardId" value={student.reportCardId} />
                <p className="text-sm font-medium text-slate-900">
                  Appreciation — {student.name}
                </p>
                <TextAreaField
                  name="appreciation"
                  label="Appreciation generale du conseil"
                  rows={3}
                  defaultValue={student.appreciation}
                  hint="Figure sur le bulletin remis a la famille."
                />
                <input type="hidden" name="decision" value={decisions[student.id] ?? ""} />
                <div className="flex gap-2">
                  <SubmitButton className="btn-primary btn-sm">Enregistrer</SubmitButton>
                  <button
                    type="button"
                    onClick={() => setAppreciationOuverte(null)}
                    className="btn-secondary btn-sm"
                  >
                    Fermer
                  </button>
                </div>
              </ActionForm>
            );
          })()}
        </div>
      )}
    </>
  );
}
