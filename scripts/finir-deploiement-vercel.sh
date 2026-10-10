#!/usr/bin/env bash
#
# Termine le deploiement Vercel une fois les conditions Neon acceptees.
#
# PREALABLE (une seule fois, dans un navigateur, par le proprietaire du compte) :
#   https://vercel.com/test11-98c8/~/integrations/accept-terms/neon?source=cli
#
# Vercel exige cette acceptation pour tout service du marketplace. Elle engage
# juridiquement le titulaire du compte : elle ne peut pas etre donnee a sa place.
#
# Usage : bash scripts/finir-deploiement-vercel.sh

set -euo pipefail

echo "==> 1/5  Provisionnement de la base PostgreSQL (Neon, plan gratuit)"
vercel integration add neon \
  --plan free_v3 \
  -m region=fra1 \
  -m auth=false \
  --name gestion-ecoles-db \
  --no-claim

echo
echo "==> 2/5  Recuperation des variables d'environnement de production"
vercel env pull .env.production.local --environment production --yes

# DATABASE_URL est injectee par le provisionnement Neon. Si elle manque, la
# suite echouerait de facon confuse : mieux vaut s'arreter ici, clairement.
if ! grep -q '^DATABASE_URL=' .env.production.local; then
  echo "ERREUR : DATABASE_URL absente. Le provisionnement Neon n'a pas abouti." >&2
  echo "Verifiez avec : vercel integration list --all" >&2
  exit 1
fi

echo
echo "==> 3/5  Creation du schema et amorcage des donnees de demonstration"
# Le seed refuse de s'executer en production sans autorisation explicite :
# c'est un garde-fou contre le remplissage accidentel d'une base reelle.
set -a
# shellcheck disable=SC1091
source .env.production.local
set +a
export ALLOW_SEED_IN_PRODUCTION="true"

node scripts/use-datasource.mjs postgresql
npx prisma generate
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts

# On remet le schema en sqlite : c'est l'etat attendu en local, ou la suite de
# tests cree sa propre base jetable.
node scripts/use-datasource.mjs sqlite
npx prisma generate

echo
echo "==> 4/5  Deploiement en production"
vercel deploy --prod --yes

echo
echo "==> 5/5  Termine."
echo "Recuperez l'URL avec :  vercel ls gestion-des-ecoles"
echo "Mot de passe des comptes de demonstration : variable SEED_DEMO_PASSWORD"
echo "  vercel env pull .env.production.local --environment production --yes"
