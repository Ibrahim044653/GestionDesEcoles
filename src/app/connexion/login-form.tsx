"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/client/form";
import { loginAction } from "./actions";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} className="space-y-4">
      <TextField
        name="email"
        label="Adresse e-mail"
        type="email"
        required
        autoComplete="username"
        placeholder="prenom.nom@etablissement.ci"
      />
      <TextField
        name="password"
        label="Mot de passe"
        type="password"
        required
        autoComplete="current-password"
      />

      <div className="pt-1">
        <SubmitButton className="btn-primary w-full" pendingLabel="Connexion en cours…">
          Se connecter
        </SubmitButton>
      </div>

      <p className="pt-1 text-center text-xs text-slate-500">
        Mot de passe oublie ? Contactez l&apos;administration de votre etablissement, qui peut le
        reinitialiser depuis la gestion des utilisateurs.
      </p>
    </ActionForm>
  );
}
