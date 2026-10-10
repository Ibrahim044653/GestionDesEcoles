# Installation

## Prerequis

| Element | Version | Remarque |
|---|---|---|
| Node.js | 20 LTS ou superieur | teste sur 24.19 |
| npm | 10 ou superieur | fourni avec Node |
| PostgreSQL | 14 ou superieur | **production uniquement** ; SQLite suffit en developpement |

Aucune dependance native n'est requise : le hachage des mots de passe utilise
`node:crypto`, ce qui evite une chaine de compilation C++.

---

## 1. Installation des dependances

```bash
npm install
```

Si votre npm demande l'approbation des scripts d'installation (npm 11+) :

```bash
npm approve-scripts prisma @prisma/client @prisma/engines
```

Ces scripts telechargent les moteurs Prisma ; sans eux, l'acces a la base
echoue.

## 2. Configuration

```bash
cp .env.example .env
```

Le fichier d'exemple fonctionne tel quel en developpement. En production, au
minimum :

```ini
DATABASE_URL="postgresql://user:motdepasse@serveur:5432/gestion_ecole?schema=public"
SESSION_SECRET="<valeur aleatoire de 32 octets minimum>"
APP_URL="https://ecole.exemple.ci"
NODE_ENV="production"
```

Generer un secret :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> `SESSION_SECRET` sert de « poivre » aux empreintes de jeton de session. Le
> changer **invalide toutes les sessions en cours** : les utilisateurs devront
> se reconnecter. L'application refuse de demarrer en production si ce secret
> est absent, trop court ou laisse a sa valeur d'exemple.

## 3. Base de donnees

### Developpement (SQLite, aucun serveur a installer)

```bash
npm run setup
```

Cette commande genere le client Prisma, cree `prisma/dev.db` et charge les
donnees de demonstration.

### Production (PostgreSQL)

1. Ouvrir `prisma/schema.prisma` et remplacer dans le bloc `datasource db` :

   ```prisma
   provider = "sqlite"      →      provider = "postgresql"
   ```

   Prisma interdit `env()` sur `provider` : ce changement est necessairement
   manuel. Aucun autre fichier n'est a modifier, le schema n'utilisant ni
   `enum` ni `Decimal`.

2. Pointer `DATABASE_URL` sur le serveur PostgreSQL.

3. Appliquer le schema :

   ```bash
   npx prisma migrate dev --name init     # premiere fois, cree la migration
   npx prisma migrate deploy              # ensuite, sur chaque environnement
   ```

> **N'executez pas `npm run db:seed` en production.** Le script refuse de
> s'executer si `NODE_ENV=production` sans `ALLOW_SEED_IN_PRODUCTION=true`.

## 4. Verification au demarrage

Au lancement du serveur, `src/instrumentation.ts` controle la configuration
critique et **arrete le processus avec un message explicite** si elle est
invalide — plutot que de laisser chaque requete renvoyer une 500 opaque :

```
[CONFIGURATION INVALIDE] Le serveur ne peut pas demarrer.
  SESSION_SECRET est absent, trop court (< 32 caracteres) ou laisse a sa valeur d'exemple.
```

Ce controle est volontairement ignore pendant `next build` : la compilation n'a
pas besoin des secrets de production.

## 5. Premier demarrage

```bash
npm run dev          # developpement, http://localhost:3000
```

```bash
npm run build        # production
npm start
```

---

## 6. Premier administrateur en production

Le seed de demonstration ne devant pas etre utilise, creez le premier compte
avec un court script :

```bash
cat > creer-admin.mjs <<'EOF'
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "./src/lib/auth/password.js";

const prisma = new PrismaClient();

const user = await prisma.user.create({
  data: {
    email: "admin@votre-ecole.ci",
    passwordHash: await hashPassword("MotDePasseProvisoire!2026"),
    firstName: "Prenom",
    lastName: "NOM",
    isSuperAdmin: true,
    mustChangePassword: true,
  },
});

console.log("Compte cree :", user.email);
await prisma.$disconnect();
EOF

npx tsx creer-admin.mjs && rm creer-admin.mjs
```

Connectez-vous ensuite avec ce compte : l'application imposera le changement de
mot de passe. Depuis l'espace super-administrateur, creez l'organisation puis
le premier etablissement ; depuis **Parametres → Utilisateurs**, rattachez les
autres comptes.

Les roles et permissions sont crees par le seed. Sur une base vierge sans seed,
chargez-les une fois :

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, describePermission } from './src/lib/permissions';
import { ROLES, ROLE_LABELS, ROLE_RANKS } from './src/lib/constants';
const prisma = new PrismaClient();
await prisma.permission.createMany({ data: ALL_PERMISSIONS.map(code => ({ code, ...describePermission(code) })) });
const perms = await prisma.permission.findMany();
const byCode = new Map(perms.map(p => [p.code, p.id]));
for (const code of Object.values(ROLES)) {
  await prisma.role.create({ data: {
    code, name: ROLE_LABELS[code], rank: ROLE_RANKS[code],
    permissions: { create: (ROLE_PERMISSIONS[code] ?? []).map(c => ({ permissionId: byCode.get(c) })).filter(x => x.permissionId) },
  }});
}
console.log('Roles et permissions installes.');
await prisma.\$disconnect();
"
```

---

## 7. Stockage des fichiers

Les justificatifs, photos et documents sont ecrits **hors de la racine web**,
dans le dossier indique par `STORAGE_LOCAL_PATH` (par defaut `./storage`). Ils
ne sont jamais servis directement : l'acces passe par `/api/files/:id`, qui
verifie la session, l'etablissement et les droits.

En production :

- placez ce dossier sur un volume persistant et sauvegarde ;
- n'exposez jamais `./storage` via le serveur web ;
- ajustez `STORAGE_MAX_UPLOAD_MB` selon vos besoins (8 Mo par defaut).

---

## 8. Verification de l'installation

```bash
npm run typecheck     # aucune erreur attendue
npm test              # 216 tests attendus au vert
```

Puis, dans l'application : connectez-vous, ouvrez le tableau de bord, et
verifiez que les indicateurs refletent vos donnees.

---

## 9. Problemes courants

**`EPERM ... query_engine-windows.dll.node` sous Windows.**
Un serveur de developpement tourne encore et verrouille le moteur Prisma.
Arretez-le avant `npm run build`.

**`Cannot apply unknown utility class` au demarrage.**
Cache de build corrompu. Arretez le serveur, supprimez `.next`, relancez.

**Les pages s'affichent sans mise en forme.**
La feuille de style n'a pas ete generee : meme remede (`.next` supprime,
serveur relance). Verifiez qu'aucun autre processus Node ne tourne.

**`SESSION_SECRET est absent...` au demarrage en production.**
Renseignez un secret d'au moins 32 caracteres, different de la valeur d'exemple.

**Les sessions sont invalidees apres un deploiement.**
`SESSION_SECRET` a change. C'est le comportement attendu : il faut conserver la
meme valeur d'un deploiement a l'autre.
