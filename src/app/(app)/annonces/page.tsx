import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, hasPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS, type RoleCode } from "@/lib/constants";
import { getCurrentAcademicYear, listClassRooms } from "@/lib/domain/school-context";
import { Alert, Badge, Card, EmptyState, PageHeader, BellIcon } from "@/components/ui";
import { AnnouncementForm } from "./announcement-form";

export const metadata: Metadata = { title: "Annonces" };

/** Annonces de l'etablissement, ciblables par audience et par classe. */
export default async function AnnouncementsPage() {
  const context = await requirePagePermission(PERMISSIONS.ANNOUNCEMENT_VIEW);
  const { school } = context;

  const canManage = hasPermission(context, PERMISSIONS.ANNOUNCEMENT_MANAGE);
  const academicYear = await getCurrentAcademicYear(school.id);

  const [announcements, classRooms] = await Promise.all([
    prisma.announcement.findMany({
      where: { schoolId: school.id },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 50,
      include: {
        author: { select: { firstName: true, lastName: true } },
        classRoom: { select: { name: true } },
      },
    }),
    canManage ? listClassRooms(school.id, academicYear?.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Annonces"
        description="Informations diffusees aux familles, aux eleves et au personnel."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {announcements.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BellIcon className="size-8" />}
                title="Aucune annonce"
                description="Publiez une annonce pour informer les familles."
              />
            </Card>
          ) : (
            announcements.map((announcement) => {
              let audiences: string[] = [];
              try {
                audiences = JSON.parse(announcement.audiences) as string[];
              } catch {
                audiences = [];
              }

              const expired =
                announcement.expiresAt !== null && announcement.expiresAt.getTime() < Date.now();

              return (
                <Card key={announcement.id} className={expired ? "opacity-60" : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-900">
                        {announcement.title}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(announcement.publishedAt, school.locale)}
                        {announcement.author &&
                          ` — ${announcement.author.lastName} ${announcement.author.firstName}`}
                        {announcement.classRoom && ` — ${announcement.classRoom.name}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {announcement.isPinned && <Badge tone="warning">Epinglee</Badge>}
                      {expired && <Badge tone="neutral">Expiree</Badge>}
                      {audiences.map((audience) => (
                        <Badge key={audience} tone="info">
                          {ROLE_LABELS[audience as RoleCode] ?? audience}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {announcement.body}
                  </p>
                </Card>
              );
            })
          )}
        </div>

        {canManage && (
          <div className="space-y-5">
            <Card title="Nouvelle annonce">
              <AnnouncementForm
                classRooms={classRooms.map((room) => ({ id: room.id, name: room.name }))}
              />
            </Card>

            <Alert tone="info" title="Diffusion">
              Les annonces apparaissent dans l&apos;espace des audiences ciblees. L&apos;envoi par
              e-mail, SMS ou WhatsApp necessite la configuration d&apos;un prestataire : tant
              qu&apos;aucun n&apos;est branche, la diffusion reste interne a l&apos;application.
            </Alert>
          </div>
        )}
      </div>
    </>
  );
}
