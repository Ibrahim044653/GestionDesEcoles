import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/permissions";
import { csvResponse } from "@/lib/csv";
import { STUDENT_IMPORT_TEMPLATE } from "@/lib/domain/student-import";

/** Modele CSV d'import d'eleves, avec une ligne d'exemple. */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth?.school) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!auth.permissions.has(PERMISSIONS.STUDENT_IMPORT)) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 403 });
  }

  // BOM en tete : Excel ouvre alors correctement les caracteres accentues.
  return csvResponse(`﻿${STUDENT_IMPORT_TEMPLATE}`, "modele-import-eleves.csv");
}
