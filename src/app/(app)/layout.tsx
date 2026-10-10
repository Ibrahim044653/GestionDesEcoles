import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { initials } from "@/lib/format";
import { AppShell, type NavEntry } from "@/components/client/shell";
import { logoutAction, switchSchoolAction } from "@/app/connexion/actions";

/**
 * Enveloppe des pages authentifiees.
 *
 * Ce layout etablit le contexte (utilisateur, etablissement actif, navigation
 * autorisee). Il ne constitue PAS le controle d'acces : chaque page et chaque
 * Server Action refait sa propre verification de permission et de tenant.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect("/connexion");

  const [unreadNotifications, pendingProofs, pendingSubmissions] = await Promise.all([
    prisma.notification.count({ where: { userId: context.user.id, readAt: null } }),
    context.permissions.has(PERMISSIONS.PROOF_REVIEW) && context.school
      ? prisma.paymentProof.count({ where: { schoolId: context.school.id, status: "EN_ATTENTE" } })
      : Promise.resolve(0),
    context.permissions.has(PERMISSIONS.ASSIGNMENT_GRADE) && context.school
      ? prisma.submission.count({
          where: {
            status: { in: ["REMIS", "EN_RETARD"] },
            assignment: { schoolId: context.school.id },
          },
        })
      : Promise.resolve(0),
  ]);

  const navigation = buildNavigation(context.permissions, {
    pendingProofs,
    pendingSubmissions,
    isSuperAdmin: context.user.isSuperAdmin,
  });

  return (
    <AppShell
      user={{
        fullName: context.user.fullName,
        initials: initials(context.user.firstName, context.user.lastName),
        roleName: context.membership?.roleName ?? "Super-administrateur",
        email: context.user.email,
      }}
      school={context.school}
      availableSchools={context.availableSchools}
      navigation={navigation}
      unreadNotifications={unreadNotifications}
      switchSchoolAction={switchSchoolAction}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}

/**
 * Construit la navigation a partir des permissions effectives.
 * Masquer une entree est une commodite : la page cible verifie malgre tout.
 */
function buildNavigation(
  permissions: Set<string>,
  options: { pendingProofs: number; pendingSubmissions: number; isSuperAdmin: boolean },
): NavEntry[] {
  const P = PERMISSIONS;
  const can = (permission: string) => permissions.has(permission);
  const entries: NavEntry[] = [];

  const add = (entry: NavEntry, allowed: boolean) => {
    if (allowed) entries.push(entry);
  };

  // --- Pilotage ---
  add(
    { href: "/tableau-de-bord", label: "Tableau de bord", icon: "home", section: "Pilotage" },
    can(P.DASHBOARD_OWNER) ||
      can(P.DASHBOARD_DIRECTION) ||
      can(P.DASHBOARD_ACADEMIC) ||
      can(P.DASHBOARD_FINANCE),
  );
  add(
    { href: "/rapports", label: "Rapports et exports", icon: "chart", section: "Pilotage" },
    can(P.REPORT_EXPORT),
  );

  // --- Espaces personnels ---
  add({ href: "/parent", label: "Mes enfants", icon: "users", section: "Mon espace" }, can(P.STUDENT_VIEW_OWN) && can(P.PROOF_SUBMIT));
  add({ href: "/eleve", label: "Mon espace eleve", icon: "book", section: "Mon espace" }, can(P.ASSIGNMENT_SUBMIT));

  // --- Scolarite ---
  add({ href: "/eleves", label: "Eleves", icon: "users", section: "Scolarite" }, can(P.STUDENT_VIEW));
  add({ href: "/classes", label: "Classes", icon: "school", section: "Scolarite" }, can(P.STUDENT_VIEW));
  add({ href: "/personnel", label: "Personnel", icon: "building", section: "Scolarite" }, can(P.STAFF_VIEW));

  // --- Pedagogie ---
  add(
    { href: "/pedagogie/evaluations", label: "Evaluations et notes", icon: "clipboard", section: "Pedagogie" },
    can(P.EVALUATION_VIEW),
  );
  add(
    { href: "/pedagogie/bulletins", label: "Bulletins", icon: "file", section: "Pedagogie" },
    can(P.REPORTCARD_GENERATE) || can(P.GRADE_VIEW_ALL),
  );
  add(
    {
      href: "/pedagogie/devoirs",
      label: "Devoirs",
      icon: "book",
      section: "Pedagogie",
      badge: options.pendingSubmissions,
    },
    can(P.ASSIGNMENT_MANAGE),
  );
  add(
    { href: "/pedagogie/absences", label: "Absences", icon: "calendar", section: "Pedagogie" },
    can(P.ATTENDANCE_VIEW),
  );
  add(
    { href: "/pedagogie/emploi-du-temps", label: "Emploi du temps", icon: "calendar", section: "Pedagogie" },
    can(P.TIMETABLE_VIEW),
  );

  // --- Finances ---
  add({ href: "/finance/frais", label: "Frais scolaires", icon: "wallet", section: "Finances" }, can(P.FEE_VIEW));
  add(
    { href: "/finance/paiements", label: "Encaissements", icon: "receipt", section: "Finances" },
    can(P.PAYMENT_VIEW),
  );
  add(
    {
      href: "/finance/justificatifs",
      label: "Justificatifs",
      icon: "file",
      section: "Finances",
      badge: options.pendingProofs,
    },
    can(P.PROOF_VIEW),
  );
  add(
    { href: "/finance/depenses", label: "Depenses", icon: "truck", section: "Finances" },
    can(P.EXPENSE_VIEW),
  );
  add(
    { href: "/finance/comptabilite", label: "Comptabilite", icon: "chart", section: "Finances" },
    can(P.JOURNAL_VIEW),
  );

  // --- Communication ---
  add(
    { href: "/annonces", label: "Annonces", icon: "bell", section: "Communication" },
    can(P.ANNOUNCEMENT_VIEW),
  );

  // --- Administration ---
  add(
    { href: "/parametres", label: "Parametres", icon: "settings", section: "Administration" },
    can(P.SCHOOL_UPDATE) || can(P.SCHOOL_CONFIGURE_ACADEMIC) || can(P.SCHOOL_CONFIGURE_FINANCE),
  );
  add(
    { href: "/parametres/utilisateurs", label: "Utilisateurs et roles", icon: "shield", section: "Administration" },
    can(P.MEMBERSHIP_MANAGE),
  );
  add(
    { href: "/journal-audit", label: "Journal d'audit", icon: "shield", section: "Administration" },
    can(P.AUDIT_VIEW),
  );
  add(
    { href: "/admin-saas", label: "Administration SaaS", icon: "building", section: "Administration" },
    options.isSuperAdmin,
  );

  return entries;
}
