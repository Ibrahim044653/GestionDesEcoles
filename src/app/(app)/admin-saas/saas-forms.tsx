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
  createClientAction,
  replySupportTicketAction,
  updateSubscriptionStatusAction,
} from "./actions";

const STATUS_OPTIONS = [
  { value: "TRIAL", label: "Essai" },
  { value: "ACTIVE", label: "Actif" },
  { value: "PAST_DUE", label: "Impaye" },
  { value: "SUSPENDED", label: "Suspendu" },
  { value: "CANCELLED", label: "Resilie" },
];

/**
 * Changement d'etat d'un abonnement.
 * Les transitions restrictives (suspension, resiliation) sont confirmees
 * explicitement, avec rappel que les donnees ne sont pas supprimees.
 */
export function SubscriptionStatusForm({
  subscriptionId,
  currentStatus,
}: {
  subscriptionId: string;
  currentStatus: string;
}) {
  const [status, setStatus] = useState(currentStatus);

  const confirmMessage =
    status === "SUSPENDED"
      ? "Suspendre cet abonnement ?\n\nL'acces applicatif sera bloque pour tous les utilisateurs de l'organisation. AUCUNE donnee ne sera supprimee."
      : status === "CANCELLED"
        ? "Resilier cet abonnement ?\n\nL'acces sera bloque. Les donnees sont conservees : proposez un export complet au client."
        : undefined;

  return (
    <ActionForm action={updateSubscriptionStatusAction} className="flex items-end gap-2">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />

      <div>
        <label htmlFor={`status-${subscriptionId}`} className="sr-only">
          Statut de l&apos;abonnement
        </label>
        <select
          id={`status-${subscriptionId}`}
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="input py-1 text-xs"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton
        className="btn-secondary btn-sm"
        disabled={status === currentStatus}
        confirm={confirmMessage}
      >
        Appliquer
      </SubmitButton>
    </ActionForm>
  );
}

/**
 * Reponse a un ticket d'assistance.
 *
 * Le statut est choisi explicitement : repondre ne ferme pas automatiquement
 * un ticket, et fermer sans repondre n'est pas possible.
 */
export function TicketReplyForm({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        Repondre
      </button>
    );
  }

  return (
    <ActionForm action={replySupportTicketAction} className="mt-2 space-y-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <TextAreaField
        name="reply"
        label="Reponse"
        rows={3}
        required
        hint="Transmise au demandeur sous forme de notification."
      />
      <SelectField
        name="status"
        label="Statut apres reponse"
        defaultValue={currentStatus === "OPEN" ? "PENDING" : currentStatus}
        options={[
          { value: "PENDING", label: "En cours de traitement" },
          { value: "RESOLVED", label: "Resolu" },
          { value: "CLOSED", label: "Clos" },
          { value: "OPEN", label: "Laisser ouvert" },
        ]}
      />
      <div className="flex gap-2">
        <SubmitButton className="btn-primary btn-sm" pendingLabel="Envoi…">
          Envoyer la reponse
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
          Annuler
        </button>
      </div>
    </ActionForm>
  );
}

const SCHOOL_TYPES = [
  { value: "PRESCOLAIRE", label: "Prescolaire" },
  { value: "PRIMAIRE", label: "Primaire" },
  { value: "COLLEGE", label: "College" },
  { value: "LYCEE", label: "Lycee" },
  { value: "UNIVERSITE", label: "Universite" },
  { value: "FORMATION_PRO", label: "Formation professionnelle" },
];

/**
 * Creation d'un client : organisation, premier etablissement, compte
 * proprietaire et abonnement, en une seule operation.
 *
 * Le mot de passe provisoire s'affiche UNE SEULE FOIS apres creation. Il
 * n'est pas renvoye par la suite : il faudrait alors le reinitialiser.
 */
export function NewClientForm({ plans }: { plans: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

  if (plans.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Aucune formule d&apos;abonnement active : impossible de creer un client.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        Nouveau client
      </button>
    );
  }

  return (
    <ActionForm action={createClientAction}>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Le client</legend>
        <FormGrid cols={2}>
          <TextField
            name="organizationName"
            label="Nom du client"
            required
            placeholder="Ex. : Groupe Scolaire Excellence"
            hint="L'entite qui souscrit. Elle peut detenir plusieurs etablissements."
          />
          <TextField name="country" label="Pays" defaultValue="CI" />
        </FormGrid>
      </fieldset>

      <fieldset className="mt-6 space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Premier etablissement</legend>
        <FormGrid cols={2}>
          <TextField name="schoolName" label="Nom de l'etablissement" required />
          <SelectField name="schoolType" label="Type" required options={SCHOOL_TYPES} />
          <TextField name="city" label="Ville" />
          <TextField name="phone" label="Telephone" />
          <TextField name="schoolEmail" label="E-mail de l'etablissement" className="sm:col-span-2" />
        </FormGrid>
      </fieldset>

      <fieldset className="mt-6 space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Compte proprietaire</legend>
        <FormGrid cols={2}>
          <TextField name="ownerFirstName" label="Prenom" required />
          <TextField name="ownerLastName" label="Nom" required />
          <TextField
            name="ownerEmail"
            label="E-mail"
            type="email"
            required
            hint="Si ce compte existe deja, il est reutilise et son mot de passe reste inchange."
          />
          <TextField name="ownerPhone" label="Telephone" />
        </FormGrid>
      </fieldset>

      <fieldset className="mt-6 space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Abonnement</legend>
        <FormGrid cols={2}>
          <SelectField
            name="planId"
            label="Formule"
            required
            options={plans.map((p) => ({ value: p.id, label: p.label }))}
          />
          <TextField
            name="trialDays"
            label="Jours d'essai"
            type="number"
            min={0}
            max={365}
            defaultValue={30}
            hint="0 pour un abonnement actif immediatement."
          />
        </FormGrid>
      </fieldset>

      <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        L&apos;etablissement est cree avec son <strong>plan comptable SYSCOHADA</strong>, pret a
        encaisser. L&apos;annee scolaire, les classes, les matieres et les frais restent a
        configurer par le proprietaire : ces choix engagent sa pedagogie et sa tarification, les
        deviner produirait une configuration plausible mais fausse.
      </p>

      <FormActions>
        <SubmitButton pendingLabel="Creation…">Creer le client</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Annuler
        </button>
      </FormActions>
    </ActionForm>
  );
}
