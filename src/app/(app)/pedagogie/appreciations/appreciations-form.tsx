"use client";

import { ActionForm, SubmitButton } from "@/components/client/form";
import { saveSubjectAppreciationsAction } from "./actions";

/**
 * Saisie en lot des appreciations d'une matiere.
 *
 * Aucune suggestion automatique n'est proposee ici : une appreciation par
 * matiere engage l'enseignant, elle ne doit pas etre pre-remplie par le
 * systeme.
 */
export function SubjectAppreciationsForm({
  classRoomId,
  subjectId,
  gradingPeriodId,
  students,
}: {
  classRoomId: string;
  subjectId: string;
  gradingPeriodId: string;
  students: { id: string; matricule: string; name: string; text: string }[];
}) {
  return (
    <ActionForm action={saveSubjectAppreciationsAction}>
      <input type="hidden" name="classRoomId" value={classRoomId} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="gradingPeriodId" value={gradingPeriodId} />

      <ul className="divide-y divide-slate-100">
        {students.map((student) => (
          <li key={student.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start">
            <div className="sm:w-56 sm:shrink-0">
              <span className="block text-sm font-medium text-slate-900">{student.name}</span>
              <span className="font-mono text-xs text-slate-400">{student.matricule}</span>
            </div>
            <div className="flex-1">
              <label className="sr-only" htmlFor={`appreciation-${student.id}`}>
                Appreciation pour {student.name}
              </label>
              <textarea
                id={`appreciation-${student.id}`}
                name={`appreciation_${student.id}`}
                defaultValue={student.text}
                rows={2}
                maxLength={400}
                placeholder="Appreciation de la matiere (400 caracteres maximum)"
                className="input text-sm"
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end border-t border-slate-200 px-5 py-4">
        <SubmitButton pendingLabel="Enregistrement…">
          Enregistrer les appreciations
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
