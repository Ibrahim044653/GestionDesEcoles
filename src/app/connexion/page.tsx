import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  // Un utilisateur deja authentifie n'a rien a faire sur cet ecran.
  const context = await getAuthContext();
  if (context) redirect("/tableau-de-bord");

  const showDemoAccounts = !env.isProduction;

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Colonne de presentation */}
      <section className="relative flex flex-col justify-between bg-brand-800 px-8 py-10 text-white lg:w-[46%] lg:px-12 lg:py-14">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white text-base font-bold text-brand-700">
            GE
          </span>
          <span className="text-lg font-semibold">Gestion Ecole</span>
        </div>

        <div className="my-10 max-w-lg">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
            La gestion complete de votre etablissement, du prescolaire a l&apos;universite.
          </h1>
          <p className="mt-4 text-brand-100">
            Eleves, pedagogie, frais de scolarite, encaissements, justificatifs, comptabilite et
            espace parents — dans un seul espace securise, par etablissement.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-brand-100">
            {[
              "Donnees strictement isolees entre etablissements",
              "Justificatifs de paiement verifies avant tout encaissement",
              "Comptabilite en partie double, adaptable au SYSCOHADA",
              "Bulletins, recus et certificats generes en PDF",
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2.5">
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 13 4.5 4.5L19 7" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-brand-300">
          Plateforme conçue pour les etablissements prives de Cote d&apos;Ivoire et d&apos;Afrique de
          l&apos;Ouest.
        </p>
      </section>

      {/* Colonne de connexion */}
      <section className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Connexion</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Saisissez les identifiants fournis par votre etablissement.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>

          {showDemoAccounts && <DemoAccounts />}
        </div>
      </section>
    </main>
  );
}

/**
 * Aide a la decouverte, affichee UNIQUEMENT hors production.
 * Les comptes listes sont ceux du seed de demonstration.
 */
function DemoAccounts() {
  const accounts = [
    { role: "Proprietaire", email: "proprietaire@exemple.test" },
    { role: "Directeur", email: "directeur@exemple.test" },
    { role: "Comptable", email: "comptable@exemple.test" },
    { role: "Caissier", email: "caissier@exemple.test" },
    { role: "Enseignant", email: "enseignant@exemple.test" },
    { role: "Parent", email: "parent@exemple.test" },
    { role: "Super-admin SaaS", email: "superadmin@exemple.test" },
  ];

  return (
    <aside className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="label-caps text-slate-500">Comptes de demonstration</p>
      <p className="mt-1.5 text-xs text-slate-600">
        Environnement de developpement uniquement. Mot de passe commun :{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
          Demo@2026
        </code>
      </p>
      <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        {accounts.map((account) => (
          <li key={account.email} className="flex items-baseline justify-between gap-2">
            <span className="text-slate-500">{account.role}</span>
            <code className="truncate font-mono text-[11px] text-slate-700">{account.email}</code>
          </li>
        ))}
      </ul>
    </aside>
  );
}
