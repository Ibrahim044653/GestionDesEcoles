import { prisma } from "@/lib/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { hashPassword, generateToken } from "@/lib/auth/password";
import { ROLES } from "@/lib/constants";
import { DEFAULT_CHART_OF_ACCOUNTS } from "./accounting";

/**
 * Creation d'un client (organisation) et d'un etablissement.
 *
 * Un etablissement cree ici doit etre IMMEDIATEMENT utilisable : sans plan
 * comptable, le premier encaissement echouerait en reclamant des comptes que
 * l'utilisateur n'a aucune raison de connaitre. Le plan SYSCOHADA par defaut
 * est donc pose a la creation.
 *
 * Ce qui n'est PAS pose automatiquement, et pourquoi :
 * annee scolaire, periodes, niveaux, classes, matieres et frais. Ces choix
 * engagent la pedagogie et la tarification de l'etablissement ; les deviner
 * produirait une configuration plausible mais fausse, plus penible a corriger
 * qu'a saisir. L'ecran de creation le dit explicitement.
 */

/** Identifiant d'URL : minuscules, tirets, sans accent. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Code d'etablissement : majuscules, tirets. */
export function schoolCode(value: string): string {
  return slugify(value).toUpperCase().slice(0, 20) || "ECOLE";
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "client";
  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? root : `${root}-${suffix}`;
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new ConflictError("Impossible de generer un identifiant unique pour ce client.");
}

export type SchoolInput = {
  name: string;
  type: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency?: string;
  matriculePattern?: string;
};

const SCHOOL_TYPES = [
  "PRESCOLAIRE",
  "PRIMAIRE",
  "COLLEGE",
  "LYCEE",
  "UNIVERSITE",
  "FORMATION_PRO",
];

function validateSchool(input: SchoolInput) {
  if (!input.name.trim()) {
    throw new ValidationError("Le nom de l'etablissement est obligatoire.", {
      schoolName: ["Indiquez un nom."],
    });
  }
  if (!SCHOOL_TYPES.includes(input.type)) {
    throw new ValidationError(`Type d'etablissement inconnu : ${input.type}.`);
  }
}

/** Pose le plan comptable d'un etablissement neuf. */
async function seedChartOfAccounts(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  schoolId: string,
) {
  await tx.ledgerAccount.createMany({
    data: DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({ ...account, schoolId })),
  });
}

/**
 * Cree un etablissement dans une organisation existante.
 *
 * Refuse si la formule souscrite ne le permet plus : depasser silencieusement
 * la limite reviendrait a facturer un service non souscrit.
 */
export async function createSchoolInOrganization(input: {
  organizationId: string;
  school: SchoolInput;
  userId: string;
}): Promise<{ schoolId: string }> {
  validateSchool(input.school);

  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      name: true,
      _count: { select: { schools: true } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, plan: { select: { name: true, maxSchools: true } } },
      },
    },
  });

  if (!organization) throw new NotFoundError("Client introuvable.");

  const subscription = organization.subscriptions[0];
  if (subscription && organization._count.schools >= subscription.plan.maxSchools) {
    throw new ConflictError(
      `La formule « ${subscription.plan.name} » autorise ${subscription.plan.maxSchools} etablissement(s). ` +
        `Changez de formule pour en ajouter un.`,
    );
  }

  const code = schoolCode(input.school.name);
  const clash = await prisma.school.findFirst({
    where: { organizationId: input.organizationId, code },
    select: { id: true },
  });

  const schoolId = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        organizationId: input.organizationId,
        name: input.school.name.trim(),
        // Code deja pris dans cette organisation : on suffixe plutot que
        // d'echouer, l'utilisateur pourra le corriger dans les parametres.
        code: clash ? `${code}-${organization._count.schools + 1}` : code,
        type: input.school.type,
        city: input.school.city?.trim() ?? "",
        address: input.school.address?.trim() ?? "",
        phone: input.school.phone?.trim() ?? "",
        email: input.school.email?.trim() ?? "",
        currency: input.school.currency || "XOF",
        matriculePattern: input.school.matriculePattern || "{SCHOOL}-{YEAR}-{SEQ:4}",
      },
      select: { id: true },
    });

    await seedChartOfAccounts(tx, school.id);
    return school.id;
  });

  await recordAudit({
    action: "school.created",
    schoolId,
    userId: input.userId,
    entityType: "school",
    entityId: schoolId,
    metadata: { nom: input.school.name, client: organization.name },
  });

  return { schoolId };
}

/**
 * Cree un client complet : organisation, premier etablissement, compte
 * proprietaire et abonnement.
 *
 * Le mot de passe provisoire est RETOURNE une seule fois et n'est jamais
 * stocke en clair : il est remis de vive voix ou par un canal distinct, puis
 * change a la premiere connexion.
 */
export async function createClient(input: {
  organizationName: string;
  country?: string;
  school: SchoolInput;
  owner: { email: string; firstName: string; lastName: string; phone?: string };
  planId: string;
  trialDays?: number;
  userId: string;
}): Promise<{ organizationId: string; schoolId: string; temporaryPassword: string }> {
  validateSchool(input.school);

  if (!input.organizationName.trim()) {
    throw new ValidationError("Le nom du client est obligatoire.", {
      organizationName: ["Indiquez un nom."],
    });
  }

  const email = input.owner.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ValidationError("Adresse e-mail du proprietaire invalide.", {
      ownerEmail: ["Adresse invalide."],
    });
  }

  const plan = await prisma.plan.findUnique({
    where: { id: input.planId },
    select: { id: true, name: true },
  });
  if (!plan) throw new ValidationError("Formule d'abonnement introuvable.");

  const ownerRole = await prisma.role.findUnique({
    where: { code: ROLES.OWNER },
    select: { id: true },
  });
  if (!ownerRole) {
    throw new ConflictError(
      "Le role Proprietaire n'existe pas en base. Les roles doivent etre initialises avant toute creation de client.",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  const slug = await uniqueSlug(slugify(input.organizationName));
  const temporaryPassword = generateToken(9);
  const passwordHash = await hashPassword(temporaryPassword);

  const result = await prisma.$transaction(
    async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organizationName.trim(), slug, country: input.country || "CI" },
        select: { id: true },
      });

      const school = await tx.school.create({
        data: {
          organizationId: organization.id,
          name: input.school.name.trim(),
          code: schoolCode(input.school.name),
          type: input.school.type,
          city: input.school.city?.trim() ?? "",
          address: input.school.address?.trim() ?? "",
          phone: input.school.phone?.trim() ?? "",
          email: input.school.email?.trim() ?? "",
          currency: input.school.currency || "XOF",
          matriculePattern: input.school.matriculePattern || "{SCHOOL}-{YEAR}-{SEQ:4}",
        },
        select: { id: true },
      });

      await seedChartOfAccounts(tx, school.id);

      // Un compte existant est REUTILISE, jamais ecrase : la meme personne
      // peut etre proprietaire de plusieurs clients, et son mot de passe
      // actuel doit continuer de fonctionner.
      const owner = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { status: "ACTIVE" },
            select: { id: true },
          })
        : await tx.user.create({
            data: {
              email,
              passwordHash,
              firstName: input.owner.firstName.trim(),
              lastName: input.owner.lastName.trim(),
              phone: input.owner.phone?.trim() ?? "",
              mustChangePassword: true,
            },
            select: { id: true },
          });

      await tx.membership.create({
        data: {
          schoolId: school.id,
          userId: owner.id,
          roleId: ownerRole.id,
          status: "ACTIVE",
          isDefault: true,
        },
      });

      const trialDays = Math.max(0, Math.min(365, input.trialDays ?? 30));
      await tx.subscription.create({
        data: {
          organizationId: organization.id,
          planId: plan.id,
          status: trialDays > 0 ? "TRIAL" : "ACTIVE",
          trialEndsAt:
            trialDays > 0 ? new Date(Date.now() + trialDays * 86_400_000) : null,
        },
      });

      return { organizationId: organization.id, schoolId: school.id, reused: Boolean(existingUser) };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  await recordAudit({
    action: "client.created",
    schoolId: result.schoolId,
    userId: input.userId,
    entityType: "organization",
    entityId: result.organizationId,
    metadata: {
      client: input.organizationName,
      etablissement: input.school.name,
      formule: plan.name,
      proprietaire: email,
      compteExistantReutilise: result.reused,
    },
  });

  return {
    organizationId: result.organizationId,
    schoolId: result.schoolId,
    // Si le compte existait deja, son mot de passe n'a pas ete touche.
    temporaryPassword: result.reused ? "" : temporaryPassword,
  };
}
