import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSchoolPage, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { SCHOOL_TYPE_LABELS, OPTIONAL_MODULE_LABELS, type SchoolType } from "@/lib/constants";
import { listIntegrations } from "@/lib/integrations";
import { Alert, Badge, Card, PageHeader, SettingsIcon } from "@/components/ui";
import { NewSchoolForm, SchoolSettingsForm } from "./school-form";
import { ImageUpload } from "@/components/client/upload";
import { uploadSchoolLogoAction } from "@/app/(app)/fichiers/actions";

export const metadata: Metadata = { title: "Parametres" };

/** Configuration generale de l'etablissement et etat des integrations. */
export default async function SettingsPage() {
  const context = await requireSchoolPage();

  if (!hasPermission(context, PERMISSIONS.SCHOOL_UPDATE)) {
    // Un utilisateur qui peut configurer la pedagogie mais pas l'etablissement
    // est redirige vers la section qui le concerne.
    return (
      <>
        <PageHeader title="Parametres" />
        <Card>
          <p className="text-sm text-slate-600">
            Vous n&apos;avez pas acces aux parametres generaux de l&apos;etablissement.{" "}
            {hasPermission(context, PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC) && (
              <Link href="/parametres/annees" className="font-medium text-brand-700 hover:underline">
                Acceder aux parametres pedagogiques
              </Link>
            )}
          </p>
        </Card>
      </>
    );
  }

  const school = await prisma.school.findUnique({
    where: { id: context.school.id },
    include: {
      organization: { select: { name: true } },
      _count: {
        select: { students: true, staff: true, classRooms: true, academicYears: true },
      },
    },
  });

  if (!school) return null;

  const enabledModules: string[] = JSON.parse(school.enabledModules || "[]");
  const integrations = listIntegrations();

  const sections = [
    { href: "/parametres/annees", label: "Annees scolaires et periodes", permission: PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC },
    { href: "/parametres/classes", label: "Niveaux et classes", permission: PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC },
    { href: "/parametres/matieres", label: "Matieres et coefficients", permission: PERMISSIONS.SUBJECT_MANAGE },
    { href: "/parametres/pedagogie", label: "Regles de notation", permission: PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC },
    { href: "/parametres/comptabilite", label: "Comptabilite et caisses", permission: PERMISSIONS.ACCOUNT_MANAGE },
    { href: "/parametres/utilisateurs", label: "Utilisateurs et roles", permission: PERMISSIONS.MEMBERSHIP_MANAGE },
  ];

  return (
    <>
      <PageHeader
        title="Parametres de l'etablissement"
        description={`${school.organization.name} — ${SCHOOL_TYPE_LABELS[school.type as SchoolType] ?? school.type}`}
        actions={
          hasPermission(context, PERMISSIONS.SCHOOL_CREATE) ? <NewSchoolForm /> : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Eleves", value: school._count.students },
          { label: "Personnel", value: school._count.staff },
          { label: "Classes", value: school._count.classRooms },
          { label: "Annees scolaires", value: school._count.academicYears },
        ].map((stat) => (
          <div key={stat.label} className="card card-pad">
            <p className="label-caps text-slate-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 tabular">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card
            title="Logo de l'etablissement"
            description="Affiche sur les recus, bulletins et certificats remis aux familles."
          >
            <ImageUpload
              action={uploadSchoolLogoAction}
              currentDocumentId={school.logoDocumentId}
              label="Nouveau logo"
              emptyLabel="Aucun logo"
              width={150}
              height={150}
            />
          </Card>

          <Card title="Identite de l'etablissement">
            <SchoolSettingsForm
              school={{
                name: school.name,
                code: school.code,
                type: school.type,
                address: school.address,
                city: school.city,
                country: school.country,
                phone: school.phone,
                email: school.email,
                website: school.website,
                currency: school.currency,
                locale: school.locale,
                matriculePattern: school.matriculePattern,
              }}
              enabledModules={enabledModules}
              nextMatriculeExample={school.matriculePattern
                .replace("{SCHOOL}", school.code)
                .replace("{YEAR}", String(new Date().getFullYear()))
                .replace("{YY}", String(new Date().getFullYear()).slice(-2))
                .replace(/\{SEQ:(\d+)\}/, (_m, width: string) =>
                  String(school.matriculeCounter + 1).padStart(Number(width), "0"),
                )
                .replace("{SEQ}", String(school.matriculeCounter + 1))}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Autres sections" padded={false}>
            <ul className="divide-y divide-slate-100">
              {sections
                .filter((section) => hasPermission(context, section.permission))
                .map((section) => (
                  <li key={section.href}>
                    <Link
                      href={section.href}
                      className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      {section.label}
                      <SettingsIcon className="size-4 text-slate-400" />
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>

          <Card title="Modules actives">
            {enabledModules.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun module optionnel active.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {enabledModules.map((moduleCode) => (
                  <li key={moduleCode}>
                    <Badge tone="info">{OPTIONAL_MODULE_LABELS[moduleCode] ?? moduleCode}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* --------------------------- Integrations --------------------------- */}
          <Card
            title="Integrations externes"
            description="Etat reel de chaque integration sur cette installation."
            padded={false}
          >
            <ul className="divide-y divide-slate-100">
              {integrations.map((integration) => (
                <li key={integration.key} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{integration.label}</span>
                    <Badge
                      tone={
                        integration.available
                          ? "success"
                          : integration.configured
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {integration.available
                        ? "Active"
                        : integration.configured
                          ? `Mode ${integration.mode}`
                          : "Non configuree"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{integration.note}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Alert tone="info" title="Integrations non branchees">
            Aucune integration externe n&apos;est reellement connectee sur cette installation. Les
            modules correspondants exposent une interface et un mode de test, mais ne doivent pas
            etre presentes comme operationnels tant qu&apos;un prestataire n&apos;est pas configure
            et teste. Voir <code className="text-xs">docs/INTEGRATIONS.md</code>.
          </Alert>
        </div>
      </div>
    </>
  );
}
