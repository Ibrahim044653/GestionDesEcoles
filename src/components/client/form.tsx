"use client";

import {
  createContext,
  useActionState,
  useContext,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/errors";

/**
 * Formulaires relies aux Server Actions.
 *
 * Chaque formulaire gere : etat de chargement, message global, et erreurs
 * rattachees aux champs renvoyees par la validation SERVEUR (les messages
 * proviennent de Zod cote serveur, jamais d'une validation uniquement client).
 */

type FormState = ActionResult<unknown> | null;

const FormContext = createContext<{ state: FormState; pending: boolean }>({
  state: null,
  pending: false,
});

export function useFormState() {
  return useContext(FormContext);
}

export type ServerAction = (state: FormState, formData: FormData) => Promise<ActionResult<unknown>>;

export function ActionForm({
  action,
  children,
  className,
  /** Reinitialise les champs apres un succes (saisie a la chaine). */
  resetOnSuccess = false,
  onSuccessMessage,
  id,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccessMessage?: string;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Vide le formulaire une fois l'enregistrement confirme par le serveur.
  if (resetOnSuccess && state?.ok && formRef.current) {
    formRef.current.reset();
  }

  const contextValue = useMemo(() => ({ state, pending }), [state, pending]);

  return (
    <FormContext.Provider value={contextValue}>
      <form ref={formRef} action={formAction} className={className} id={id} noValidate>
        {state && !state.ok && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            <p className="font-semibold">{state.error}</p>
            {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                {Object.entries(state.fieldErrors).flatMap(([field, messages]) =>
                  messages.map((message) => <li key={`${field}-${message}`}>{message}</li>),
                )}
              </ul>
            )}
          </div>
        )}

        {state?.ok && (onSuccessMessage || state.message) && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded-xl border border-mint-200 bg-mint-50 px-4 py-3 text-sm text-mint-700"
          >
            {state.message ?? onSuccessMessage}
          </div>
        )}

        {children}
      </form>
    </FormContext.Provider>
  );
}

/** Bouton de soumission : desactive et explicite pendant l'envoi. */
export function SubmitButton({
  children,
  pendingLabel = "Enregistrement…",
  className = "btn-primary",
  /** Message de confirmation pour une action sensible (suppression, annulation). */
  confirm,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
  name?: string;
  value?: string;
  /** Desactivation metier, independante de l'etat d'envoi. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending}
      className={className}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

function useFieldError(name: string): string | undefined {
  const { state } = useFormState();
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[name]?.[0];
}

type BaseFieldProps = {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

export function TextField({
  name,
  label,
  hint,
  required,
  className,
  type = "text",
  defaultValue,
  placeholder,
  autoComplete,
  readOnly,
  min,
  max,
  step,
  inputMode,
}: BaseFieldProps & {
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email";
}) {
  const id = useId();
  const error = useFieldError(name);

  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        readOnly={readOnly}
        required={required}
        min={min}
        max={max}
        step={step}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`input ${error ? "input-error" : ""}`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  required,
  className,
  defaultValue,
  rows = 4,
  placeholder,
}: BaseFieldProps & { defaultValue?: string; rows?: number; placeholder?: string }) {
  const id = useId();
  const error = useFieldError(name);

  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`input ${error ? "input-error" : ""}`}
      />
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function SelectField({
  name,
  label,
  hint,
  required,
  className,
  defaultValue,
  options,
  placeholder,
}: BaseFieldProps & {
  defaultValue?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}) {
  const id = useId();
  const error = useFieldError(name);

  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`input ${error ? "input-error" : ""}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
  className,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={`flex items-start gap-2.5 ${className ?? ""}`}>
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export function FileField({
  name,
  label,
  hint,
  required,
  accept,
  className,
}: BaseFieldProps & { accept?: string }) {
  const id = useId();
  const error = useFieldError(name);

  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-600
                   file:mr-3 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-4 file:py-2
                   file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Disposition en grille pour les champs d'un formulaire. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const gridClass = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[cols];
  return <div className={`grid grid-cols-1 gap-4 ${gridClass}`}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
      {children}
    </div>
  );
}

/** Champ cache portant une cle d'idempotence stable pour la duree du montage. */
export function IdempotencyKeyField({ name = "idempotencyKey" }: { name?: string }) {
  const key = useId();
  const stable = useMemo(
    () => `${key}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    [key],
  );
  return <input type="hidden" name={name} value={stable} />;
}
