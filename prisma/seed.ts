/**
 * Donnees de demonstration.
 *
 * Toutes les donnees creees ici sont FICTIVES et clairement identifiables
 * comme telles (domaine @exemple.test, noms d'etablissements inventes).
 * Ne jamais executer ce script sur une base de production : il refuse de
 * demarrer si NODE_ENV=production sans ALLOW_SEED_IN_PRODUCTION=true.
 *
 * Deux etablissements sont crees volontairement : ils permettent de verifier
 * l'isolation multi-tenant (un utilisateur de l'un ne voit rien de l'autre).
 */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, describePermission } from "../src/lib/permissions";
import { ROLES, ROLE_LABELS, ROLE_RANKS, type RoleCode } from "../src/lib/constants";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../src/lib/domain/accounting";
import { assignFeeToStudent, parseInstallmentPlan } from "../src/lib/domain/fees";
import { recordPayment, submitPaymentProof } from "../src/lib/domain/payments";
import { renderMatricule } from "../src/lib/domain/sequences";
import { generateReportCards } from "../src/lib/domain/report-cards";

// Memes delais que le client applicatif (src/lib/prisma.ts) : le seed ecrit
// des milliers de lignes et doit supporter la latence d'une base distante.
const prisma = new PrismaClient({
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
});

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "Demo@2026";
const YEAR_NAME = "2025-2026";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_IN_PRODUCTION !== "true") {
  console.error(
    "Refus d'executer le seed en production. Definissez ALLOW_SEED_IN_PRODUCTION=true si c'est volontaire.",
  );
  process.exit(1);
}

/** Generateur pseudo-aleatoire deterministe : le seed produit toujours les memes donnees. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
const random = makeRandom(20260101);

function pickFrom<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

const LAST_NAMES = [
  "KOUASSI", "KONE", "TRAORE", "DIABATE", "OUATTARA", "YAO", "BAMBA", "COULIBALY",
  "N'GUESSAN", "KOFFI", "ADJOUMANI", "BROU", "GNAMIEN", "SANOGO", "TOURE", "DIALLO",
  "ZADI", "AKA", "KOUAME", "SILUE", "DOSSO", "FOFANA", "GUEI", "LOBA",
];

const FIRST_NAMES_F = [
  "Awa", "Aminata", "Fatoumata", "Mariam", "Adjoua", "Affoue", "Akissi", "Rokia",
  "Nadege", "Prisca", "Esther", "Clarisse", "Sarah", "Ines", "Kadiatou", "Djeneba",
];

const FIRST_NAMES_M = [
  "Yao", "Koffi", "Ibrahim", "Moussa", "Seydou", "Arsene", "Franck", "Herve",
  "Christian", "Olivier", "Serge", "Marc", "Abdoulaye", "Lassina", "Jean", "Patrick",
];

async function main() {
  console.log("Initialisation des donnees de demonstration...\n");

  await resetDatabase();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const roles = await seedRolesAndPermissions();
  const plans = await seedPlans();

  // --- Super-administrateur de la plateforme (hors tenant) ---
  const superAdmin = await prisma.user.create({
    data: {
      email: "superadmin@exemple.test",
      passwordHash,
      firstName: "Awa",
      lastName: "SUPERADMIN",
      isSuperAdmin: true,
      phone: "+225 07 00 00 00 01",
    },
  });
  console.log("  Super-administrateur cree");

  // --- Organisation (tenant) et abonnement ---
  const organization = await prisma.organization.create({
    data: {
      name: "Groupe Scolaire Excellence (demonstration)",
      slug: "excellence-demo",
      country: "CI",
    },
  });

  const subscription = await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      planId: plans.professionnel.id,
      status: "ACTIVE",
      startedAt: new Date("2025-08-01"),
      currentPeriodEnd: new Date("2026-08-01"),
    },
  });

  await prisma.saasInvoice.createMany({
    data: [
      {
        organizationId: organization.id,
        subscriptionId: subscription.id,
        number: "SAAS-202508-00001",
        periodStart: new Date("2025-08-01"),
        periodEnd: new Date("2026-08-01"),
        amountMinor: plans.professionnel.priceMinor * 12,
        status: "PAID",
        dueDate: new Date("2025-08-15"),
        paidAt: new Date("2025-08-10"),
      },
    ],
  });
  console.log("  Organisation et abonnement crees");

  // --- Etablissement principal, entierement garni ---
  const main = await seedSchool({
    organizationId: organization.id,
    name: "Groupe Scolaire Excellence - Cocody",
    code: "GSE-COC",
    city: "Abidjan",
    type: "COLLEGE",
    roles,
    passwordHash,
    studentCount: 48,
    withTransactions: true,
  });

  // --- Second etablissement : sert a prouver l'isolation des donnees ---
  const secondary = await seedSchool({
    organizationId: organization.id,
    name: "Groupe Scolaire Excellence - Yopougon",
    code: "GSE-YOP",
    city: "Abidjan",
    type: "PRIMAIRE",
    roles,
    passwordHash,
    studentCount: 18,
    withTransactions: false,
    emailSuffix: "yop",
  });

  // Le proprietaire est rattache aux DEUX ecoles (multi-etablissements).
  await prisma.membership.create({
    data: {
      userId: main.ownerId,
      schoolId: secondary.schoolId,
      roleId: roles.OWNER.id,
      status: "ACTIVE",
    },
  });

  await prisma.supportTicket.create({
    data: {
      organizationId: organization.id,
      schoolId: main.schoolId,
      openedById: main.ownerId,
      subject: "Demande d'activation du module Cantine",
      body: "Bonjour, nous souhaitons activer le module Cantine pour la rentree de janvier.",
      priority: "NORMAL",
      status: "OPEN",
    },
  });

  await printSummary(main.schoolId, secondary.schoolId);
}

/** Vide les tables dans l'ordre inverse des dependances. */
async function resetDatabase() {
  const tables = [
    "gradeRevision", "reportCard", "grade", "evaluation",
    "submission", "assignment", "attendance", "timetableSlot",
    "paymentAllocation", "receipt", "refund", "payment", "paymentProof",
    "installment", "discount", "feeAssignment", "feeItem",
    "journalLine", "journalEntry", "accountingPeriod", "ledgerAccount",
    "bankReconciliation", "expense", "supplier", "expenseCategory", "financialAccount",
    "budget", "message", "threadParticipant", "messageThread", "announcement",
    "notification", "documentRequest", "appointmentRequest", "document",
    "auditEvent", "importBatch", "rateLimitBucket",
    "staffAttendance", "staffLeave", "enrollment", "studentGuardian",
    "classSubject", "classRoom", "subject", "teachingUnit", "gradingPeriod",
    "level", "cycle", "track", "academicYear",
    "student", "guardian", "staff", "session", "membership",
    "supportTicket", "saasInvoice", "subscription", "school", "organization",
    "rolePermission", "role", "permission", "plan", "user",
  ] as const;

  for (const table of tables) {
    // deleteMany sans filtre : la base de demonstration est entierement reconstruite.
    await (prisma as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[
      table
    ].deleteMany();
  }
  console.log("  Base reinitialisee");
}

async function seedRolesAndPermissions() {
  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((code) => {
      const { resource, action } = describePermission(code);
      return { code, resource, action, description: `${action} sur ${resource}` };
    }),
  });

  const permissions = await prisma.permission.findMany();
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  const roles = {} as Record<RoleCode, { id: string }>;

  for (const code of Object.values(ROLES)) {
    const role = await prisma.role.create({
      data: {
        code,
        name: ROLE_LABELS[code],
        rank: ROLE_RANKS[code],
        description: `Role systeme : ${ROLE_LABELS[code]}`,
        permissions: {
          create: (ROLE_PERMISSIONS[code] ?? [])
            .map((permissionCode) => permissionByCode.get(permissionCode))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({ permissionId })),
        },
      },
      select: { id: true },
    });
    roles[code] = role;
  }

  console.log(`  ${permissions.length} permissions et ${Object.keys(roles).length} roles crees`);
  return roles;
}

async function seedPlans() {
  const essentiel = await prisma.plan.create({
    data: {
      code: "ESSENTIEL",
      name: "Essentiel",
      description: "Pour un etablissement unique demarrant la gestion numerique.",
      priceMinor: 25_000,
      billingPeriod: "MONTHLY",
      maxSchools: 1,
      maxStudents: 300,
      maxStaff: 40,
      sortOrder: 1,
      features: JSON.stringify(["ELEVES", "FRAIS", "PAIEMENTS", "BULLETINS"]),
    },
  });

  const professionnel = await prisma.plan.create({
    data: {
      code: "PROFESSIONNEL",
      name: "Professionnel",
      description: "Plusieurs etablissements, comptabilite complete et espace parents.",
      priceMinor: 60_000,
      billingPeriod: "MONTHLY",
      maxSchools: 5,
      maxStudents: 1500,
      maxStaff: 200,
      sortOrder: 2,
      features: JSON.stringify([
        "ELEVES", "FRAIS", "PAIEMENTS", "BULLETINS", "COMPTABILITE", "ESPACE_PARENT", "CANTINE", "TRANSPORT",
      ]),
    },
  });

  const premium = await prisma.plan.create({
    data: {
      code: "PREMIUM",
      name: "Premium",
      description: "Groupes scolaires et universites : modules avances et assistance dediee.",
      priceMinor: 150_000,
      billingPeriod: "MONTHLY",
      maxSchools: 50,
      maxStudents: 20000,
      maxStaff: 2000,
      sortOrder: 3,
      features: JSON.stringify([
        "ELEVES", "FRAIS", "PAIEMENTS", "BULLETINS", "COMPTABILITE", "ESPACE_PARENT",
        "UNIVERSITE", "BIBLIOTHEQUE", "CANTINE", "TRANSPORT", "INVENTAIRE", "OCR", "IA",
      ]),
    },
  });

  console.log("  3 formules d'abonnement creees");
  return { essentiel, professionnel, premium };
}

type SeedSchoolInput = {
  organizationId: string;
  name: string;
  code: string;
  city: string;
  type: string;
  roles: Record<RoleCode, { id: string }>;
  passwordHash: string;
  studentCount: number;
  withTransactions: boolean;
  emailSuffix?: string;
};

async function seedSchool(input: SeedSchoolInput) {
  const suffix = input.emailSuffix ? `.${input.emailSuffix}` : "";

  const school = await prisma.school.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      code: input.code,
      type: input.type,
      address: "Rue des Jardins, lot 42",
      city: input.city,
      country: "CI",
      phone: "+225 27 22 00 00 00",
      email: `contact${suffix}@exemple.test`,
      currency: "XOF",
      currencyDecimals: 0,
      locale: "fr-CI",
      matriculePattern: "{SCHOOL}-{YY}-{SEQ:4}",
      enabledModules: JSON.stringify(["CANTINE", "TRANSPORT", "BIBLIOTHEQUE"]),
      gradingSettings: JSON.stringify({
        maxScore: 20,
        absenceRule: "EXCLURE",
        excusedAlwaysExcluded: true,
        rankingEnabled: true,
        passMarkCenti: 1000,
      }),
      accountingSettings: JSON.stringify({ referential: "SYSCOHADA", revenueOn: "EMISSION" }),
    },
  });

  console.log(`\n  Etablissement ${school.name}`);

  // --- Plan comptable, caisses, periode comptable ---
  await prisma.ledgerAccount.createMany({
    data: DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({ ...account, schoolId: school.id })),
  });

  await prisma.accountingPeriod.create({
    data: {
      schoolId: school.id,
      name: "Exercice 2025-2026",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-08-31"),
      status: "OPEN",
    },
  });

  const caisse = await prisma.financialAccount.create({
    data: {
      schoolId: school.id,
      code: "CAISSE-1",
      name: "Caisse principale",
      kind: "CAISSE",
      ledgerAccountCode: "571",
    },
  });

  await prisma.financialAccount.createMany({
    data: [
      {
        schoolId: school.id,
        code: "BANQUE-1",
        name: "Compte bancaire principal",
        kind: "BANQUE",
        bankName: "Banque de demonstration",
        accountNumber: "CI00 0000 0000 0000",
        ledgerAccountCode: "521",
      },
      {
        schoolId: school.id,
        code: "MM-1",
        name: "Compte Mobile Money",
        kind: "MOBILE_MONEY",
        ledgerAccountCode: "531",
      },
    ],
  });

  // --- Annee scolaire, periodes, structure ---
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: YEAR_NAME,
      startDate: new Date("2025-09-15"),
      endDate: new Date("2026-07-10"),
      isCurrent: true,
    },
  });

  const periods = await Promise.all(
    [
      { name: "Trimestre 1", start: "2025-09-15", end: "2025-12-20", order: 1 },
      { name: "Trimestre 2", start: "2026-01-05", end: "2026-03-28", order: 2 },
      { name: "Trimestre 3", start: "2026-04-06", end: "2026-07-10", order: 3 },
    ].map((period) =>
      prisma.gradingPeriod.create({
        data: {
          schoolId: school.id,
          academicYearId: academicYear.id,
          name: period.name,
          kind: "TRIMESTRE",
          sortOrder: period.order,
          startDate: new Date(period.start),
          endDate: new Date(period.end),
        },
      }),
    ),
  );

  const cycle = await prisma.cycle.create({
    data: { schoolId: school.id, code: "SEC1", name: "Premier cycle du secondaire", sortOrder: 1 },
  });

  const levelDefinitions =
    input.type === "PRIMAIRE"
      ? [
          { code: "CP1", name: "Cours preparatoire 1" },
          { code: "CE1", name: "Cours elementaire 1" },
          { code: "CM2", name: "Cours moyen 2" },
        ]
      : [
          { code: "6EME", name: "Sixieme" },
          { code: "5EME", name: "Cinquieme" },
          { code: "4EME", name: "Quatrieme" },
          { code: "3EME", name: "Troisieme" },
        ];

  const levels = await Promise.all(
    levelDefinitions.map((level, index) =>
      prisma.level.create({
        data: {
          schoolId: school.id,
          cycleId: cycle.id,
          code: level.code,
          name: level.name,
          sortOrder: index + 1,
        },
      }),
    ),
  );

  const track = await prisma.track.create({
    data: { schoolId: school.id, code: "GEN", name: "Enseignement general", sortOrder: 1 },
  });

  // --- Matieres ---
  const subjectDefinitions = [
    { code: "FRA", name: "Francais", coefficient: 4 },
    { code: "MATH", name: "Mathematiques", coefficient: 4 },
    { code: "ANG", name: "Anglais", coefficient: 2 },
    { code: "HG", name: "Histoire-Geographie", coefficient: 2 },
    { code: "SVT", name: "Sciences de la vie et de la terre", coefficient: 2 },
    { code: "PC", name: "Physique-Chimie", coefficient: 2 },
    { code: "EPS", name: "Education physique et sportive", coefficient: 1 },
  ];

  const subjects = await Promise.all(
    subjectDefinitions.map((subject) =>
      prisma.subject.create({
        data: {
          schoolId: school.id,
          code: subject.code,
          name: subject.name,
          defaultCoefficient: subject.coefficient,
        },
      }),
    ),
  );

  // --- Personnel et comptes utilisateurs ---
  const owner = await createStaffWithAccount({
    schoolId: school.id,
    roleId: input.roles.OWNER.id,
    passwordHash: input.passwordHash,
    email: `proprietaire${suffix}@exemple.test`,
    firstName: "Mariam",
    lastName: "DIABATE",
    jobTitle: "DIRECTION",
    createStaff: false,
  });

  const director = await createStaffWithAccount({
    schoolId: school.id,
    roleId: input.roles.DIRECTOR.id,
    passwordHash: input.passwordHash,
    email: `directeur${suffix}@exemple.test`,
    firstName: "Seydou",
    lastName: "OUATTARA",
    jobTitle: "DIRECTION",
  });

  const academicHead = await createStaffWithAccount({
    schoolId: school.id,
    roleId: input.roles.ACADEMIC_HEAD.id,
    passwordHash: input.passwordHash,
    email: `pedagogie${suffix}@exemple.test`,
    firstName: "Clarisse",
    lastName: "BROU",
    jobTitle: "DIRECTION",
  });

  const accountant = await createStaffWithAccount({
    schoolId: school.id,
    roleId: input.roles.ACCOUNTANT.id,
    passwordHash: input.passwordHash,
    email: `comptable${suffix}@exemple.test`,
    firstName: "Herve",
    lastName: "KOFFI",
    jobTitle: "COMPTABLE",
  });

  const cashier = await createStaffWithAccount({
    schoolId: school.id,
    roleId: input.roles.CASHIER.id,
    passwordHash: input.passwordHash,
    email: `caissier${suffix}@exemple.test`,
    firstName: "Esther",
    lastName: "YAO",
    jobTitle: "CAISSIER",
  });

  // Un enseignant par matiere, le premier disposant d'un compte de demonstration.
  const teachers: { staffId: string; userId: string | null }[] = [];
  for (const [index, subject] of subjects.entries()) {
    const isDemoAccount = index === 0;
    const teacher = await createStaffWithAccount({
      schoolId: school.id,
      roleId: input.roles.TEACHER.id,
      passwordHash: input.passwordHash,
      email: isDemoAccount ? `enseignant${suffix}@exemple.test` : `enseignant${index}${suffix}@exemple.test`,
      firstName: pickFrom(FIRST_NAMES_M),
      lastName: pickFrom(LAST_NAMES),
      jobTitle: "ENSEIGNANT",
      qualification: `Professeur de ${subject.name}`,
      withAccount: true,
    });
    teachers.push(teacher);
  }

  // --- Classes et affectation des matieres ---
  const classRooms: { id: string; roomLabel: string }[] = [];
  let classIndex = 0;
  for (const level of levels) {
    for (const suffixLetter of ["A", "B"]) {
      const mainTeacherId = teachers[classIndex % teachers.length].staffId;
      classIndex += 1;
      const classRoom = await prisma.classRoom.create({
        data: {
          schoolId: school.id,
          academicYearId: academicYear.id,
          levelId: level.id,
          trackId: track.id,
          name: `${level.code}-${suffixLetter}`,
          code: `${level.code}-${suffixLetter}`,
          capacity: 35,
          roomLabel: `Salle ${level.code}${suffixLetter}`,
          mainTeacherId,
        },
      });

      await prisma.classSubject.createMany({
        data: subjects.map((subject, index) => ({
          classRoomId: classRoom.id,
          subjectId: subject.id,
          teacherId: teachers[index % teachers.length].staffId,
          coefficient: subjectDefinitions[index].coefficient,
          maxScore: 20,
          hoursPerWeek: subjectDefinitions[index].coefficient,
        })),
      });

      // Emploi du temps : un creneau par matiere, du lundi au vendredi.
      await prisma.timetableSlot.createMany({
        data: subjects.map((subject, index) => ({
          schoolId: school.id,
          classRoomId: classRoom.id,
          subjectId: subject.id,
          teacherId: teachers[index % teachers.length].staffId,
          weekday: (index % 5) + 1,
          startMinute: 8 * 60 + (index % 3) * 120,
          endMinute: 8 * 60 + (index % 3) * 120 + 110,
          room: classRoom.roomLabel,
        })),
      });

      classRooms.push(classRoom);
    }
  }

  console.log(`    ${classRooms.length} classes, ${subjects.length} matieres, ${teachers.length + 5} membres du personnel`);

  // --- Catalogue de frais ---
  const feeItems = await Promise.all([
    prisma.feeItem.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        code: "INSC",
        name: "Frais d'inscription",
        category: "INSCRIPTION",
        amountMinor: 50_000,
        isMandatory: true,
        autoAssign: true,
        installmentPlan: JSON.stringify([
          { label: "Paiement unique", percentCenti: 10_000, dueDate: "2025-09-30" },
        ]),
      },
    }),
    prisma.feeItem.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        code: "SCOL",
        name: "Scolarite annuelle",
        category: "SCOLARITE",
        amountMinor: 300_000,
        isMandatory: true,
        autoAssign: true,
        // Trois tranches : 40 % / 30 % / 30 %.
        installmentPlan: JSON.stringify([
          { label: "1ere tranche", percentCenti: 4000, dueDate: "2025-10-15" },
          { label: "2eme tranche", percentCenti: 3000, dueDate: "2026-01-15" },
          { label: "3eme tranche", percentCenti: 3000, dueDate: "2026-04-15" },
        ]),
      },
    }),
    prisma.feeItem.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        code: "CANT",
        name: "Cantine scolaire",
        category: "CANTINE",
        amountMinor: 90_000,
        isMandatory: false,
        autoAssign: false,
        installmentPlan: JSON.stringify([
          { label: "1er semestre", percentCenti: 5000, dueDate: "2025-10-30" },
          { label: "2eme semestre", percentCenti: 5000, dueDate: "2026-02-28" },
        ]),
      },
    }),
  ]);

  // --- Depenses : categories, fournisseurs, pieces ---
  const expenseCategories = await Promise.all(
    [
      { code: "SAL", name: "Salaires et charges", account: "661" },
      { code: "LOY", name: "Loyer", account: "622" },
      { code: "EAU", name: "Eau et electricite", account: "605" },
      { code: "FOU", name: "Fournitures scolaires", account: "601" },
      { code: "MAI", name: "Maintenance et travaux", account: "624" },
      { code: "TRA", name: "Transport", account: "627" },
    ].map((category) =>
      prisma.expenseCategory.create({
        data: {
          schoolId: school.id,
          code: category.code,
          name: category.name,
          defaultAccountCode: category.account,
        },
      }),
    ),
  );

  const supplier = await prisma.supplier.create({
    data: {
      schoolId: school.id,
      code: "FOURN-001",
      name: "Librairie Papeterie de demonstration",
      phone: "+225 27 20 00 00 00",
      email: "fournisseur@exemple.test",
    },
  });

  await prisma.budget.createMany({
    data: expenseCategories.map((category, index) => ({
      schoolId: school.id,
      academicYearId: academicYear.id,
      label: `Budget ${category.name}`,
      category: category.code,
      plannedMinor: [9_600_000, 3_600_000, 1_200_000, 800_000, 600_000, 400_000][index] ?? 500_000,
    })),
  });

  // --- Eleves, responsables legaux, inscriptions, frais ---
  const students: { id: string; classRoomId: string }[] = [];
  let guardianAccountCreated = false;

  for (let index = 0; index < input.studentCount; index += 1) {
    const gender = random() > 0.5 ? "F" : "M";
    const firstName = gender === "F" ? pickFrom(FIRST_NAMES_F) : pickFrom(FIRST_NAMES_M);
    const lastName = pickFrom(LAST_NAMES);

    const updatedSchool = await prisma.school.update({
      where: { id: school.id },
      data: { matriculeCounter: { increment: 1 } },
      select: { code: true, matriculePattern: true, matriculeCounter: true },
    });

    const student = await prisma.student.create({
      data: {
        schoolId: school.id,
        matricule: renderMatricule(updatedSchool.matriculePattern, {
          schoolCode: updatedSchool.code,
          year: 2025,
          sequence: updatedSchool.matriculeCounter,
        }),
        firstName,
        lastName,
        gender,
        birthDate: new Date(Date.UTC(2010 + randomInt(0, 4), randomInt(0, 11), randomInt(1, 28))),
        birthPlace: pickFrom(["Abidjan", "Bouake", "Yamoussoukro", "Daloa", "San-Pedro"]),
        address: `Quartier ${pickFrom(["Cocody", "Yopougon", "Marcory", "Treichville"])}`,
        emergencyContactName: `${pickFrom(FIRST_NAMES_F)} ${lastName}`,
        emergencyContactPhone: `+225 07 ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
      },
    });

    // Responsable legal. Le premier de l'etablissement principal recoit un
    // compte parent de demonstration rattache a deux enfants.
    const guardianEmail =
      !guardianAccountCreated && input.withTransactions
        ? `parent${suffix}@exemple.test`
        : `parent${index}${suffix}@exemple.test`;

    let guardianUserId: string | null = null;
    if (!guardianAccountCreated && input.withTransactions) {
      const guardianUser = await prisma.user.create({
        data: {
          email: guardianEmail,
          passwordHash: input.passwordHash,
          firstName: "Jean",
          lastName: "KOUASSI",
          phone: "+225 07 11 22 33 44",
        },
      });
      await prisma.membership.create({
        data: {
          userId: guardianUser.id,
          schoolId: school.id,
          roleId: input.roles.GUARDIAN.id,
          isDefault: true,
        },
      });
      guardianUserId = guardianUser.id;
    }

    const guardian = await prisma.guardian.create({
      data: {
        schoolId: school.id,
        userId: guardianUserId,
        firstName: guardianUserId ? "Jean" : pickFrom(FIRST_NAMES_M),
        lastName: guardianUserId ? "KOUASSI" : lastName,
        phone: `+225 05 ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
        email: guardianEmail,
        profession: pickFrom(["Commercant", "Enseignant", "Infirmier", "Artisan", "Fonctionnaire"]),
      },
    });

    await prisma.studentGuardian.create({
      data: {
        studentId: student.id,
        guardianId: guardian.id,
        relation: "PERE",
        isPrimary: true,
      },
    });

    // Le parent de demonstration recoit un second enfant au tour suivant.
    if (guardianUserId && !guardianAccountCreated) {
      guardianAccountCreated = true;
    } else if (index === 1 && input.withTransactions) {
      const demoGuardian = await prisma.guardian.findFirst({
        where: { schoolId: school.id, userId: { not: null } },
        select: { id: true },
      });
      if (demoGuardian) {
        await prisma.studentGuardian.create({
          data: { studentId: student.id, guardianId: demoGuardian.id, relation: "PERE" },
        });
      }
    }

    const classRoom = classRooms[index % classRooms.length];
    await prisma.enrollment.create({
      data: {
        schoolId: school.id,
        studentId: student.id,
        academicYearId: academicYear.id,
        classRoomId: classRoom.id,
        kind: random() > 0.3 ? "INSCRIPTION" : "REINSCRIPTION",
        status: "ACTIVE",
      },
    });

    // Frais obligatoires + cantine pour une partie des eleves.
    for (const feeItem of feeItems) {
      if (!feeItem.autoAssign && random() > 0.4) continue;
      await assignFeeToStudent({
        schoolId: school.id,
        studentId: student.id,
        academicYearId: academicYear.id,
        feeItemId: feeItem.id,
        label: feeItem.name,
        category: feeItem.category,
        grossAmountMinor: feeItem.amountMinor,
        installmentPlan: parseInstallmentPlan(feeItem.installmentPlan),
        userId: accountant.userId!,
      });
    }

    students.push({ id: student.id, classRoomId: classRoom.id });
  }

  console.log(`    ${students.length} eleves inscrits avec leurs frais`);

  // --- Un eleve boursier, pour illustrer les remises ---
  const scholarshipFee = await prisma.feeAssignment.findFirst({
    where: { schoolId: school.id, category: "SCOLARITE" },
    select: { id: true },
  });
  if (scholarshipFee) {
    await prisma.discount.create({
      data: {
        feeAssignmentId: scholarshipFee.id,
        kind: "BOURSE",
        label: "Bourse d'excellence",
        percentCenti: 5000, // 50,00 %
        grantedById: director.userId,
        reason: "Resultats scolaires exceptionnels (donnee de demonstration).",
      },
    });
  }

  if (!input.withTransactions) {
    await seedAnnouncements(school.id, director.userId!, classRooms[0]?.id);
    return { schoolId: school.id, ownerId: owner.userId! };
  }

  // --- Encaissements de demonstration ---
  let paymentCount = 0;
  for (const [index, student] of students.entries()) {
    // Environ trois quarts des familles ont deja regle une partie.
    if (random() > 0.75) continue;

    const amount = pickFrom([50_000, 100_000, 120_000, 150_000, 200_000]);
    const method = pickFrom(["ESPECES", "MOBILE_MONEY", "VIREMENT", "CHEQUE"]);
    const paidAt = new Date(2025, 9 + Math.floor(random() * 3), randomInt(1, 28));

    await recordPayment({
      schoolId: school.id,
      studentId: student.id,
      amountMinor: amount,
      method,
      paidAt,
      cashierId: cashier.userId!,
      financialAccountId: caisse.id,
      idempotencyKey: `seed-payment-${school.id}-${index}`,
      academicYearId: academicYear.id,
    });
    paymentCount += 1;
  }
  console.log(`    ${paymentCount} encaissements enregistres avec recu et ecriture comptable`);

  // --- Justificatifs en attente (le cas metier central du cahier des charges) ---
  for (const student of students.slice(0, 4)) {
    await submitPaymentProof({
      schoolId: school.id,
      studentId: student.id,
      declaredAmountMinor: pickFrom([50_000, 75_000, 100_000]),
      declaredMethod: "MOBILE_MONEY",
      declaredReference: `MM${randomInt(100000, 999999)}`,
      declaredPaidAt: new Date(2025, 10, randomInt(1, 28)),
      submittedById: accountant.userId!,
    });
  }
  console.log("    4 justificatifs en attente de confirmation");

  // --- Depenses ---
  const expenseSamples = [
    { category: 0, label: "Salaires du personnel - octobre", amount: 2_400_000, status: "PAID" },
    { category: 1, label: "Loyer des locaux - octobre", amount: 450_000, status: "PAID" },
    { category: 2, label: "Facture d'electricite - octobre", amount: 185_000, status: "PAID" },
    { category: 3, label: "Fournitures et manuels scolaires", amount: 320_000, status: "PAID" },
    { category: 4, label: "Reparation de la toiture du bloc B", amount: 540_000, status: "APPROVED" },
    { category: 5, label: "Carburant du bus scolaire", amount: 160_000, status: "REQUESTED" },
  ];

  for (const [index, sample] of expenseSamples.entries()) {
    const category = expenseCategories[sample.category];
    const paidAt = sample.status === "PAID" ? new Date(2025, 9, randomInt(5, 28)) : null;

    const expense = await prisma.expense.create({
      data: {
        schoolId: school.id,
        categoryId: category.id,
        supplierId: index === 3 ? supplier.id : null,
        financialAccountId: caisse.id,
        reference: `DEP-202510-${String(index + 1).padStart(5, "0")}`,
        label: sample.label,
        amountMinor: sample.amount,
        status: sample.status,
        paymentMethod: "VIREMENT",
        invoiceNumber: `FACT-${randomInt(1000, 9999)}`,
        invoiceDate: new Date(2025, 9, randomInt(1, 20)),
        paidAt,
        approvedById: sample.status !== "REQUESTED" ? director.userId : null,
        approvedAt: sample.status !== "REQUESTED" ? new Date(2025, 9, 25) : null,
      },
    });

    // Seules les depenses reellement payees generent une ecriture.
    if (sample.status === "PAID") {
      const { postJournalEntry } = await import("../src/lib/domain/accounting");
      await postJournalEntry(prisma, {
        schoolId: school.id,
        journalCode: "AC",
        date: paidAt!,
        label: sample.label,
        sourceType: "EXPENSE",
        sourceId: expense.id,
        postedById: accountant.userId,
        lines: [
          { accountCode: category.defaultAccountCode, debitMinor: sample.amount },
          { accountCode: "521", creditMinor: sample.amount },
        ],
      });
    }
  }
  console.log("    6 depenses enregistrees");

  // --- Evaluations et notes du premier trimestre ---
  const firstPeriod = periods[0];
  let gradeCount = 0;

  for (const classRoom of classRooms.slice(0, 4)) {
    const enrolled = await prisma.enrollment.findMany({
      where: { classRoomId: classRoom.id, status: "ACTIVE" },
      select: { studentId: true },
    });
    if (enrolled.length === 0) continue;

    const classSubjects = await prisma.classSubject.findMany({
      where: { classRoomId: classRoom.id },
      select: { subjectId: true, teacherId: true, coefficient: true },
    });

    for (const classSubject of classSubjects) {
      for (const [evaluationIndex, kind] of ["INTERROGATION", "DEVOIR", "EXAMEN"].entries()) {
        const evaluation = await prisma.evaluation.create({
          data: {
            schoolId: school.id,
            academicYearId: academicYear.id,
            gradingPeriodId: firstPeriod.id,
            classRoomId: classRoom.id,
            subjectId: classSubject.subjectId,
            teacherId: classSubject.teacherId,
            title: `${kind === "EXAMEN" ? "Composition" : kind === "DEVOIR" ? "Devoir surveille" : "Interrogation ecrite"} ${evaluationIndex + 1}`,
            kind,
            date: new Date(2025, 9 + evaluationIndex, randomInt(5, 25)),
            maxScore: 20,
            coefficient: kind === "EXAMEN" ? 2 : 1,
            status: "VALIDATED",
          },
        });

        await prisma.grade.createMany({
          data: enrolled.map((enrollment) => {
            // 3 % d'absences pour exercer la regle de traitement des absences.
            const absent = random() < 0.03;
            return {
              schoolId: school.id,
              evaluationId: evaluation.id,
              studentId: enrollment.studentId,
              scoreCenti: absent ? null : randomInt(500, 1850),
              isAbsent: absent,
              isExcused: absent && random() < 0.5,
            };
          }),
        });
        gradeCount += enrolled.length;
      }
    }

    await generateReportCards({
      schoolId: school.id,
      classRoomId: classRoom.id,
      gradingPeriodId: firstPeriod.id,
      userId: academicHead.userId!,
    });
  }
  console.log(`    ${gradeCount} notes saisies et bulletins generes (4 classes)`);

  // --- Devoirs et remises ---
  for (const classRoom of classRooms.slice(0, 3)) {
    const classSubject = await prisma.classSubject.findFirst({
      where: { classRoomId: classRoom.id },
      select: { subjectId: true, teacherId: true },
    });
    if (!classSubject) continue;

    const assignment = await prisma.assignment.create({
      data: {
        schoolId: school.id,
        classRoomId: classRoom.id,
        subjectId: classSubject.subjectId,
        teacherId: classSubject.teacherId,
        title: "Exercices de revision - chapitre 3",
        description:
          "Traiter les exercices 1 a 8 de la page 42. Remise sous forme de document scanne ou de texte saisi.",
        dueAt: new Date(Date.now() + 7 * 86_400_000),
        maxScore: 20,
        status: "PUBLISHED",
      },
    });

    const enrolled = await prisma.enrollment.findMany({
      where: { classRoomId: classRoom.id, status: "ACTIVE" },
      select: { studentId: true },
    });

    await prisma.submission.createMany({
      data: enrolled.map((enrollment) => {
        const roll = random();
        return {
          assignmentId: assignment.id,
          studentId: enrollment.studentId,
          status: roll < 0.5 ? "REMIS" : roll < 0.7 ? "EN_RETARD" : "A_FAIRE",
          submittedAt: roll < 0.7 ? new Date() : null,
          content: roll < 0.7 ? "Travail remis par l'eleve (donnee de demonstration)." : "",
        };
      }),
    });
  }

  // --- Absences du mois en cours ---
  const attendanceClass = classRooms[0];
  const attendanceStudents = await prisma.enrollment.findMany({
    where: { classRoomId: attendanceClass.id, status: "ACTIVE" },
    select: { studentId: true },
  });

  for (let dayOffset = 1; dayOffset <= 10; dayOffset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    await prisma.attendance.createMany({
      data: attendanceStudents.map((enrollment) => {
        const roll = random();
        return {
          schoolId: school.id,
          studentId: enrollment.studentId,
          classRoomId: attendanceClass.id,
          date,
          status: roll < 0.05 ? "ABSENT" : roll < 0.1 ? "RETARD" : "PRESENT",
          minutesLate: roll >= 0.05 && roll < 0.1 ? randomInt(5, 30) : 0,
        };
      }),
    });
  }

  await seedAnnouncements(school.id, director.userId!, classRooms[0]?.id);
  await seedLibrary(school.id, students);

  return { schoolId: school.id, ownerId: owner.userId! };
}

/**
 * Fonds documentaire de demonstration et quelques prets, dont un en retard :
 * l'ecran de bibliotheque doit montrer un cas reel, pas une page vide.
 */
async function seedLibrary(schoolId: string, students: { id: string }[]) {
  const catalogue = [
    { reference: "LIT-0001", title: "Une si longue lettre", author: "Mariama BA", kind: "LIVRE", category: "Litterature", copies: 4, shelf: "Rayon A1" },
    { reference: "LIT-0002", title: "Les soleils des independances", author: "Ahmadou KOUROUMA", kind: "LIVRE", category: "Litterature", copies: 3, shelf: "Rayon A1" },
    { reference: "LIT-0003", title: "L'enfant noir", author: "Camara LAYE", kind: "LIVRE", category: "Litterature", copies: 5, shelf: "Rayon A2" },
    { reference: "SCI-0001", title: "Mathematiques 6e", author: "Collectif", kind: "MANUEL", category: "Sciences", copies: 20, shelf: "Rayon C1" },
    { reference: "SCI-0002", title: "Sciences de la vie et de la Terre 5e", author: "Collectif", kind: "MANUEL", category: "Sciences", copies: 18, shelf: "Rayon C1" },
    { reference: "HIS-0001", title: "Histoire-Geographie 4e", author: "Collectif", kind: "MANUEL", category: "Histoire", copies: 15, shelf: "Rayon C2" },
    { reference: "REV-0001", title: "Jeune Afrique - annee en cours", author: "", kind: "REVUE", category: "Actualite", copies: 2, shelf: "Presentoir" },
  ];

  const items = [];
  for (const entry of catalogue) {
    const item = await prisma.libraryItem.create({
      data: {
        schoolId,
        reference: entry.reference,
        title: entry.title,
        author: entry.author,
        kind: entry.kind,
        category: entry.category,
        totalCopies: entry.copies,
        shelf: entry.shelf,
      },
      select: { id: true },
    });
    items.push(item);
  }

  const day = 86_400_000;
  const loans = [
    { item: 0, student: 0, loanedDaysAgo: 5, dueInDays: 9 },
    { item: 1, student: 1, loanedDaysAgo: 20, dueInDays: -6 }, // en retard
    { item: 3, student: 2, loanedDaysAgo: 2, dueInDays: 12 },
    { item: 4, student: 3, loanedDaysAgo: 30, dueInDays: -16 }, // en retard
  ];

  for (const loan of loans) {
    const student = students[loan.student];
    if (!student || !items[loan.item]) continue;
    await prisma.libraryLoan.create({
      data: {
        schoolId,
        itemId: items[loan.item].id,
        studentId: student.id,
        loanedAt: new Date(Date.now() - loan.loanedDaysAgo * day),
        dueDate: new Date(Date.now() + loan.dueInDays * day),
        status: "EN_COURS",
      },
    });
  }

  // Un pret deja rendu, pour que l'historique ne soit pas vide.
  if (students[4] && items[2]) {
    await prisma.libraryLoan.create({
      data: {
        schoolId,
        itemId: items[2].id,
        studentId: students[4].id,
        loanedAt: new Date(Date.now() - 40 * day),
        dueDate: new Date(Date.now() - 26 * day),
        returnedAt: new Date(Date.now() - 28 * day),
        status: "RENDU",
        condition: "Bon etat",
      },
    });
  }
}

async function seedAnnouncements(schoolId: string, authorId: string, classRoomId?: string) {
  await prisma.announcement.createMany({
    data: [
      {
        schoolId,
        authorId,
        title: "Reunion parents-professeurs",
        body:
          "La reunion parents-professeurs du premier trimestre se tiendra le samedi a partir de 9h " +
          "dans le preau. Votre presence est vivement souhaitee.",
        audiences: JSON.stringify(["GUARDIAN"]),
        isPinned: true,
      },
      {
        schoolId,
        authorId,
        title: "Rappel : echeance de la 2eme tranche",
        body:
          "La deuxieme tranche de scolarite est exigible le 15 janvier. " +
          "Les reglements se font a la caisse ou par Mobile Money avec depot du justificatif.",
        audiences: JSON.stringify(["GUARDIAN"]),
      },
      {
        schoolId,
        authorId,
        classRoomId: classRoomId ?? null,
        title: "Sortie pedagogique",
        body: "Une sortie pedagogique est organisee le mois prochain. Autorisation parentale requise.",
        audiences: JSON.stringify(["GUARDIAN", "STUDENT"]),
      },
    ],
  });
}

type StaffAccountInput = {
  schoolId: string;
  roleId: string;
  passwordHash: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  qualification?: string;
  createStaff?: boolean;
  withAccount?: boolean;
};

async function createStaffWithAccount(input: StaffAccountInput) {
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: `+225 07 ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
    },
  });

  await prisma.membership.create({
    data: {
      userId: user.id,
      schoolId: input.schoolId,
      roleId: input.roleId,
      isDefault: true,
      status: "ACTIVE",
    },
  });

  let staffId: string | null = null;

  if (input.createStaff !== false) {
    const count = await prisma.staff.count({ where: { schoolId: input.schoolId } });
    const staff = await prisma.staff.create({
      data: {
        schoolId: input.schoolId,
        userId: user.id,
        staffNumber: `PERS-${String(count + 1).padStart(4, "0")}`,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        jobTitle: input.jobTitle,
        qualification: input.qualification ?? "",
        contractType: "CDI",
        contractStart: new Date("2025-09-01"),
        baseSalaryMinor: input.jobTitle === "ENSEIGNANT" ? 250_000 : 400_000,
      },
      select: { id: true },
    });
    staffId = staff.id;
  }

  return { userId: user.id, staffId: staffId ?? "" };
}

async function printSummary(mainSchoolId: string, secondarySchoolId: string) {
  const [students, payments, proofs, entries] = await Promise.all([
    prisma.student.count(),
    prisma.payment.count(),
    prisma.paymentProof.count({ where: { status: "EN_ATTENTE" } }),
    prisma.journalEntry.count(),
  ]);

  console.log("\n" + "=".repeat(74));
  console.log("DONNEES DE DEMONSTRATION PRETES");
  console.log("=".repeat(74));
  console.log(`  Eleves : ${students}   Encaissements : ${payments}   ` +
    `Justificatifs en attente : ${proofs}   Ecritures comptables : ${entries}`);
  console.log(`\n  Mot de passe commun a tous les comptes : ${DEMO_PASSWORD}\n`);
  console.log("  COMPTES DE DEMONSTRATION (etablissement Cocody)");
  console.log("  " + "-".repeat(70));
  console.log("  superadmin@exemple.test     Super-administrateur de la plateforme");
  console.log("  proprietaire@exemple.test   Proprietaire (acces aux 2 etablissements)");
  console.log("  directeur@exemple.test      Directeur");
  console.log("  pedagogie@exemple.test      Responsable pedagogique");
  console.log("  comptable@exemple.test      Comptable (valide les justificatifs)");
  console.log("  caissier@exemple.test       Caissier (encaisse, ne valide pas)");
  console.log("  enseignant@exemple.test     Enseignant");
  console.log("  parent@exemple.test         Parent (2 enfants rattaches)");
  console.log("\n  Second etablissement (Yopougon) : memes adresses avec .yop");
  console.log("  ex. directeur.yop@exemple.test - sert a verifier l'isolation des donnees.");
  console.log("=".repeat(74) + "\n");
}

main()
  .catch((error) => {
    console.error("\nEchec du seed :", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
