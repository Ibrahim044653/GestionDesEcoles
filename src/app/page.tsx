import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/guard";
import { ROLES } from "@/lib/constants";

/** Racine : oriente chaque utilisateur vers son espace. */
export default async function RootPage() {
  const context = await getAuthContext();
  if (!context) redirect("/connexion");

  const roleCode = context.membership?.roleCode;
  if (roleCode === ROLES.GUARDIAN) redirect("/parent");
  if (roleCode === ROLES.STUDENT) redirect("/eleve");
  if (!roleCode && context.user.isSuperAdmin) redirect("/admin-saas");

  redirect("/tableau-de-bord");
}
