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
  createStaffLeaveAction,
  reviewStaffLeaveAction,
  saveStaffAttendanceAction,
} from "./actions";

type StaffRow = {
  id: string;
  name: string;
  jobTitle: string;
  status: string;
  minutesLate: number;
  note: string;
  onApprovedLeave: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  RETARD: "Retard",
  CONGE: "Conge",
};

/** Feuille de presence d'une journee. */
export function StaffAttendanceForm({ date, staff }: { date: string; staff: StaffRow[] }) {
  const [statuses, setStatuses] = useState<Record<string, string>>(
    Object.fromEntries(staff.map((member) => [member.id, member.status])),
  );

  const count = (value: string) =>
    staff.filter((member) => statuses[member.id] === value).length;

  return (
    <ActionForm action={saveStaffAttendanceAction}>
      <input type="hidden" name="date" value={date} />

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Membre du personnel</th>
              <th style={{ width: 150 }}>Statut</th>
              <th style={{ width: 120 }}>Retard (min)</th>
              <th>Observation</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id}>
                <td>
                  <input type="hidden" name="staffIds" value={member.id} />
                  <span className="block text-sm font-medium text-slate-900">{member.name}</span>
                  <span className="text-xs text-slate-400">{member.jobTitle}</span>
                  {member.onApprovedLeave && (
                    <span className="mt-0.5 block text-xs text-sky-700">
                      Conge approuve couvrant cette date.
                    </span>
                  )}
                </td>
                <td>
                  <label className="sr-only" htmlFor={`status-${member.id}`}>
                    Statut de {member.name}
                  </label>
                  <select
                    id={`status-${member.id}`}
                    name={`status_${member.id}`}
                    value={statuses[member.id]}
                    onChange={(event) =>
                      setStatuses((current) => ({ ...current, [member.id]: event.target.value }))
                    }
                    className={`input py-1 text-sm ${
                      statuses[member.id] === "ABSENT"
                        ? "border-rose-200 bg-rose-50"
                        : statuses[member.id] === "RETARD"
                          ? "border-amber-200 bg-amber-50"
                          : ""
                    }`}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`late-${member.id}`}>
                    Minutes de retard de {member.name}
                  </label>
                  <input
                    id={`late-${member.id}`}
                    name={`late_${member.id}`}
                    type="number"
                    min={0}
                    max={1440}
                    defaultValue={member.minutesLate || ""}
                    disabled={statuses[member.id] !== "RETARD"}
                    className="input py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`note-${member.id}`}>
                    Observation pour {member.name}
                  </label>
                  <input
                    id={`note-${member.id}`}
                    name={`note_${member.id}`}
                    defaultValue={member.note}
                    maxLength={300}
                    className="input py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <p className="text-sm text-slate-600">
          {count("PRESENT")} presents · {count("RETARD")} retards · {count("ABSENT")} absents ·{" "}
          {count("CONGE")} en conge
        </p>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer la feuille</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Saisie d'une demande de conge. */
export function StaffLeaveForm({ staff }: { staff: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary btn-sm">
        Enregistrer un conge
      </button>
    );
  }

  return (
    <ActionForm action={createStaffLeaveAction}>
      <FormGrid cols={2}>
        <SelectField
          name="staffId"
          label="Membre du personnel"
          required
          options={staff.map((member) => ({ value: member.id, label: member.name }))}
        />
        <SelectField
          name="kind"
          label="Type"
          required
          options={[
            { value: "CONGE", label: "Conge" },
            { value: "MALADIE", label: "Maladie" },
            { value: "MATERNITE", label: "Maternite" },
            { value: "AUTRE", label: "Autre" },
          ]}
        />
        <TextField name="startDate" label="Du" type="date" required />
        <TextField name="endDate" label="Au" type="date" required />
      </FormGrid>

      <div className="mt-4">
        <TextAreaField name="reason" label="Motif" rows={2} />
      </div>

      <FormActions>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Annuler
        </button>
      </FormActions>
    </ActionForm>
  );
}

/** Approbation ou refus d'un conge. */
export function LeaveReviewActions({ leaveId }: { leaveId: string }) {
  const [refusing, setRefusing] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ActionForm action={reviewStaffLeaveAction}>
          <input type="hidden" name="leaveId" value={leaveId} />
          <input type="hidden" name="status" value="APPROVED" />
          <SubmitButton
            className="btn-primary btn-sm"
            confirm="Approuver ce conge ? Les journees concernees seront marquees en conge."
            pendingLabel="…"
          >
            Approuver
          </SubmitButton>
        </ActionForm>

        <button
          type="button"
          onClick={() => setRefusing((open) => !open)}
          className="btn-ghost btn-sm"
        >
          {refusing ? "Annuler" : "Refuser"}
        </button>
      </div>

      {refusing && (
        <ActionForm action={reviewStaffLeaveAction} className="space-y-2">
          <input type="hidden" name="leaveId" value={leaveId} />
          <input type="hidden" name="status" value="REJECTED" />
          <TextAreaField name="reason" label="Motif du refus" rows={2} required />
          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
            Confirmer le refus
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
