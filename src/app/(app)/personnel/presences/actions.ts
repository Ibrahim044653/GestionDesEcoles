"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, assertSameSchool } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { fail, ok, ValidationError, type ActionResult } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

/**
 * Presences, retards et conges du personnel.
 *
 * Ces donnees peuvent alimenter une paie : elles sont donc tracees et jamais
 * supprimees silencieusement. Une presence corrigee ecrase la valeur du jour,
 * mais la correction figure au journal d'audit.
 *
 * AVERTISSEMENT METIER : aucune retenue sur salaire n'est calculee ici. Le
 * droit du travail et les conventions collectives varient selon les pays ;
 * l'application enregistre des faits, elle ne decide pas de leurs consequences
 * salariales.
 */

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "RETARD", "CONGE"] as const;
const LEAVE_KINDS = ["CONGE", "MALADIE", "MATERNITE", "AUTRE"] as const;
const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

/** Enregistre la feuille de presence d'une journee pour tout le personnel affiche. */
export async function saveStaffAttendanceAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STAFF_UPDATE);

    const dateRaw = String(formData.get("date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      throw new ValidationError("Date invalide.", { date: ["Format attendu : AAAA-MM-JJ."] });
    }

    // Date normalisee a minuit UTC : la cle unique (staffId, date) ne doit pas
    // dependre du fuseau du poste qui saisit.
    const date = new Date(`${dateRaw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError("Date invalide.", { date: ["Date non reconnue."] });
    }

    if (date.getTime() > Date.now() + 86_400_000) {
      throw new ValidationError("On ne pointe pas une journee a venir.", {
        date: ["La date ne peut pas etre dans le futur."],
      });
    }

    const staffIds = formData
      .getAll("staffIds")
      .map((value) => String(value))
      .filter(Boolean);

    if (staffIds.length === 0) throw new ValidationError("Aucun membre du personnel a enregistrer.");

    // Verrou de tenant : on ne retient que le personnel de cet etablissement.
    const staffMembers = await prisma.staff.findMany({
      where: { id: { in: staffIds }, schoolId: context.school.id },
      select: { id: true },
    });

    if (staffMembers.length !== staffIds.length) {
      throw new ValidationError("Un membre du personnel ne fait pas partie de cet etablissement.");
    }

    let saved = 0;

    await prisma.$transaction(
      async (tx) => {
        for (const staff of staffMembers) {
          const status = String(formData.get(`status_${staff.id}`) ?? "PRESENT");
          if (!ATTENDANCE_STATUSES.includes(status as (typeof ATTENDANCE_STATUSES)[number])) {
            throw new ValidationError(`Statut de presence inconnu : ${status}.`);
          }

          // Les minutes de retard n'ont de sens qu'en cas de retard.
          const minutesLate =
            status === "RETARD"
              ? Math.max(
                  0,
                  Math.min(
                    24 * 60,
                    Number.parseInt(String(formData.get(`late_${staff.id}`) ?? "0"), 10) || 0,
                  ),
                )
              : 0;

          const note = String(formData.get(`note_${staff.id}`) ?? "").slice(0, 300);

          const existing = await tx.staffAttendance.findUnique({
            where: { staffId_date: { staffId: staff.id, date } },
            select: { id: true },
          });

          if (existing) {
            await tx.staffAttendance.update({
              where: { id: existing.id },
              data: { status, minutesLate, note },
            });
          } else {
            await tx.staffAttendance.create({
              data: { staffId: staff.id, date, status, minutesLate, note },
            });
          }
          saved += 1;
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    await recordAudit({
      action: "staff_attendance.saved",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "staffAttendance",
      entityId: dateRaw,
      metadata: { date: dateRaw, agents: saved },
    });

    revalidatePath("/personnel/presences");
    return ok({ saved }, `Presence enregistree pour ${saved} membre(s) du personnel.`);
  } catch (error) {
    return fail(error);
  }
}

/** Depose une demande de conge pour un membre du personnel. */
export async function createStaffLeaveAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ leaveId: string }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STAFF_UPDATE);

    const staffId = String(formData.get("staffId") ?? "");
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, schoolId: true, firstName: true, lastName: true },
    });
    await assertSameSchool(context, staff, "staff");

    const kind = String(formData.get("kind") ?? "CONGE");
    if (!LEAVE_KINDS.includes(kind as (typeof LEAVE_KINDS)[number])) {
      throw new ValidationError(`Type de conge inconnu : ${kind}.`);
    }

    const startDate = new Date(String(formData.get("startDate") ?? ""));
    const endDate = new Date(String(formData.get("endDate") ?? ""));

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new ValidationError("Indiquez des dates valides.", {
        startDate: ["Date invalide."],
      });
    }

    if (endDate < startDate) {
      throw new ValidationError("La fin du conge precede son debut.", {
        endDate: ["La date de fin doit suivre la date de debut."],
      });
    }

    // Un conge qui chevauche un conge deja accorde est presque toujours une
    // double saisie : mieux vaut le refuser que de fausser les compteurs.
    const overlapping = await prisma.staffLeave.findFirst({
      where: {
        staffId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, startDate: true, endDate: true },
    });

    if (overlapping) {
      throw new ValidationError(
        `Un conge existe deja du ${overlapping.startDate.toLocaleDateString(
          "fr-FR",
        )} au ${overlapping.endDate.toLocaleDateString("fr-FR")}.`,
      );
    }

    const leave = await prisma.staffLeave.create({
      data: {
        staffId,
        kind,
        startDate,
        endDate,
        status: "PENDING",
        reason: String(formData.get("reason") ?? "").slice(0, 500),
      },
      select: { id: true },
    });

    await recordAudit({
      action: "staff_leave.requested",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "staffLeave",
      entityId: leave.id,
      metadata: {
        agent: `${staff!.lastName} ${staff!.firstName}`,
        type: kind,
        du: startDate.toISOString().slice(0, 10),
        au: endDate.toISOString().slice(0, 10),
      },
    });

    revalidatePath("/personnel/presences");
    return ok({ leaveId: leave.id }, "Demande de conge enregistree. Elle reste a approuver.");
  } catch (error) {
    return fail(error);
  }
}

/**
 * Approuve ou refuse un conge.
 *
 * L'approbation marque les journees concernees en CONGE sur la feuille de
 * presence, pour que l'absence ne soit pas comptee comme injustifiee. Les
 * journees deja pointees (present, retard) ne sont pas ecrasees : un fait
 * constate prime sur une regularisation administrative.
 */
export async function reviewStaffLeaveAction(
  _state: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ status: string; daysMarked: number }>> {
  try {
    const context = await requirePermission(PERMISSIONS.STAFF_UPDATE);

    const leaveId = String(formData.get("leaveId") ?? "");
    const status = String(formData.get("status") ?? "");

    if (!LEAVE_STATUSES.includes(status as (typeof LEAVE_STATUSES)[number])) {
      throw new ValidationError(`Statut inconnu : ${status}.`);
    }

    const leave = await prisma.staffLeave.findUnique({
      where: { id: leaveId },
      include: { staff: { select: { id: true, schoolId: true, firstName: true, lastName: true } } },
    });

    if (!leave) throw new ValidationError("Conge introuvable.");
    await assertSameSchool(context, { schoolId: leave.staff.schoolId }, "staffLeave");

    const reason = String(formData.get("reason") ?? "").slice(0, 500);

    if (status === "REJECTED" && !reason.trim()) {
      throw new ValidationError("Indiquez le motif du refus.", {
        reason: ["Le motif est obligatoire pour refuser un conge."],
      });
    }

    let daysMarked = 0;

    await prisma.$transaction(
      async (tx) => {
        await tx.staffLeave.update({
          where: { id: leaveId },
          data: { status, ...(reason ? { reason } : {}) },
        });

        if (status !== "APPROVED") return;

        const cursor = new Date(
          Date.UTC(
            leave.startDate.getUTCFullYear(),
            leave.startDate.getUTCMonth(),
            leave.startDate.getUTCDate(),
          ),
        );
        const last = Date.UTC(
          leave.endDate.getUTCFullYear(),
          leave.endDate.getUTCMonth(),
          leave.endDate.getUTCDate(),
        );

        while (cursor.getTime() <= last) {
          const date = new Date(cursor.getTime());
          const existing = await tx.staffAttendance.findUnique({
            where: { staffId_date: { staffId: leave.staffId, date } },
            select: { id: true, status: true },
          });

          if (!existing) {
            await tx.staffAttendance.create({
              data: {
                staffId: leave.staffId,
                date,
                status: "CONGE",
                note: `Conge approuve (${leave.kind}).`,
              },
            });
            daysMarked += 1;
          } else if (existing.status === "ABSENT") {
            // Une absence deja saisie est regularisee en conge ; un PRESENT ou
            // un RETARD constate reste tel quel.
            await tx.staffAttendance.update({
              where: { id: existing.id },
              data: { status: "CONGE", note: `Regularise par conge approuve (${leave.kind}).` },
            });
            daysMarked += 1;
          }

          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    await recordAudit({
      action: status === "APPROVED" ? "staff_leave.approved" : "staff_leave.reviewed",
      schoolId: context.school.id,
      userId: context.user.id,
      entityType: "staffLeave",
      entityId: leaveId,
      metadata: {
        agent: `${leave.staff.lastName} ${leave.staff.firstName}`,
        statut: status,
        journees_marquees: daysMarked,
      },
    });

    revalidatePath("/personnel/presences");
    return ok(
      { status, daysMarked },
      status === "APPROVED"
        ? `Conge approuve. ${daysMarked} journee(s) marquees en conge sur la feuille de presence.`
        : "Conge mis a jour.",
    );
  } catch (error) {
    return fail(error);
  }
}
