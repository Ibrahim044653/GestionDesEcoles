import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { parseGradingSettings } from "@/lib/domain/grades";
import { Alert, Card, PageHeader } from "@/components/ui";
import { GradingSettingsForm } from "./grading-form";

export const metadata: Metadata = { title: "Regles de notation" };

/** Regles de calcul des moyennes et de traitement des absences. */
export default async function GradingSettingsPage() {
  const context = await requirePagePermission(PERMISSIONS.SCHOOL_CONFIGURE_ACADEMIC);

  const school = await prisma.school.findUnique({
    where: { id: context.school.id },
    select: { gradingSettings: true },
  });

  const settings = parseGradingSettings(school?.gradingSettings);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Parametres", href: "/parametres" }, { label: "Regles de notation" }]}
        title="Regles de notation"
        description="Ces regles pilotent le calcul des moyennes, le traitement des absences et le classement."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <GradingSettingsForm settings={settings} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Comment les moyennes sont calculees">
            <ol className="space-y-3 text-sm text-slate-600">
              <li>
                <span className="font-medium text-slate-800">1. Par matiere.</span> Chaque note est
                ramenee au bareme de l&apos;etablissement, puis ponderee par le coefficient de son
                evaluation.
              </li>
              <li>
                <span className="font-medium text-slate-800">2. Moyenne generale.</span> Moyenne des
                moyennes de matieres, ponderee par le coefficient de chaque matiere.
              </li>
              <li>
                <span className="font-medium text-slate-800">3. Matieres sans note.</span> Elles
                sont ignorees, jamais comptees zero : un eleve n&apos;est pas penalise parce
                qu&apos;une matiere n&apos;a pas encore ete evaluee.
              </li>
              <li>
                <span className="font-medium text-slate-800">4. Arrondi.</span> Une seule fois, au
                centieme, au moment de produire la moyenne. Les calculs intermediaires restent
                entiers.
              </li>
            </ol>
          </Card>

          <Alert tone="info" title="Effet sur les bulletins existants">
            Modifier ces regles n&apos;altere pas les bulletins deja generes : leurs moyennes sont
            figees au moment de la generation. Les nouveaux calculs utiliseront les regles mises a
            jour.
          </Alert>
        </div>
      </div>
    </>
  );
}
