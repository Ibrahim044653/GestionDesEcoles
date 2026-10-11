import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission, hasPermission, teacherScope } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ROLES, STUDENT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { getCurrentAcademicYear, listClassRooms, listLevels } from "@/lib/domain/school-context";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  PlusIcon,
  DownloadIcon,
  UsersIcon,
  SearchIcon,
} from "@/components/ui";
import { textContains } from "@/lib/search";

export const metadata: Metadata = { title: "Eleves" };

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  classe?: string;
  niveau?: string;
  statut?: string;
  page?: string;
};

/**
 * Liste des eleves : recherche, filtres et pagination, tous appliques cote
 * serveur. Un enseignant ne voit que les eleves de ses propres classes.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePagePermission(PERMISSIONS.STUDENT_VIEW);
  const params = await searchParams;
  const { school } = context;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const query = (params.q ?? "").trim();
  const statusFilter = params.statut ?? "ACTIVE";

  const academicYear = await getCurrentAcademicYear(school.id);

  // Restriction d'un enseignant a ses seules classes.
  let allowedClassRoomIds: string[] | null = null;
  if (context.membership?.roleCode === ROLES.TEACHER) {
    const scope = await teacherScope(context);
    allowedClassRoomIds = scope.classRoomIds;
  }

  const where = {
    schoolId: school.id,
    ...(statusFilter !== "TOUS" ? { status: statusFilter } : {}),
    ...(query
      ? {
          OR: [
            { lastName: textContains(query) },
            { firstName: textContains(query) },
            { matricule: textContains(query) },
            { phone: textContains(query) },
          ],
        }
      : {}),
    ...(params.classe || params.niveau || allowedClassRoomIds
      ? {
          enrollments: {
            some: {
              status: "ACTIVE",
              ...(academicYear ? { academicYearId: academicYear.id } : {}),
              ...(params.classe ? { classRoomId: params.classe } : {}),
              ...(params.niveau ? { classRoom: { levelId: params.niveau } } : {}),
              ...(allowedClassRoomIds ? { classRoomId: { in: allowedClassRoomIds } } : {}),
            },
          },
        }
      : {}),
  };

  const [students, total, classRooms, levels] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        matricule: true,
        firstName: true,
        lastName: true,
        gender: true,
        birthDate: true,
        status: true,
        phone: true,
        enrollments: {
          where: { status: "ACTIVE", ...(academicYear ? { academicYearId: academicYear.id } : {}) },
          select: { classRoom: { select: { id: true, name: true } } },
          take: 1,
        },
        guardians: {
          where: { isPrimary: true },
          select: { guardian: { select: { firstName: true, lastName: true, phone: true } } },
          take: 1,
        },
      },
    }),
    prisma.student.count({ where }),
    listClassRooms(school.id, academicYear?.id),
    listLevels(school.id),
  ]);

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const canCreate = hasPermission(context, PERMISSIONS.STUDENT_CREATE);
  const canExport = hasPermission(context, PERMISSIONS.STUDENT_EXPORT);

  const buildHref = (targetPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (params.classe) search.set("classe", params.classe);
    if (params.niveau) search.set("niveau", params.niveau);
    if (params.statut) search.set("statut", params.statut);
    if (targetPage > 1) search.set("page", String(targetPage));
    const queryString = search.toString();
    return queryString ? `/eleves?${queryString}` : "/eleves";
  };

  return (
    <>
      <PageHeader
        title="Eleves"
        description={
          allowedClassRoomIds
            ? "Vous consultez les eleves des classes qui vous sont affectees."
            : `${total} dossier${total > 1 ? "s" : ""} correspondant aux filtres.`
        }
        actions={
          <>
            {canExport && (
              <Link href={`/api/export/eleves${buildHref(1).replace("/eleves", "")}`} className="btn-secondary">
                <DownloadIcon className="size-4" />
                Exporter CSV
              </Link>
            )}
            {canCreate && (
              <>
                <Link href="/eleves/import" className="btn-secondary">
                  Importer
                </Link>
                <Link href="/eleves/nouveau" className="btn-primary">
                  <PlusIcon className="size-4" />
                  Nouvel eleve
                </Link>
              </>
            )}
          </>
        }
      />

      {/* --------------------------- Filtres --------------------------- */}
      <Card className="mb-4">
        <form method="get" action="/eleves" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="field-label">
              Rechercher
            </label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Nom, prenom, matricule, telephone"
                className="input pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="niveau" className="field-label">
              Niveau
            </label>
            <select id="niveau" name="niveau" defaultValue={params.niveau ?? ""} className="input">
              <option value="">Tous les niveaux</option>
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="classe" className="field-label">
              Classe
            </label>
            <select id="classe" name="classe" defaultValue={params.classe ?? ""} className="input">
              <option value="">Toutes les classes</option>
              {classRooms
                .filter((room) => !allowedClassRoomIds || allowedClassRoomIds.includes(room.id))
                .map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="statut" className="field-label">
              Statut
            </label>
            <select id="statut" name="statut" defaultValue={statusFilter} className="input">
              <option value="ACTIVE">Inscrits</option>
              <option value="TRANSFERRED">Transferes</option>
              <option value="GRADUATED">Diplomes</option>
              <option value="DROPPED">Abandons</option>
              <option value="ARCHIVED">Archives</option>
              <option value="TOUS">Tous</option>
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="btn-primary">
              Appliquer les filtres
            </button>
            <Link href="/eleves" className="btn-ghost">
              Reinitialiser
            </Link>
          </div>
        </form>
      </Card>

      {/* --------------------------- Resultats --------------------------- */}
      <Card padded={false}>
        {students.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<UsersIcon className="size-8" />}
              title={query || params.classe ? "Aucun eleve ne correspond" : "Aucun eleve enregistre"}
              description={
                query || params.classe
                  ? "Modifiez les filtres ou elargissez votre recherche."
                  : "Commencez par creer un dossier ou importez une liste depuis un fichier CSV."
              }
              action={
                canCreate && (
                  <div className="flex gap-2">
                    <Link href="/eleves/nouveau" className="btn-primary btn-sm">
                      Creer un eleve
                    </Link>
                    <Link href="/eleves/import" className="btn-secondary btn-sm">
                      Importer un fichier
                    </Link>
                  </div>
                )
              }
            />
          </div>
        ) : (
          <>
            <DataTable
              caption="Liste des eleves"
              columns={[
                { key: "name", label: "Eleve" },
                { key: "matricule", label: "Matricule" },
                { key: "class", label: "Classe" },
                { key: "birth", label: "Naissance" },
                { key: "guardian", label: "Responsable" },
                { key: "status", label: "Statut" },
              ]}
            >
              {students.map((student) => {
                const guardian = student.guardians[0]?.guardian;
                return (
                  <tr key={student.id}>
                    <td>
                      <Link
                        href={`/eleves/${student.id}`}
                        className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {student.lastName} {student.firstName}
                      </Link>
                      <span className="ml-1.5 text-xs text-slate-400">
                        {student.gender === "F" ? "F" : student.gender === "M" ? "M" : ""}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-slate-600">{student.matricule}</td>
                    <td>{student.enrollments[0]?.classRoom.name ?? <span className="text-slate-400">Non inscrit</span>}</td>
                    <td className="text-slate-600">{formatDate(student.birthDate, school.locale)}</td>
                    <td className="text-slate-600">
                      {guardian ? (
                        <>
                          <span className="block">{guardian.lastName} {guardian.firstName}</span>
                          {guardian.phone && <span className="text-xs text-slate-400">{guardian.phone}</span>}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={student.status === "ACTIVE" ? "success" : "neutral"}>
                        {STUDENT_STATUS_LABELS[student.status] ?? student.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </DataTable>

            <div className="px-4 pb-4">
              <Pagination page={page} pageCount={pageCount} total={total} buildHref={buildHref} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
