"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client/form";
import { updateMembershipPermissionsAction } from "./actions";

type Group = {
  label: string;
  permissions: { code: string; label: string }[];
};

/**
 * Editeur de permissions d'un rattachement.
 *
 * L'ecart par rapport au role est signale visuellement : un administrateur
 * doit voir d'un coup d'oeil ce qui a ete ajoute ou retire, sinon une
 * surcharge oubliee devient une faille silencieuse.
 */
export function MembershipPermissionsEditor({
  membershipId,
  userName,
  roleName,
  groups,
  rolePermissions,
  effectivePermissions,
  readOnly,
  readOnlyReason,
}: {
  membershipId: string;
  userName: string;
  roleName: string;
  groups: Group[];
  rolePermissions: string[];
  effectivePermissions: string[];
  readOnly: boolean;
  readOnlyReason?: string;
}) {
  const roleSet = new Set(rolePermissions);
  const [checked, setChecked] = useState<Set<string>>(new Set(effectivePermissions));

  const added = [...checked].filter((code) => !roleSet.has(code));
  const removed = rolePermissions.filter((code) => !checked.has(code));

  const toggle = (code: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        {userName} — role {roleName}. Une case qui s&apos;ecarte du role apparait en couleur :
        vert si la permission est ajoutee, rouge si elle est retiree.
      </p>

      {readOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {readOnlyReason ?? "Ces permissions ne sont pas modifiables depuis cet ecran."}
        </p>
      ) : (
        <ActionForm action={updateMembershipPermissionsAction}>
          <input type="hidden" name="membershipId" value={membershipId} />

          <div className="max-h-96 space-y-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
            {groups.map((group) => (
              <fieldset key={group.label}>
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </legend>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {group.permissions.map((permission) => {
                    const inRole = roleSet.has(permission.code);
                    const isChecked = checked.has(permission.code);
                    const differs = inRole !== isChecked;

                    return (
                      <label
                        key={permission.code}
                        className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${
                          differs
                            ? isChecked
                              ? "bg-mint-50 text-mint-700"
                              : "bg-rose-50 text-rose-700"
                            : "text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="permissions"
                          value={permission.code}
                          checked={isChecked}
                          onChange={() => toggle(permission.code)}
                          className="mt-0.5 size-4 shrink-0 rounded border-slate-300"
                        />
                        <span>
                          {permission.label}
                          <span className="block font-mono text-[11px] text-slate-400">
                            {permission.code}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {added.length === 0 && removed.length === 0
                ? "Aucun ecart avec le role."
                : `${added.length} ajoutee(s), ${removed.length} retiree(s) par rapport au role.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChecked(new Set(rolePermissions))}
                className="btn-secondary btn-sm"
              >
                Revenir au role
              </button>
              <SubmitButton className="btn-primary btn-sm" pendingLabel="Enregistrement…">
                Enregistrer
              </SubmitButton>
            </div>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
