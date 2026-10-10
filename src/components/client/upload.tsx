"use client";

import { useState } from "react";
import Image from "next/image";
import { ActionForm, FileField, SelectField, SubmitButton } from "@/components/client/form";
import type { ServerAction } from "@/components/client/form";

/**
 * Formulaires de televersement.
 *
 * Les controles reels (taille, type binaire, portee) sont faits cote serveur
 * par `storeUploadedFile`. Les attributs `accept` ci-dessous ne sont qu'une
 * aide a la selection, jamais une protection.
 */

/** Televersement simple, replie derriere un bouton. */
export function UploadButton({
  action,
  hiddenFields,
  label,
  fieldLabel,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  hint,
  className = "btn-secondary btn-sm",
}: {
  action: ServerAction;
  hiddenFields?: Record<string, string>;
  label: string;
  fieldLabel: string;
  accept?: string;
  hint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
      <ActionForm action={action} className="space-y-3" resetOnSuccess>
        {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <FileField name="file" label={fieldLabel} required accept={accept} hint={hint} />

        <div className="flex gap-2">
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Envoi…">
            Televerser
          </SubmitButton>
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">
            Annuler
          </button>
        </div>
      </ActionForm>
    </div>
  );
}

/**
 * Televersement d'une image avec apercu de l'existant.
 * L'image est servie par /api/files/[id], jamais depuis un chemin public.
 */
export function ImageUpload({
  action,
  hiddenFields,
  currentDocumentId,
  label,
  emptyLabel,
  width = 120,
  height = 150,
}: {
  action: ServerAction;
  hiddenFields?: Record<string, string>;
  currentDocumentId: string | null;
  label: string;
  emptyLabel: string;
  width?: number;
  height?: number;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
        style={{ width, height }}
      >
        {currentDocumentId ? (
          <Image
            src={`/api/files/${currentDocumentId}`}
            alt={label}
            width={width}
            height={height}
            // Image nominative servie sous controle : pas d'optimisation
            // intermediaire, qui en ferait une copie publique en cache.
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="px-2 text-center text-xs text-slate-400">{emptyLabel}</span>
        )}
      </div>

      <div className="min-w-56 flex-1">
        <ActionForm action={action} className="space-y-3" resetOnSuccess>
          {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <FileField
            name="file"
            label={label}
            required
            accept="image/jpeg,image/png,image/webp"
            hint="JPEG, PNG ou WebP. L'image precedente est remplacee."
          />

          <SubmitButton className="btn-primary btn-sm" pendingLabel="Envoi…">
            {currentDocumentId ? "Remplacer" : "Televerser"}
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}

/** Televersement d'un document de dossier, avec choix de la nature. */
export function StudentDocumentUpload({
  action,
  studentId,
}: {
  action: ServerAction;
  studentId: string;
}) {
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      <input type="hidden" name="studentId" value={studentId} />

      <SelectField
        name="kind"
        label="Nature du document"
        defaultValue="AUTRE"
        options={[
          { value: "CERTIFICAT", label: "Acte de naissance / certificat" },
          { value: "BULLETIN", label: "Bulletin anterieur" },
          { value: "CARTE", label: "Piece d'identite" },
          { value: "AUTRE", label: "Autre document" },
        ]}
      />

      <FileField
        name="file"
        label="Fichier"
        required
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hint="PDF ou image. Conserve dans l'espace prive de l'etablissement."
      />

      <SubmitButton className="btn-primary btn-sm w-full" pendingLabel="Envoi…">
        Ajouter au dossier
      </SubmitButton>
    </ActionForm>
  );
}
