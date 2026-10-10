"use client";

import {
  ActionForm,
  FormActions,
  FormGrid,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/client/form";
import { createStudentAction, updateStudentAction } from "./actions";

/**
 * Formulaire de dossier eleve, partage entre creation et modification.
 * La validation affichee provient du serveur (Zod), pas du navigateur.
 */
export function StudentForm({
  mode,
  student,
  academicYear,
  classRooms = [],
}: {
  mode: "create" | "edit";
  student?: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    gender: string;
    birthDate: string;
    birthPlace: string;
    nationality: string;
    email: string;
    phone: string;
    address: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    previousSchool: string;
    bloodGroup: string;
    medicalNotes: string;
  };
  academicYear?: { id: string; name: string } | null;
  classRooms?: { id: string; name: string; level: string; remaining: number }[];
}) {
  const isCreate = mode === "create";

  return (
    <ActionForm
      action={isCreate ? createStudentAction : updateStudentAction}
      onSuccessMessage={isCreate ? "Eleve enregistre." : "Dossier mis a jour."}
    >
      {!isCreate && student && <input type="hidden" name="studentId" value={student.id} />}

      <fieldset className="space-y-4">
        <legend className="label-caps mb-3 text-slate-500">Identite</legend>
        <FormGrid cols={3}>
          <TextField name="lastName" label="Nom" required defaultValue={student?.lastName} autoComplete="family-name" />
          <TextField name="firstName" label="Prenom(s)" required defaultValue={student?.firstName} autoComplete="given-name" />
          <SelectField
            name="gender"
            label="Sexe"
            defaultValue={student?.gender ?? "UNSPECIFIED"}
            options={[
              { value: "UNSPECIFIED", label: "Non precise" },
              { value: "F", label: "Feminin" },
              { value: "M", label: "Masculin" },
            ]}
          />
          <TextField
            name="matricule"
            label="Matricule"
            defaultValue={student?.matricule}
            readOnly={!isCreate}
            hint={isCreate ? "Laisser vide pour une attribution automatique." : "Le matricule n'est pas modifiable."}
          />
          <TextField name="birthDate" label="Date de naissance" type="date" defaultValue={student?.birthDate} />
          <TextField name="birthPlace" label="Lieu de naissance" defaultValue={student?.birthPlace} />
          <TextField name="nationality" label="Nationalite" defaultValue={student?.nationality ?? "CI"} hint="Code pays sur 2 lettres." />
        </FormGrid>
      </fieldset>

      <fieldset className="mt-8 space-y-4">
        <legend className="label-caps mb-3 text-slate-500">Coordonnees</legend>
        <FormGrid cols={3}>
          <TextField name="phone" label="Telephone" type="tel" defaultValue={student?.phone} />
          <TextField name="email" label="Adresse e-mail" type="email" defaultValue={student?.email} />
          <TextField name="address" label="Adresse" defaultValue={student?.address} className="sm:col-span-2 lg:col-span-1" />
          <TextField name="emergencyContactName" label="Contact d'urgence" defaultValue={student?.emergencyContactName} />
          <TextField name="emergencyContactPhone" label="Telephone d'urgence" type="tel" defaultValue={student?.emergencyContactPhone} />
          <TextField name="previousSchool" label="Etablissement precedent" defaultValue={student?.previousSchool} />
        </FormGrid>
      </fieldset>

      <fieldset className="mt-8 space-y-4">
        <legend className="label-caps mb-3 text-slate-500">Informations medicales</legend>
        <FormGrid cols={3}>
          <TextField name="bloodGroup" label="Groupe sanguin" defaultValue={student?.bloodGroup} />
          <TextAreaField
            name="medicalNotes"
            label="Observations medicales"
            rows={3}
            defaultValue={student?.medicalNotes}
            hint="Allergies, traitements, informations utiles a l'infirmerie."
            className="sm:col-span-2"
          />
        </FormGrid>
      </fieldset>

      {isCreate && academicYear && classRooms.length > 0 && (
        <fieldset className="mt-8 space-y-4">
          <legend className="label-caps mb-3 text-slate-500">Inscription ({academicYear.name})</legend>
          <input type="hidden" name="academicYearId" value={academicYear.id} />
          <FormGrid cols={2}>
            <SelectField
              name="classRoomId"
              label="Classe d'affectation"
              placeholder="Ne pas inscrire pour le moment"
              options={classRooms.map((room) => ({
                value: room.id,
                label:
                  room.remaining > 0
                    ? `${room.name} (${room.level}) — ${room.remaining} place(s)`
                    : `${room.name} (${room.level}) — complet`,
                disabled: room.remaining <= 0,
              }))}
              hint="Les frais obligatoires de la classe seront appliques automatiquement."
            />
          </FormGrid>
        </fieldset>
      )}

      <FormActions>
        <a href={isCreate ? "/eleves" : `/eleves/${student?.id}`} className="btn-secondary">
          Annuler
        </a>
        <SubmitButton>{isCreate ? "Creer le dossier" : "Enregistrer les modifications"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
