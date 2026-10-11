import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDatabase } from "./helpers/db";
import {
  createClient,
  createSchoolInOrganization,
  schoolCode,
  slugify,
} from "@/lib/domain/provisioning";
import { verifyPassword } from "@/lib/auth/password";
import { ROLES } from "@/lib/constants";
import { ConflictError, ValidationError } from "@/lib/errors";

/**
 * Creation d'un client et d'un etablissement.
 *
 * Deux garanties tiennent ici : un etablissement neuf doit etre
 * IMMEDIATEMENT utilisable (plan comptable pose), et la limite de la formule
 * souscrite doit etre opposable — la depasser reviendrait a livrer un service
 * non facture.
 */

let planId: string;
let userId: string;

beforeEach(async () => {
  await resetDatabase();
  await prisma.role.create({ data: { code: ROLES.OWNER, name: "Proprietaire", isSystem: true } });
  const plan = await prisma.plan.create({
    data: { code: "ESSENTIEL", name: "Essentiel", maxSchools: 2, maxStudents: 200 },
  });
  planId = plan.id;

  // Auteur reel des operations : recordAudit referencant l'utilisateur, un
  // identifiant fictif ferait echouer l'ecriture du journal (en silence, mais
  // le test n'aurait alors pas verifie ce qu'il croit verifier).
  const admin = await prisma.user.create({
    data: {
      email: "admin-plateforme@test.local",
      passwordHash: "scrypt$placeholder",
      firstName: "Test",
      lastName: "ADMIN",
      isSuperAdmin: true,
    },
  });
  userId = admin.id;
});

const ecole = { name: "Groupe Scolaire Excellence", type: "COLLEGE", city: "Cocody" };
const proprio = { email: "Proprio@Exemple.TEST", firstName: "Mariam", lastName: "DIABATE" };

describe("slugify et schoolCode", () => {
  it("retire les accents et normalise", () => {
    expect(slugify("Groupe Scolaire Excellence — Côte d'Ivoire")).toBe(
      "groupe-scolaire-excellence-cote-d-ivoire",
    );
    expect(schoolCode("Lycée Moderne")).toBe("LYCEE-MODERNE");
  });

  it("ne produit jamais de chaine vide", () => {
    expect(schoolCode("!!!")).toBe("ECOLE");
  });
});

describe("createClient", () => {
  it("cree l'organisation, l'ecole, le proprietaire et l'abonnement", async () => {
    const result = await createClient({
      organizationName: "Groupe Excellence",
      school: ecole,
      owner: proprio,
      planId,
      userId,
    });

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: result.organizationId },
      include: { schools: true, subscriptions: true },
    });

    expect(org.slug).toBe("groupe-excellence");
    expect(org.schools).toHaveLength(1);
    expect(org.subscriptions[0].status).toBe("TRIAL");

    // L'e-mail est normalise en minuscules : sinon le meme compte pourrait
    // etre cree deux fois avec des casses differentes.
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "proprio@exemple.test" },
    });
    expect(owner.mustChangePassword).toBe(true);

    const membership = await prisma.membership.findFirstOrThrow({
      where: { userId: owner.id },
      include: { role: true },
    });
    expect(membership.role.code).toBe(ROLES.OWNER);
    expect(membership.schoolId).toBe(result.schoolId);
  });

  it("pose le plan comptable : l'ecole est utilisable immediatement", async () => {
    const result = await createClient({
      organizationName: "Groupe Excellence",
      school: ecole,
      owner: proprio,
      planId,
      userId,
    });

    const comptes = await prisma.ledgerAccount.count({ where: { schoolId: result.schoolId } });
    expect(comptes).toBeGreaterThan(0);
  });

  it("retourne un mot de passe provisoire qui fonctionne reellement", async () => {
    const result = await createClient({
      organizationName: "Groupe Excellence",
      school: ecole,
      owner: proprio,
      planId,
      userId,
    });

    expect(result.temporaryPassword).not.toBe("");
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "proprio@exemple.test" } });
    expect(await verifyPassword(result.temporaryPassword, owner.passwordHash)).toBe(true);
  });

  it("reutilise un compte existant sans toucher a son mot de passe", async () => {
    const premier = await createClient({
      organizationName: "Premier Client",
      school: ecole,
      owner: proprio,
      planId,
      userId,
    });

    const avant = await prisma.user.findUniqueOrThrow({ where: { email: "proprio@exemple.test" } });

    const second = await createClient({
      organizationName: "Second Client",
      school: { ...ecole, name: "Autre Ecole" },
      owner: proprio,
      planId,
      userId,
    });

    const apres = await prisma.user.findUniqueOrThrow({ where: { email: "proprio@exemple.test" } });

    // Le mot de passe actuel du proprietaire doit continuer de fonctionner.
    expect(apres.passwordHash).toBe(avant.passwordHash);
    expect(second.temporaryPassword).toBe("");

    // Un seul compte proprietaire, deux rattachements : il basculera par le
    // selecteur du haut.
    expect(await prisma.user.count({ where: { email: "proprio@exemple.test" } })).toBe(1);
    expect(await prisma.membership.count({ where: { userId: apres.id } })).toBe(2);
    expect(premier.organizationId).not.toBe(second.organizationId);
  });

  it("rend les identifiants d'URL uniques", async () => {
    await createClient({ organizationName: "Excellence", school: ecole, owner: proprio, planId, userId });
    const second = await createClient({
      organizationName: "Excellence",
      school: ecole,
      owner: { ...proprio, email: "autre@exemple.test" },
      planId,
      userId,
    });
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: second.organizationId } });
    expect(org.slug).toBe("excellence-1");
  });

  it("refuse une adresse e-mail invalide", async () => {
    await expect(
      createClient({
        organizationName: "Excellence",
        school: ecole,
        owner: { ...proprio, email: "pas-une-adresse" },
        planId,
        userId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Rien ne doit subsister d'une creation refusee.
    expect(await prisma.organization.count()).toBe(0);
  });

  it("refuse un type d'etablissement inconnu", async () => {
    await expect(
      createClient({
        organizationName: "Excellence",
        school: { ...ecole, type: "GARAGE" },
        owner: proprio,
        planId,
        userId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse un nom vide", async () => {
    await expect(
      createClient({
        organizationName: "   ",
        school: ecole,
        owner: proprio,
        planId,
        userId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("createSchoolInOrganization", () => {
  it("ajoute une ecole avec son plan comptable", async () => {
    const client = await createClient({
      organizationName: "Groupe Excellence",
      school: ecole,
      owner: proprio,
      planId,
      userId,
    });

    const seconde = await createSchoolInOrganization({
      organizationId: client.organizationId,
      school: { name: "Annexe Yopougon", type: "COLLEGE" },
      userId,
    });

    expect(await prisma.school.count({ where: { organizationId: client.organizationId } })).toBe(2);
    expect(await prisma.ledgerAccount.count({ where: { schoolId: seconde.schoolId } })).toBeGreaterThan(0);
  });

  it("oppose la limite de la formule souscrite", async () => {
    const client = await createClient({
      organizationName: "Groupe Excellence",
      school: ecole,
      owner: proprio,
      planId,
      userId,
    });

    // La formule autorise 2 etablissements : le deuxieme passe...
    await createSchoolInOrganization({
      organizationId: client.organizationId,
      school: { name: "Annexe Yopougon", type: "COLLEGE" },
      userId,
    });

    // ...le troisieme est refuse.
    await expect(
      createSchoolInOrganization({
        organizationId: client.organizationId,
        school: { name: "Annexe Abobo", type: "COLLEGE" },
        userId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await prisma.school.count({ where: { organizationId: client.organizationId } })).toBe(2);
  });

  it("suffixe le code plutot que d'echouer sur un doublon", async () => {
    const client = await createClient({
      organizationName: "Groupe Excellence",
      school: ecole,
      owner: proprio,
      planId,
      userId,
    });

    // Meme nom, donc meme code calcule.
    const seconde = await createSchoolInOrganization({
      organizationId: client.organizationId,
      school: ecole,
      userId,
    });

    const [a, b] = await prisma.school.findMany({
      where: { organizationId: client.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, code: true },
    });
    expect(a.code).not.toBe(b.code);
    expect(b.id).toBe(seconde.schoolId);
  });
});
