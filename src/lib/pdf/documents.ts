import "server-only";
import { rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { formatScore } from "@/lib/domain/grades";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { loadStudentAccount } from "@/lib/domain/student-account";
import {
  A4,
  COLORS,
  createDocument,
  drawField,
  drawHorizontalRule,
  drawParagraph,
  drawSchoolHeader,
  drawTable,
  drawText,
  finalize,
  toBuffer,
} from "./builder";

/**
 * Documents officiels produits par l'application : recu de paiement, bulletin,
 * certificat de scolarite, liste de classe, carte scolaire, releve de compte.
 *
 * Chaque generateur recharge les donnees depuis la base en filtrant sur
 * schoolId : impossible d'editer le document d'un eleve d'un autre etablissement.
 */

/** Recu de paiement, reconstruit depuis l'instantane fige a l'encaissement. */
export async function generateReceiptPdf(schoolId: string, paymentId: string): Promise<Buffer> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      receipt: true,
      student: { select: { firstName: true, lastName: true, matricule: true } },
      school: true,
      cashier: { select: { firstName: true, lastName: true } },
      allocations: {
        include: {
          feeAssignment: { select: { label: true } },
          installment: { select: { label: true } },
        },
      },
    },
  });

  if (!payment || payment.schoolId !== schoolId) throw new NotFoundError("Paiement introuvable.");

  const school = payment.school;
  const context = await createDocument();

  drawSchoolHeader(
    context,
    {
      name: school.name,
      address: school.address,
      city: school.city,
      phone: school.phone,
      email: school.email,
    },
    "Recu de paiement",
    payment.receipt ? `N° ${payment.receipt.number}` : undefined,
  );

  // Un paiement annule doit rester identifiable comme tel sur le papier.
  if (payment.status === "CANCELLED") {
    drawText(context, "** PAIEMENT ANNULE **", {
      size: 14,
      bold: true,
      color: COLORS.danger,
      align: "center",
      x: A4.width / 2,
    });
    context.y -= 24;
  }

  drawField(context, "Eleve", `${payment.student.lastName} ${payment.student.firstName}`);
  drawField(context, "Matricule", payment.student.matricule);
  drawField(context, "Reference", payment.reference);
  drawField(context, "Date du paiement", payment.paidAt.toLocaleDateString("fr-FR"));
  drawField(context, "Mode de reglement", PAYMENT_METHOD_LABELS[payment.method] ?? payment.method);
  if (payment.externalReference) {
    drawField(context, "Reference externe", payment.externalReference);
  }
  drawField(
    context,
    "Encaisse par",
    payment.cashier ? `${payment.cashier.firstName} ${payment.cashier.lastName}` : "—",
  );

  context.y -= 8;
  drawHorizontalRule(context);

  drawText(context, "IMPUTATION DU REGLEMENT", { size: 9, bold: true, color: COLORS.muted });
  context.y -= 18;

  const allocated = payment.allocations.reduce((total, a) => total + a.amountMinor, 0);
  const rows = payment.allocations.map((allocation) => [
    allocation.feeAssignment.label,
    allocation.installment?.label ?? "Montant global",
    formatMoney(allocation.amountMinor, payment.currency, school.locale),
  ]);

  if (payment.amountMinor - allocated > 0) {
    rows.push([
      "Avance / trop-percu",
      "Non impute",
      formatMoney(payment.amountMinor - allocated, payment.currency, school.locale),
    ]);
  }

  drawTable(
    context,
    [
      { header: "Frais", width: 230 },
      { header: "Echeance", width: 150 },
      { header: "Montant", width: 119, align: "right" },
    ],
    rows.length > 0 ? rows : [["Aucune imputation", "—", "—"]],
    {
      totalRow: ["TOTAL ENCAISSE", "", formatMoney(payment.amountMinor, payment.currency, school.locale)],
    },
  );

  context.y -= 16;
  context.page.drawRectangle({
    x: context.margin,
    y: context.y - 34,
    width: A4.width - context.margin * 2,
    height: 42,
    color: COLORS.lightBand,
  });
  drawText(context, "MONTANT RECU", { x: context.margin + 14, y: context.y - 8, size: 9, color: COLORS.muted });
  drawText(context, formatMoney(payment.amountMinor, payment.currency, school.locale), {
    x: A4.width - context.margin - 14,
    y: context.y - 14,
    size: 16,
    bold: true,
    color: COLORS.brand,
    align: "right",
  });

  context.y -= 70;
  drawText(context, "Signature et cachet de l'etablissement", {
    size: 8,
    color: COLORS.muted,
    align: "right",
    x: A4.width - context.margin,
  });

  finalize(
    context,
    `${school.name} - Recu ${payment.receipt?.number ?? payment.reference}. Document genere automatiquement.`,
  );
  return toBuffer(context);
}

/** Bulletin de notes d'une periode. */
export async function generateReportCardPdf(
  schoolId: string,
  studentId: string,
  gradingPeriodId: string,
): Promise<Buffer> {
  const [student, period, reportCard] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: {
        school: true,
        enrollments: {
          include: { classRoom: { include: { level: true, track: true } }, academicYear: true },
          orderBy: { enrolledAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.gradingPeriod.findUnique({ where: { id: gradingPeriodId } }),
    prisma.reportCard.findUnique({
      where: { studentId_gradingPeriodId: { studentId, gradingPeriodId } },
    }),
  ]);

  if (!student || student.schoolId !== schoolId) throw new NotFoundError("Eleve introuvable.");
  if (!period || period.schoolId !== schoolId) throw new NotFoundError("Periode introuvable.");
  if (!reportCard) {
    throw new NotFoundError(
      "Aucun bulletin n'a encore ete genere pour cet eleve sur cette periode.",
    );
  }

  const enrollment = student.enrollments[0];
  const school = student.school;
  const detail = JSON.parse(reportCard.detail) as {
    subjectName: string;
    coefficient: number;
    averageCenti: number | null;
    appreciation?: string;
  }[];

  const context = await createDocument();

  drawSchoolHeader(
    context,
    { name: school.name, address: school.address, city: school.city, phone: school.phone },
    "Bulletin de notes",
    `${period.name} - ${enrollment?.academicYear.name ?? ""}`,
  );

  drawField(context, "Eleve", `${student.lastName} ${student.firstName}`);
  drawField(context, "Matricule", student.matricule);
  drawField(context, "Classe", enrollment?.classRoom.name ?? "—");
  if (enrollment?.classRoom.track) {
    drawField(context, "Filiere", enrollment.classRoom.track.name);
  }
  drawField(
    context,
    "Date de naissance",
    student.birthDate ? student.birthDate.toLocaleDateString("fr-FR") : "—",
  );

  context.y -= 6;
  drawHorizontalRule(context);

  drawTable(
    context,
    [
      { header: "Matiere", width: 200 },
      { header: "Coef.", width: 50, align: "right" },
      { header: "Moyenne", width: 80, align: "right" },
      { header: "Appreciation", width: 169 },
    ],
    detail.map((line) => [
      line.subjectName,
      String(line.coefficient),
      formatScore(line.averageCenti, school.locale),
      line.appreciation ?? "",
    ]),
  );

  context.y -= 14;
  context.page.drawRectangle({
    x: context.margin,
    y: context.y - 46,
    width: A4.width - context.margin * 2,
    height: 56,
    color: COLORS.lightBand,
  });

  drawText(context, "MOYENNE GENERALE", { x: context.margin + 14, y: context.y - 10, size: 9, color: COLORS.muted });
  drawText(context, `${formatScore(reportCard.averageCenti, school.locale)} / 20`, {
    x: context.margin + 14,
    y: context.y - 32,
    size: 18,
    bold: true,
    color: COLORS.brand,
  });

  if (reportCard.rank !== null) {
    drawText(context, "RANG", { x: context.margin + 230, y: context.y - 10, size: 9, color: COLORS.muted });
    drawText(context, `${reportCard.rank}${reportCard.classSize ? ` / ${reportCard.classSize}` : ""}`, {
      x: context.margin + 230,
      y: context.y - 32,
      size: 18,
      bold: true,
    });
  }

  if (reportCard.classAverageCenti !== null) {
    drawText(context, "MOYENNE DE CLASSE", {
      x: context.margin + 330,
      y: context.y - 10,
      size: 9,
      color: COLORS.muted,
    });
    drawText(context, formatScore(reportCard.classAverageCenti, school.locale), {
      x: context.margin + 330,
      y: context.y - 32,
      size: 18,
      bold: true,
    });
  }

  context.y -= 76;

  if (reportCard.appreciation) {
    drawText(context, "APPRECIATION GENERALE", { size: 9, bold: true, color: COLORS.muted });
    context.y -= 16;
    drawParagraph(context, reportCard.appreciation, { size: 10 });
    context.y -= 6;
  }

  if (reportCard.decision) {
    drawField(context, "Decision", reportCard.decision);
  }

  context.y -= 24;
  drawText(context, "Le chef d'etablissement", {
    size: 8,
    color: COLORS.muted,
    align: "right",
    x: A4.width - context.margin,
  });

  finalize(
    context,
    `${school.name} - Bulletin ${period.name}. Toute rature annule ce document.`,
  );
  return toBuffer(context);
}

/** Certificat de scolarite. */
export async function generateEnrollmentCertificatePdf(
  schoolId: string,
  studentId: string,
): Promise<Buffer> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { classRoom: { include: { level: true } }, academicYear: true },
        orderBy: { enrolledAt: "desc" },
        take: 1,
      },
    },
  });

  if (!student || student.schoolId !== schoolId) throw new NotFoundError("Eleve introuvable.");

  const enrollment = student.enrollments[0];
  const school = student.school;
  const context = await createDocument();

  drawSchoolHeader(
    context,
    { name: school.name, address: school.address, city: school.city, phone: school.phone },
    "Certificat de scolarite",
  );

  context.y -= 20;
  drawText(context, "CERTIFICAT DE SCOLARITE", {
    size: 16,
    bold: true,
    align: "center",
    x: A4.width / 2,
  });
  context.y -= 40;

  drawParagraph(
    context,
    `Je soussigne, chef de l'etablissement ${school.name}, certifie que l'eleve ` +
      `${student.lastName} ${student.firstName}, ` +
      (student.birthDate
        ? `ne(e) le ${student.birthDate.toLocaleDateString("fr-FR")}${student.birthPlace ? ` a ${student.birthPlace}` : ""}, `
        : "") +
      `immatricule(e) sous le numero ${student.matricule}, ` +
      (enrollment
        ? `est regulierement inscrit(e) en classe de ${enrollment.classRoom.name} ` +
          `pour l'annee scolaire ${enrollment.academicYear.name}.`
        : "est enregistre(e) dans nos effectifs."),
    { size: 11, lineHeight: 20 },
  );

  context.y -= 20;
  drawParagraph(
    context,
    "Le present certificat est delivre a l'interesse(e) pour servir et valoir ce que de droit.",
    { size: 11, lineHeight: 20 },
  );

  context.y -= 40;
  drawText(context, `Fait a ${school.city || "—"}, le ${new Date().toLocaleDateString("fr-FR")}`, {
    size: 10,
    align: "right",
    x: A4.width - context.margin,
  });
  context.y -= 50;
  drawText(context, "Le chef d'etablissement", {
    size: 10,
    bold: true,
    align: "right",
    x: A4.width - context.margin,
  });

  finalize(context, `${school.name} - Certificat de scolarite de ${student.matricule}.`);
  return toBuffer(context);
}

/** Releve de compte detaille d'un eleve. */
export async function generateStudentStatementPdf(
  schoolId: string,
  studentId: string,
  academicYearId?: string,
): Promise<Buffer> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { school: true },
  });
  if (!student || student.schoolId !== schoolId) throw new NotFoundError("Eleve introuvable.");

  const school = student.school;
  const account = await loadStudentAccount(studentId, schoolId, { academicYearId });

  const payments = await prisma.payment.findMany({
    where: { studentId, schoolId, status: "VALIDATED" },
    include: { receipt: { select: { number: true } } },
    orderBy: { paidAt: "asc" },
  });

  const context = await createDocument();

  drawSchoolHeader(
    context,
    { name: school.name, address: school.address, city: school.city, phone: school.phone },
    "Releve de compte",
    `${student.lastName} ${student.firstName} - ${student.matricule}`,
  );

  drawText(context, "FRAIS DUS", { size: 9, bold: true, color: COLORS.muted });
  context.y -= 18;

  drawTable(
    context,
    [
      { header: "Libelle", width: 200 },
      { header: "Brut", width: 85, align: "right" },
      { header: "Remises", width: 85, align: "right" },
      { header: "Net du", width: 85, align: "right" },
      { header: "Reste", width: 44, align: "right" },
    ],
    account.lines.map((line) => [
      line.label,
      formatMoney(line.grossMinor, school.currency, school.locale, { withSymbol: false }),
      formatMoney(line.discountMinor, school.currency, school.locale, { withSymbol: false }),
      formatMoney(line.netDueMinor, school.currency, school.locale, { withSymbol: false }),
      formatMoney(line.remainingMinor, school.currency, school.locale, { withSymbol: false }),
    ]),
  );

  context.y -= 18;
  drawText(context, "REGLEMENTS VALIDES", { size: 9, bold: true, color: COLORS.muted });
  context.y -= 18;

  drawTable(
    context,
    [
      { header: "Date", width: 90 },
      { header: "Recu", width: 140 },
      { header: "Mode", width: 140 },
      { header: "Montant", width: 129, align: "right" },
    ],
    payments.length > 0
      ? payments.map((payment) => [
          payment.paidAt.toLocaleDateString("fr-FR"),
          payment.receipt?.number ?? payment.reference,
          PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
          formatMoney(payment.amountMinor, school.currency, school.locale, { withSymbol: false }),
        ])
      : [["—", "Aucun reglement enregistre", "—", "—"]],
  );

  context.y -= 20;
  drawHorizontalRule(context);

  drawField(context, "Total du (net)", formatMoney(account.netDueMinor, school.currency, school.locale), { labelWidth: 200 });
  drawField(context, "Total paye et valide", formatMoney(account.paidMinor, school.currency, school.locale), { labelWidth: 200 });

  if (account.pendingProofMinor > 0) {
    drawField(
      context,
      "En attente de confirmation",
      `${formatMoney(account.pendingProofMinor, school.currency, school.locale)} (non deduit du solde)`,
      { labelWidth: 200 },
    );
  }
  if (account.overpaidMinor > 0) {
    drawField(context, "Trop-percu", formatMoney(account.overpaidMinor, school.currency, school.locale), { labelWidth: 200 });
  }

  drawField(context, "SOLDE RESTANT DU", formatMoney(account.balanceMinor, school.currency, school.locale), { labelWidth: 200 });

  finalize(
    context,
    `${school.name} - Releve de compte. Les justificatifs en attente ne sont pas deduits du solde.`,
  );
  return toBuffer(context);
}

/** Liste de classe (appel, emargement). */
export async function generateClassListPdf(schoolId: string, classRoomId: string): Promise<Buffer> {
  const classRoom = await prisma.classRoom.findUnique({
    where: { id: classRoomId },
    include: {
      school: true,
      academicYear: true,
      level: true,
      track: true,
      mainTeacher: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { status: "ACTIVE" },
        include: { student: true },
        orderBy: { student: { lastName: "asc" } },
      },
    },
  });

  if (!classRoom || classRoom.schoolId !== schoolId) throw new NotFoundError("Classe introuvable.");

  const school = classRoom.school;
  const context = await createDocument();

  drawSchoolHeader(
    context,
    { name: school.name, address: school.address, city: school.city },
    "Liste de classe",
    `${classRoom.name} - ${classRoom.academicYear.name}`,
  );

  drawField(context, "Classe", classRoom.name);
  drawField(context, "Niveau", classRoom.level.name);
  if (classRoom.track) drawField(context, "Filiere", classRoom.track.name);
  drawField(
    context,
    "Professeur principal",
    classRoom.mainTeacher
      ? `${classRoom.mainTeacher.firstName} ${classRoom.mainTeacher.lastName}`
      : "Non designe",
  );
  drawField(context, "Effectif", `${classRoom.enrollments.length} / ${classRoom.capacity} places`);

  context.y -= 10;

  drawTable(
    context,
    [
      { header: "N°", width: 35 },
      { header: "Matricule", width: 110 },
      { header: "Nom et prenoms", width: 210 },
      { header: "Sexe", width: 50 },
      { header: "Emargement", width: 94 },
    ],
    classRoom.enrollments.map((enrollment, index) => [
      String(index + 1),
      enrollment.student.matricule,
      `${enrollment.student.lastName} ${enrollment.student.firstName}`,
      enrollment.student.gender === "M" ? "M" : enrollment.student.gender === "F" ? "F" : "—",
      "",
    ]),
    { rowHeight: 22 },
  );

  finalize(context, `${school.name} - Liste de la classe ${classRoom.name}.`);
  return toBuffer(context);
}

/** Carte scolaire (format carte, imprimee sur une page A4). */
export async function generateStudentCardPdf(schoolId: string, studentId: string): Promise<Buffer> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      school: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { classRoom: true, academicYear: true },
        orderBy: { enrolledAt: "desc" },
        take: 1,
      },
    },
  });

  if (!student || student.schoolId !== schoolId) throw new NotFoundError("Eleve introuvable.");

  const school = student.school;
  const enrollment = student.enrollments[0];
  const context = await createDocument();

  drawSchoolHeader(
    context,
    { name: school.name, city: school.city },
    "Carte scolaire",
    enrollment?.academicYear.name,
  );

  const cardX = context.margin;
  const cardY = context.y - 200;
  const cardWidth = A4.width - context.margin * 2;

  context.page.drawRectangle({
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: 200,
    borderColor: COLORS.brand,
    borderWidth: 1.5,
    color: COLORS.lightBand,
  });

  context.page.drawRectangle({ x: cardX, y: cardY + 160, width: cardWidth, height: 40, color: COLORS.brand });

  drawText(context, school.name.toUpperCase(), {
    x: cardX + 16,
    y: cardY + 174,
    size: 12,
    bold: true,
    color: rgb(1, 1, 1),
  });

  // Emplacement reserve a la photographie de l'eleve.
  context.page.drawRectangle({
    x: cardX + 16,
    y: cardY + 32,
    width: 90,
    height: 115,
    borderColor: COLORS.line,
    borderWidth: 1,
  });
  drawText(context, "PHOTO", { x: cardX + 44, y: cardY + 86, size: 8, color: COLORS.muted });

  let fieldY = cardY + 128;
  const field = (label: string, value: string) => {
    drawText(context, label, { x: cardX + 125, y: fieldY, size: 8, color: COLORS.muted });
    drawText(context, value, { x: cardX + 125, y: fieldY - 14, size: 11, bold: true });
    fieldY -= 34;
  };

  field("NOM ET PRENOMS", `${student.lastName} ${student.firstName}`);
  field("MATRICULE", student.matricule);
  field("CLASSE", enrollment?.classRoom.name ?? "—");

  drawText(
    context,
    student.birthDate ? `Ne(e) le ${student.birthDate.toLocaleDateString("fr-FR")}` : "",
    { x: cardX + 125, y: cardY + 24, size: 8, color: COLORS.muted },
  );

  context.y = cardY - 30;
  drawParagraph(
    context,
    "Cette carte est strictement personnelle. Elle doit etre presentee a toute requisition " +
      "des responsables de l'etablissement et restituee en cas de depart.",
    { size: 9, color: COLORS.muted },
  );

  finalize(context, `${school.name} - Carte scolaire ${student.matricule}.`);
  return toBuffer(context);
}
