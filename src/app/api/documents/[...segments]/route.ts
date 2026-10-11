import { NextResponse } from "next/server";
import { GET as recu } from "@/lib/api/documents/recu";
import { GET as bulletin } from "@/lib/api/documents/bulletin";
import { GET as carteScolaire } from "@/lib/api/documents/carte-scolaire";
import { GET as certificatScolarite } from "@/lib/api/documents/certificat-scolarite";
import { GET as listeClasse } from "@/lib/api/documents/liste-classe";
import { GET as procesVerbal } from "@/lib/api/documents/proces-verbal";
import { GET as releveCompte } from "@/lib/api/documents/releve-compte";

/**
 * Point d'entree unique des documents PDF.
 *
 * POURQUOI UNE ROUTE UNIQUE : chaque `route.ts` devient une fonction
 * serverless distincte chez Vercel, et le plan Hobby en autorise douze. Les
 * sept documents et les huit exports en consommaient seize a eux seuls.
 *
 * Le regroupement ne change AUCUNE URL : les chemins historiques
 * (/api/documents/recu/<id>, /api/documents/bulletin/<eleve>/<periode>...)
 * sont reconstitues ici a partir des segments. Les liens deja distribues,
 * ceux des bulletins remis aux familles compris, continuent de fonctionner.
 *
 * La logique metier et les controles d'acces n'ont pas bouge : ils vivent
 * dans src/lib/api/documents/, inchanges.
 */

/** Nombre de segments attendus APRES le type de document. */
const ROUTES: Record<
  string,
  {
    arity: number;
    params: (segments: string[]) => Record<string, string>;
    handler: (request: Request, context: { params: Promise<never> }) => Promise<Response>;
  }
> = {
  recu: {
    arity: 1,
    params: ([paymentId]) => ({ paymentId }),
    handler: recu as never,
  },
  bulletin: {
    arity: 2,
    params: ([studentId, periodId]) => ({ studentId, periodId }),
    handler: bulletin as never,
  },
  "carte-scolaire": {
    arity: 1,
    params: ([studentId]) => ({ studentId }),
    handler: carteScolaire as never,
  },
  "certificat-scolarite": {
    arity: 1,
    params: ([studentId]) => ({ studentId }),
    handler: certificatScolarite as never,
  },
  "liste-classe": {
    arity: 1,
    params: ([classRoomId]) => ({ classRoomId }),
    handler: listeClasse as never,
  },
  "proces-verbal": {
    arity: 2,
    params: ([classRoomId, periodId]) => ({ classRoomId, periodId }),
    handler: procesVerbal as never,
  },
  "releve-compte": {
    arity: 1,
    params: ([studentId]) => ({ studentId }),
    handler: releveCompte as never,
  },
};

export async function GET(
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await context.params;
  const [type, ...rest] = segments ?? [];

  const route = ROUTES[type ?? ""];

  // Type inconnu ou nombre de segments incorrect : 404, comme l'aurait fait
  // le routeur avant le regroupement. On ne renvoie pas 400 : cela
  // revelerait quels types de documents existent.
  if (!route || rest.length !== route.arity || rest.some((s) => !s)) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  return route.handler(request, {
    params: Promise.resolve(route.params(rest)) as Promise<never>,
  });
}
