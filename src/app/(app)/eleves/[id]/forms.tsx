"use client";

import {
  ActionForm,
  CheckboxField,
  FormGrid,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { addGuardianAction, archiveStudentAction, enrollStudentAction } from "../actions";

/** Rattachement d'un responsable legal, avec creation optionnelle d'un acces parent. */
export function GuardianForm({ studentId }: { studentId: string }) {
  return (
    <ActionForm action={addGuardianAction} className="space-y-3" resetOnSuccess>
      <input type="hidden" name="studentId" value={studentId} />

      <FormGrid cols={2}>
        <TextField name="lastName" label="Nom" required />
        <TextField name="firstName" label="Prenom" required />
        <TextField name="phone" label="Telephone" type="tel" />
        <TextField name="email" label="E-mail" type="email" />
      </FormGrid>

      <SelectField
        name="relation"
        label="Lien de parente"
        defaultValue="PERE"
        options={[
          { value: "PERE", label: "Pere" },
          { value: "MERE", label: "Mere" },
          { value: "TUTEUR", label: "Tuteur / tutrice" },
          { value: "AUTRE", label: "Autre" },
        ]}
      />

      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <CheckboxField name="canViewGrades" label="Autorise a consulter les notes" defaultChecked />
        <CheckboxField name="canViewFinance" label="Autorise a consulter la facturation" defaultChecked />
        <CheckboxField
          name="createAccount"
          label="Creer un acces a l'espace parent"
          hint="Un mot de passe provisoire sera genere ; il devra etre change a la premiere connexion."
        />
      </div>

      <SubmitButton className="btn-primary btn-sm w-full">Rattacher le responsable</SubmitButton>
    </ActionForm>
  );
}

/** Inscription d'un eleve dans une classe pour l'annee en cours. */
export function EnrollmentForm({
  studentId,
  academicYearId,
  classRooms,
}: {
  studentId: string;
  academicYearId: string;
  classRooms: { id: string; name: string; remaining: number }[];
}) {
  return (
    <ActionForm action={enrollStudentAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="academicYearId" value={academicYearId} />

      <SelectField
        name="classRoomId"
        label="Classe"
        required
        placeholder="Choisir une classe"
        options={classRooms.map((room) => ({
          value: room.id,
          label: room.remaining > 0 ? `${room.name} — ${room.remaining} place(s)` : `${room.name} — complet`,
          disabled: room.remaining <= 0,
        }))}
      />

      <SelectField
        name="kind"
        label="Type d'inscription"
        defaultValue="INSCRIPTION"
        options={[
          { value: "INSCRIPTION", label: "Premiere inscription" },
          { value: "REINSCRIPTION", label: "Reinscription" },
          { value: "TRANSFERT_ENTRANT", label: "Transfert entrant" },
        ]}
      />

      <CheckboxField
        name="applyFees"
        label="Appliquer les frais obligatoires"
        hint="Les frais configures pour cette classe seront ajoutes au compte de l'eleve."
        defaultChecked
      />

      <SubmitButton className="btn-primary btn-sm w-full">Inscrire l&apos;eleve</SubmitButton>
    </ActionForm>
  );
}

/** Enregistrement d'un depart (transfert, abandon, fin de scolarite). */
export function StudentStatusForm({ studentId }: { studentId: string }) {
  return (
    <ActionForm action={archiveStudentAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />

      <SelectField
        name="status"
        label="Nouveau statut"
        defaultValue="TRANSFERRED"
        options={[
          { value: "TRANSFERRED", label: "Transfere vers un autre etablissement" },
          { value: "DROPPED", label: "Abandon de scolarite" },
          { value: "GRADUATED", label: "Scolarite achevee (diplome)" },
          { value: "ARCHIVED", label: "Archive" },
        ]}
      />

      <TextAreaField name="reason" label="Motif" required rows={2} hint="Ce motif figure dans le journal d'audit." />

      <SubmitButton
        className="btn-danger btn-sm w-full"
        confirm="Confirmer le changement de statut de cet eleve ? Son historique sera conserve."
      >
        Enregistrer le depart
      </SubmitButton>
    </ActionForm>
  );
}
