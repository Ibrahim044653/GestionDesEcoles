"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client/form";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS } from "@/lib/constants";
import { saveAttendanceAction } from "../actions";

type Row = {
  id: string;
  matricule: string;
  name: string;
  status: string;
  minutesLate: number;
};

/**
 * Feuille d'appel.
 *
 * Tout le monde est present par defaut : l'enseignant ne signale que les
 * exceptions, ce qui correspond a l'usage reel et reduit les erreurs de saisie.
 */
export function AttendanceSheet({
  classRoomId,
  date,
  subjectId,
  students,
}: {
  classRoomId: string;
  date: string;
  subjectId: string | null;
  students: Row[];
}) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(students.map((student) => [student.id, student.status])),
  );

  const counts = students.reduce<Record<string, number>>((accumulator, student) => {
    const status = statuses[student.id];
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});

  const setAll = (status: string) =>
    setStatuses(Object.fromEntries(students.map((student) => [student.id, status])));

  return (
    <ActionForm action={saveAttendanceAction}>
      <input type="hidden" name="classRoomId" value={classRoomId} />
      <input type="hidden" name="date" value={date} />
      {subjectId && <input type="hidden" name="subjectId" value={subjectId} />}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
        <span className="text-xs text-slate-500">Tout marquer :</span>
        <button type="button" onClick={() => setAll("PRESENT")} className="btn-secondary btn-sm">
          Present
        </button>
        <button type="button" onClick={() => setAll("ABSENT")} className="btn-secondary btn-sm">
          Absent
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Eleve</th>
              <th>Statut</th>
              <th style={{ width: 130 }}>Retard (min)</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td className="font-mono text-xs text-slate-500">{student.matricule}</td>
                <td className="font-medium text-slate-900">{student.name}</td>
                <td>
                  <label className="sr-only" htmlFor={`statut-${student.id}`}>
                    Statut de {student.name}
                  </label>
                  <select
                    id={`statut-${student.id}`}
                    name={`statut_${student.id}`}
                    value={statuses[student.id]}
                    onChange={(event) =>
                      setStatuses((current) => ({ ...current, [student.id]: event.target.value }))
                    }
                    className={`input py-1 text-sm ${
                      statuses[student.id] === "ABSENT"
                        ? "border-rose-300 bg-rose-50"
                        : statuses[student.id] === "RETARD"
                          ? "border-amber-300 bg-amber-50"
                          : ""
                    }`}
                  >
                    {Object.values(ATTENDANCE_STATUSES).map((status) => (
                      <option key={status} value={status}>
                        {ATTENDANCE_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {statuses[student.id] === "RETARD" && (
                    <>
                      <label className="sr-only" htmlFor={`retard-${student.id}`}>
                        Minutes de retard de {student.name}
                      </label>
                      <input
                        id={`retard-${student.id}`}
                        name={`retard_${student.id}`}
                        type="number"
                        min={0}
                        max={600}
                        defaultValue={student.minutesLate || 10}
                        className="input py-1 text-right text-sm"
                      />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <p className="text-sm text-slate-600">
          {counts.PRESENT ?? 0} present(s) · {counts.ABSENT ?? 0} absent(s) ·{" "}
          {counts.RETARD ?? 0} retard(s)
        </p>
        <SubmitButton pendingLabel="Enregistrement…">
          Enregistrer l&apos;appel
        </SubmitButton>
      </div>

      <p className="px-5 pb-4 text-xs text-slate-500">
        Les familles des eleves marques absents recevront une notification.
      </p>
    </ActionForm>
  );
}
