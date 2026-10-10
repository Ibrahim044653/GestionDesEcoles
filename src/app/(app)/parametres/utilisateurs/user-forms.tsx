"use client";

import {
  ActionForm,
  FormGrid,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/client/form";
import {
  createMembershipAction,
  resetUserPasswordAction,
  toggleMembershipAction,
} from "./actions";

/** Rattachement d'un compte (existant ou nouveau) a l'etablissement. */
export function MembershipForm({ roles }: { roles: { code: string; label: string }[] }) {
  return (
    <ActionForm action={createMembershipAction} className="space-y-3" resetOnSuccess>
      <TextField
        name="email"
        label="Adresse e-mail"
        type="email"
        required
        hint="Si le compte existe deja, il sera simplement rattache a cet etablissement."
      />

      <FormGrid cols={2}>
        <TextField name="lastName" label="Nom" hint="Requis si le compte n'existe pas." />
        <TextField name="firstName" label="Prenom" />
      </FormGrid>

      <SelectField
        name="roleCode"
        label="Role"
        required
        placeholder="Choisir un role"
        options={roles.map((role) => ({ value: role.code, label: role.label }))}
      />

      <SubmitButton className="btn-primary btn-sm w-full">Rattacher</SubmitButton>
    </ActionForm>
  );
}

/** Suspension / reactivation d'un rattachement. */
export function ToggleMembershipButton({
  membershipId,
  suspended,
}: {
  membershipId: string;
  suspended: boolean;
}) {
  return (
    <ActionForm action={toggleMembershipAction} className="inline-block">
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
      <SubmitButton
        className={suspended ? "btn-secondary btn-sm" : "btn-ghost btn-sm text-rose-700"}
        confirm={
          suspended
            ? undefined
            : "Suspendre cet acces ? Les sessions en cours seront fermees immediatement."
        }
      >
        {suspended ? "Reactiver" : "Suspendre"}
      </SubmitButton>
    </ActionForm>
  );
}

/** Reinitialisation du mot de passe d'un utilisateur. */
export function ResetPasswordButton({ userId }: { userId: string }) {
  return (
    <ActionForm action={resetUserPasswordAction} className="inline-block">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton
        className="btn-ghost btn-sm"
        confirm={
          "Reinitialiser le mot de passe de cet utilisateur ?\n\n" +
          "Un mot de passe provisoire sera genere et affiche UNE SEULE FOIS. " +
          "Toutes ses sessions seront fermees."
        }
      >
        Reinitialiser
      </SubmitButton>
    </ActionForm>
  );
}
