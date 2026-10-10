"use client";

import { ActionForm, FormActions, SubmitButton, TextField } from "@/components/client/form";
import { changePasswordAction } from "@/app/connexion/actions";

/**
 * Changement de mot de passe.
 *
 * La politique est verifiee cote serveur ; elle est rappelee ici pour que
 * l'utilisateur sache a quoi s'attendre avant de soumettre.
 */
export function ChangePasswordForm({ minLength }: { minLength: number }) {
  return (
    <ActionForm action={changePasswordAction}>
      <div className="max-w-md space-y-4">
        <TextField
          name="currentPassword"
          label="Mot de passe actuel"
          type="password"
          required
          autoComplete="current-password"
        />
        <TextField
          name="newPassword"
          label="Nouveau mot de passe"
          type="password"
          required
          autoComplete="new-password"
          hint={`Au moins ${minLength} caracteres, avec majuscule, minuscule, chiffre et caractere special.`}
        />
        <TextField
          name="confirmPassword"
          label="Confirmer le nouveau mot de passe"
          type="password"
          required
          autoComplete="new-password"
        />
      </div>

      <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
        Pour votre securite, toutes vos autres sessions seront fermees apres ce changement.
      </p>

      <FormActions>
        <SubmitButton pendingLabel="Modification…">Changer le mot de passe</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
