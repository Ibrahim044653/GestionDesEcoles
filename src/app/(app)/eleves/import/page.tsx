import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { listAcademicYears } from "@/lib/domain/school-context";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { Card, PageHeader, Alert, Badge, DataTable, EmptyState } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importer des eleves" };

export default async function ImportStudentsPage() {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_IMPORT);

  const [academicYears, recentBatches] = await Promise.all([
    listAcademicYears(context.school.id),
    prisma.importBatch.findMany({
      where: { schoolId: context.school.id, kind: "STUDENTS" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        fileName: true,
        status: true,
        totalRows: true,
        importedRows: true,
        errorRows: true,
        duplicateRows: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Eleves", href: "/eleves" }, { label: "Import" }]}
        title="Importer des eleves"
        description="Deposez un fichier CSV, verifiez l'apercu et le rapport d'erreurs, puis validez. Rien n'est enregistre avant votre confirmation."
      />

      {academicYears.length === 0 ? (
        <Alert tone="warning" title="Aucune annee scolaire">
          Creez d&apos;abord une annee scolaire depuis{" "}
          <Link href="/parametres/annees" className="font-semibold underline">
            les parametres
          </Link>
          .
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ImportWizard academicYears={academicYears.map((year) => ({ id: year.id, name: year.name, isCurrent: year.isCurrent }))} />
          </div>

          <div className="space-y-5">
            <Card title="Colonnes reconnues">
              <p className="mb-3 text-sm text-slate-600">
                L&apos;ordre des colonnes n&apos;a pas d&apos;importance. Les accents, majuscules et
                espaces dans les en-tetes sont ignores.
              </p>
              <dl className="space-y-2.5 text-xs">
                {[
                  { column: "nom, prenom", note: "Obligatoires." },
                  { column: "matricule", note: "Facultatif — genere automatiquement si absent." },
                  { column: "sexe", note: "M / F / masculin / feminin / garcon / fille." },
                  { column: "date_de_naissance", note: "JJ/MM/AAAA ou AAAA-MM-JJ." },
                  { column: "lieu_de_naissance, adresse", note: "Facultatifs." },
                  { column: "telephone, email", note: "Facultatifs, format verifie." },
                  { column: "classe", note: "Code de la classe (ex. 6EME-A)." },
                  { column: "nom_parent, prenom_parent", note: "Cree le responsable legal." },
                  { column: "telephone_parent, email_parent", note: "Sert au rapprochement des fratries." },
                  { column: "lien_de_parente", note: "PERE / MERE / TUTEUR / AUTRE." },
                ].map((entry) => (
                  <div key={entry.column} className="border-b border-slate-100 pb-2 last:border-0">
                    <dt className="font-mono font-medium text-slate-800">{entry.column}</dt>
                    <dd className="text-slate-500">{entry.note}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card title="Controles effectues">
              <ul className="space-y-2 text-sm text-slate-600">
                {[
                  "Champs obligatoires et formats (dates, e-mails).",
                  "Existence de la classe pour l'annee choisie.",
                  "Capacite d'accueil de la classe (avertissement).",
                  "Doublons sur le matricule existant.",
                  "Doublons sur nom + prenom + date de naissance.",
                  "Doublons internes au fichier.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Imports recents" padded={false}>
              {recentBatches.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="Aucun import" description="L'historique apparaitra ici." />
                </div>
              ) : (
                <DataTable
                  columns={[
                    { key: "file", label: "Fichier" },
                    { key: "result", label: "Resultat" },
                    { key: "status", label: "Etat" },
                  ]}
                >
                  {recentBatches.map((batch) => (
                    <tr key={batch.id}>
                      <td>
                        <span className="block truncate font-medium text-slate-800">{batch.fileName}</span>
                        <span className="text-xs text-slate-400">
                          {formatDateTime(batch.createdAt, context.school.locale)}
                        </span>
                      </td>
                      <td className="text-xs text-slate-600">
                        {batch.importedRows} / {batch.totalRows} importes
                        {batch.errorRows > 0 && <span className="block text-rose-600">{batch.errorRows} erreurs</span>}
                        {batch.duplicateRows > 0 && (
                          <span className="block text-amber-600">{batch.duplicateRows} doublons</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={batch.status === "COMMITTED" ? "success" : "neutral"}>
                          {batch.status === "COMMITTED" ? "Valide" : batch.status === "PREVIEW" ? "Apercu" : "Annule"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
