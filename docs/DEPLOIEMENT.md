# Deploiement

## 1. Passer en PostgreSQL

SQLite convient au developpement et a une petite ecole mono-poste. Au-dela,
PostgreSQL s'impose : ecritures concurrentes, sauvegardes a chaud, replication.

1. Dans `prisma/schema.prisma`, bloc `datasource db` :

   ```prisma
   provider = "postgresql"   // remplace "sqlite"
   ```

   Prisma interdit `env()` sur `provider` : ce changement est manuel. Le schema
   n'utilisant ni `enum` ni `Decimal`, **aucun autre fichier n'est a modifier**.

2. `DATABASE_URL` :

   ```ini
   DATABASE_URL="postgresql://gestion:motdepasse@db.interne:5432/gestion_ecole?schema=public&connection_limit=10"
   ```

3. Migrations :

   ```bash
   npx prisma migrate dev --name init      # une fois, en developpement
   git add prisma/migrations && git commit -m "Migration initiale PostgreSQL"
   npx prisma migrate deploy               # sur chaque environnement
   ```

> Utilisez `migrate deploy` en production, jamais `db push` : seules les
> migrations versionnees sont rejouables et auditables.

---

## 2. Variables d'environnement

Minimum vital :

```ini
NODE_ENV="production"
DATABASE_URL="postgresql://..."
SESSION_SECRET="<32 octets aleatoires minimum>"
APP_URL="https://ecole.exemple.ci"
STORAGE_LOCAL_PATH="/var/lib/gestion-ecole/storage"
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> **Conservez `SESSION_SECRET` d'un deploiement a l'autre.** Il sert de poivre
> aux empreintes de session : le modifier deconnecte tout le monde.

Ne commitez jamais de `.env`. Utilisez le coffre de votre hebergeur.

---

## 3. Construction et execution

```bash
npm ci
npm run build
npx prisma migrate deploy
npm start                 # ecoute sur le port 3000
```

### Service systemd

```ini
# /etc/systemd/system/gestion-ecole.service
[Unit]
Description=Gestion Ecole
After=network.target postgresql.service

[Service]
Type=simple
User=gestion-ecole
WorkingDirectory=/opt/gestion-ecole
EnvironmentFile=/etc/gestion-ecole/env
ExecStart=/usr/bin/node node_modules/.bin/next start
Restart=on-failure
RestartSec=5

# Durcissement
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/gestion-ecole

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now gestion-ecole
sudo systemctl status gestion-ecole
```

---

## 3 bis. Deploiement sur Vercel

Vercel convient a cette application, a deux conditions qui ne sont pas
optionnelles.

**1. Pas de SQLite.** Le systeme de fichiers y est en lecture seule hors
`/tmp`, et `/tmp` ne survit pas d'une invocation a l'autre. Une base SQLite y
serait perdue en permanence. Il faut un PostgreSQL manage (Neon, Supabase,
Railway, RDS…).

**2. Pas de stockage disque.** Pour la meme raison, les fichiers televerses
doivent aller dans un magasin objet. L'application fournit un pilote Vercel
Blob : `STORAGE_DRIVER="blob"`.

### Mise en place

```bash
vercel link --project gestion-des-ecoles

# Base PostgreSQL. L'acceptation des conditions du marketplace se fait dans
# le navigateur, une seule fois, par le proprietaire du compte.
vercel integration add neon --plan free_v3 -m region=fra1 -m auth=false

# Magasin de fichiers. PRIVE : voir la note de securite ci-dessous.
vercel blob create-store gestion-ecoles-fichiers --access private --yes

# Secrets applicatifs
openssl rand -base64 48 | vercel env add SESSION_SECRET production
printf 'blob' | vercel env add STORAGE_DRIVER production

vercel deploy --prod
```

`DATABASE_URL` et `BLOB_READ_WRITE_TOKEN` sont injectes automatiquement par
les deux commandes de provisionnement.

### Le provider Prisma se bascule tout seul

Prisma interdit `env()` sur `provider` : la valeur doit etre litterale. Le
schema reste donc **un seul fichier** (source de verite unique, pas de copie a
maintenir en parallele) et c'est le build qui choisit :

```json
"vercel-build": "node scripts/use-datasource.mjs postgresql && prisma generate && next build"
```

**Le build ne touche PAS au schema**, et c'est deliberé. Enchainer un
`prisma db push --accept-data-loss` a chaque mise en production reviendrait a
autoriser toute evolution de schema a supprimer une colonne de donnees reelles
pendant un deploiement de routine, sans que personne ne l'ait decide. La
creation et l'evolution du schema sont des gestes separes et volontaires :

```bash
# Premiere mise en place, ou apres une evolution du modele
node scripts/use-datasource.mjs postgresql
npx prisma db push          # ou `prisma migrate deploy` avec des migrations
node scripts/use-datasource.mjs sqlite
```

En local, le schema reste en `sqlite` : la suite de tests cree une base
jetable et n'a besoin d'aucun serveur.

### Amorcer la base de demonstration

```bash
vercel env pull .env.production.local --environment production
DATABASE_URL="<url_neon>" npm run db:seed:prod
```

> Le seed refuse de s'executer si `NODE_ENV=production` sans
> `ALLOW_SEED_IN_PRODUCTION="true"`. C'est deliberé : on ne remplit pas une
> base reelle de donnees fictives par accident.

### Securite du magasin de fichiers

Le magasin est cree en `--access private`. C'est important : en magasin
public, chaque justificatif de paiement et chaque photo d'eleve serait lisible
par quiconque obtiendrait l'URL, ce qui contredirait la regle centrale de
l'application — un fichier n'est servi que par `/api/files/[id]`, apres
verification du tenant et des permissions. En prive, l'URL ne suffit pas : il
faut le jeton du magasin, qui ne quitte jamais le serveur.

### Ce que Vercel ne resout pas

- **Accents dans la recherche.** La casse est geree
  (`src/lib/search.ts` ajoute `mode: "insensitive"` quand le moteur est
  PostgreSQL), mais pas les accents : « Kouame » ne trouve pas « Kouame »
  ecrit avec un accent aigu. Y remedier demanderait l'extension `unaccent`
  de PostgreSQL et du SQL brut, que les filtres Prisma n'expriment pas.
- **Taches planifiees.** Purge des sessions et sauvegardes restent a mettre en
  place (voir sections 6 et 7) ; `vercel crons` peut servir de declencheur.
- **Demarrage a froid.** Premiere requete apres inactivite plus lente, le
  temps que la connexion a la base s'etablisse.

---

## 4. Proxy inverse et HTTPS

L'application **ne gere pas TLS**. Placez-la derriere un proxy.

```nginx
server {
    listen 443 ssl http2;
    server_name ecole.exemple.ci;

    ssl_certificate     /etc/letsencrypt/live/ecole.exemple.ci/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ecole.exemple.ci/privkey.pem;

    # En-tetes de securite : non fournis par l'application.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Televersement des justificatifs (aligner sur STORAGE_MAX_UPLOAD_MB).
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        # Indispensable : alimente la limitation par IP et le journal d'audit.
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name ecole.exemple.ci;
    return 301 https://$host$request_uri;
}
```

> Sans `X-Forwarded-For`, toutes les requetes semblent venir du proxy : la
> limitation par IP devient inoperante et le journal d'audit perd sa valeur.

---

## 5. Stockage des fichiers

```bash
sudo mkdir -p /var/lib/gestion-ecole/storage
sudo chown gestion-ecole:gestion-ecole /var/lib/gestion-ecole/storage
sudo chmod 750 /var/lib/gestion-ecole/storage
```

- Volume **persistant** et **sauvegarde** : il contient les justificatifs.
- Ne l'exposez jamais via le serveur web.
- Sur plusieurs instances, utilisez un volume partage ou un stockage objet
  (necessite d'implementer un driver dans `src/lib/storage.ts`).

---

## 6. Sauvegardes

Trois elements a sauvegarder **ensemble** : la base, le dossier de stockage, et
la configuration.

```bash
#!/usr/bin/env bash
# /usr/local/bin/sauvegarde-gestion-ecole
set -euo pipefail

DEST="/var/backups/gestion-ecole"
HORODATAGE="$(date +%F-%H%M)"
mkdir -p "$DEST"

pg_dump --format=custom --file="$DEST/base-$HORODATAGE.dump" gestion_ecole
tar -czf "$DEST/fichiers-$HORODATAGE.tar.gz" -C /var/lib/gestion-ecole storage
cp /etc/gestion-ecole/env "$DEST/env-$HORODATAGE"
chmod 600 "$DEST/env-$HORODATAGE"

find "$DEST" -type f -mtime +30 -delete
```

```cron
30 2 * * * /usr/local/bin/sauvegarde-gestion-ecole >> /var/log/gestion-ecole-backup.log 2>&1
```

> **Une sauvegarde non testee n'existe pas.** Restaurez-la sur un environnement
> de recette au moins une fois par trimestre :
>
> ```bash
> createdb gestion_ecole_test
> pg_restore --dbname=gestion_ecole_test base-2026-03-01-0230.dump
> ```

---

## 7. Taches planifiees

Aucune n'est fournie. A mettre en place selon vos besoins :

| Tache | Fonction | Frequence suggeree |
|---|---|---|
| Purge des sessions expirees | `purgeExpiredSessions()` (`src/lib/auth/session.ts`) | quotidienne |
| Rappels d'echeance | `sendDueDateReminders(schoolId)` (`src/lib/domain/notifications.ts`) | hebdomadaire |

Exemple :

```bash
npx tsx -e "
import { purgeExpiredSessions } from './src/lib/auth/session';
console.log('Sessions purgees :', await purgeExpiredSessions());
"
```

---

## 8. Mise a jour

```bash
sudo systemctl stop gestion-ecole
cd /opt/gestion-ecole
git pull
npm ci
npx prisma migrate deploy      # apres sauvegarde de la base
npm run build
sudo systemctl start gestion-ecole
```

Verifiez ensuite : page de connexion, tableau de bord, et generation d'un recu.

---

## 9. Dimensionnement indicatif

| Etablissement | Base | Ressources |
|---|---|---|
| < 300 eleves | SQLite ou PostgreSQL | 1 vCPU, 1 Go RAM |
| 300 – 2 000 eleves | PostgreSQL | 2 vCPU, 2 Go RAM |
| > 2 000 eleves / multi-ecoles | PostgreSQL dedie | 4 vCPU, 4 Go RAM, stockage objet |

Les montants, notes et agregats sont calcules en entiers : la charge vient
surtout des lectures de tableaux de bord. Les index necessaires sont declares
dans le schema.

---

## 10. Supervision

A surveiller en priorite :

- **Disponibilite** : `GET /connexion` doit repondre 200.
- **Journal d'audit** : pic de `auth.login.failed` ou de
  `security.cross_tenant_attempt` → tentative d'intrusion probable.
- **Equilibre du bilan** : `computeBalanceSheet().isBalanced` doit rester vrai.
- **Espace disque** du dossier de stockage.
- **Sauvegardes** : verifier que le fichier du jour existe et n'est pas vide.
