import { NextResponse } from "next/server";
import { GET as balance } from "@/lib/api/export/balance";
import { GET as depenses } from "@/lib/api/export/depenses";
import { GET as eleves } from "@/lib/api/export/eleves";
import { GET as etablissement } from "@/lib/api/export/etablissement";
import { GET as impayes } from "@/lib/api/export/impayes";
import { GET as modeleImportEleves } from "@/lib/api/export/modele-import-eleves";
import { GET as paiements } from "@/lib/api/export/paiements";
import { GET as personnel } from "@/lib/api/export/personnel";

/**
 * Point d'entree unique des exports.
 *
 * Meme raison que pour les documents : chaque `route.ts` devient une fonction
 * serverless chez Vercel, et le plan Hobby en autorise douze. Les URL
 * historiques (/api/export/eleves, /api/export/balance...) sont conservees
 * telles quelles.
 *
 * Les controles de permission restent dans chaque module d'export : ce
 * fichier ne fait qu'aiguiller, il n'autorise rien.
 */
const EXPORTS: Record<string, (request: Request) => Promise<Response>> = {
  balance,
  depenses,
  eleves,
  etablissement,
  impayes,
  "modele-import-eleves": modeleImportEleves,
  paiements,
  personnel,
};

export async function GET(request: Request, context: { params: Promise<{ type: string }> }) {
  const { type } = await context.params;
  const handler = EXPORTS[type];

  // Type inconnu : 404, comme l'aurait fait le routeur avant le regroupement.
  if (!handler) {
    return NextResponse.json({ error: "Export introuvable." }, { status: 404 });
  }

  return handler(request);
}
