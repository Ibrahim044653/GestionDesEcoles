import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, teacherScope, currentStaffId } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, WEEKDAY_LABELS } from "@/lib/constants";
import { formatMinutes } from "@/lib/format";
import { getCurrentAcademicYear, listClassRooms } from "@/lib/domain/school-context";
import { Card, EmptyState, PageHeader, CalendarIcon } from "@/components/ui";

export const metadata: Metadata = { title: "Emploi du temps" };

/**
 * Emploi du temps hebdomadaire, par classe ou par enseignant.
 * Les creneaux sont positionnes sur une grille horaire calculee a partir des
 * donnees reelles (pas d'horaires codes en dur).
 */
export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; vue?: string }>;
}) {
  const context = await requirePagePermission(PERMISSIONS.TIMETABLE_VIEW);
  const params = await searchParams;
  const { school } = context;

  const academicYear = await getCurrentAcademicYear(school.id);
  const isTeacher = context.membership?.roleCode === ROLES.TEACHER;
  const scope = isTeacher ? await teacherScope(context) : null;
  const staffId = isTeacher ? await currentStaffId(context) : null;

  const allClassRooms = await listClassRooms(school.id, academicYear?.id);
  const classRooms = scope
    ? allClassRooms.filter((room) => scope.classRoomIds.includes(room.id))
    : allClassRooms;

  // Vue "mes cours" par defaut pour un enseignant.
  const view = params.vue ?? (isTeacher ? "enseignant" : "classe");
  const selectedClassId = params.classe ?? classRooms[0]?.id;

  const slots = await prisma.timetableSlot.findMany({
    where: {
      schoolId: school.id,
      ...(view === "enseignant" && staffId
        ? { teacherId: staffId }
        : selectedClassId
          ? { classRoomId: selectedClassId }
          : {}),
    },
    include: {
      subject: { select: { name: true, code: true } },
      classRoom: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });

  // Bornes horaires reelles, arrondies a l'heure.
  const earliest = slots.length > 0 ? Math.min(...slots.map((slot) => slot.startMinute)) : 8 * 60;
  const latest = slots.length > 0 ? Math.max(...slots.map((slot) => slot.endMinute)) : 17 * 60;
  const startHour = Math.floor(earliest / 60);
  const endHour = Math.ceil(latest / 60);
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, index) => startHour + index);

  const weekdays = [1, 2, 3, 4, 5, 6];
  const slotsByDay = new Map<number, typeof slots>();
  for (const day of weekdays) {
    slotsByDay.set(
      day,
      slots.filter((slot) => slot.weekday === day),
    );
  }

  return (
    <>
      <PageHeader
        title="Emploi du temps"
        description={
          view === "enseignant"
            ? "Vos creneaux de la semaine."
            : "Creneaux hebdomadaires de la classe selectionnee."
        }
        actions={
          isTeacher && (
            <>
              <Link
                href="/pedagogie/emploi-du-temps?vue=enseignant"
                className={view === "enseignant" ? "btn bg-brand-600 text-white btn-sm" : "btn-secondary btn-sm"}
              >
                Mes cours
              </Link>
              <Link
                href="/pedagogie/emploi-du-temps?vue=classe"
                className={view === "classe" ? "btn bg-brand-600 text-white btn-sm" : "btn-secondary btn-sm"}
              >
                Par classe
              </Link>
            </>
          )
        }
      />

      {view === "classe" && classRooms.length > 0 && (
        <Card className="mb-5">
          <form method="get" action="/pedagogie/emploi-du-temps" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="vue" value="classe" />
            <div className="min-w-48">
              <label htmlFor="classe" className="field-label">
                Classe
              </label>
              <select id="classe" name="classe" defaultValue={selectedClassId ?? ""} className="input">
                {classRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary">
              Afficher
            </button>
          </form>
        </Card>
      )}

      {slots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarIcon className="size-8" />}
            title="Aucun creneau"
            description="Aucun cours n'est planifie pour cette selection."
          />
        </Card>
      ) : (
        <>
          {/* Grille hebdomadaire (ecrans larges) */}
          <Card padded={false} className="hidden overflow-x-auto lg:block">
            <div className="min-w-[48rem] p-4">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `4rem repeat(${weekdays.length}, minmax(0, 1fr))` }}
              >
                <div />
                {weekdays.map((day) => (
                  <div key={day} className="pb-2 text-center">
                    <span className="label-caps text-slate-500">{WEEKDAY_LABELS[day]}</span>
                  </div>
                ))}

                {hours.map((hour) => (
                  <div key={hour} className="contents">
                    <div className="pr-2 pt-1 text-right text-xs tabular text-slate-400">
                      {String(hour).padStart(2, "0")}:00
                    </div>
                    {weekdays.map((day) => {
                      const hourSlots = (slotsByDay.get(day) ?? []).filter(
                        (slot) => Math.floor(slot.startMinute / 60) === hour,
                      );
                      return (
                        <div key={`${day}-${hour}`} className="min-h-14 rounded-lg border border-slate-100 p-1">
                          {hourSlots.map((slot) => (
                            <div
                              key={slot.id}
                              className="mb-1 rounded-md bg-brand-50 px-2 py-1.5 text-xs last:mb-0"
                            >
                              <p className="truncate font-semibold text-brand-800">{slot.subject.name}</p>
                              <p className="truncate text-brand-700">
                                {formatMinutes(slot.startMinute)}–{formatMinutes(slot.endMinute)}
                              </p>
                              <p className="truncate text-slate-500">
                                {view === "enseignant"
                                  ? slot.classRoom.name
                                  : slot.teacher
                                    ? `${slot.teacher.lastName}`
                                    : ""}
                                {slot.room && ` · ${slot.room}`}
                              </p>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Liste par jour (mobile) */}
          <div className="space-y-4 lg:hidden">
            {weekdays.map((day) => {
              const daySlots = slotsByDay.get(day) ?? [];
              if (daySlots.length === 0) return null;

              return (
                <Card key={day} title={WEEKDAY_LABELS[day]} padded={false}>
                  <ul className="divide-y divide-slate-100">
                    {daySlots.map((slot) => (
                      <li key={slot.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-24 shrink-0 text-xs tabular text-slate-500">
                          {formatMinutes(slot.startMinute)}
                          <br />
                          {formatMinutes(slot.endMinute)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-900">
                            {slot.subject.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {view === "enseignant" ? slot.classRoom.name : slot.teacher?.lastName}
                            {slot.room && ` · ${slot.room}`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
