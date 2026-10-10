# Outils de developpement

Scripts de verification locale. Ils ne font **pas** partie de l'application et
ne sont jamais charges par celle-ci.

| Script | Role |
|---|---|
| `mint-session.mjs` | Cree une session valide en base et imprime le cookie correspondant |
| `smoke.mjs` | Appelle une liste de pages avec ce cookie et signale les erreurs serveur |
| `shot.mjs` | Capture d'ecran d'une page authentifiee via le protocole DevTools de Chrome |

## Parcours de fumee

```bash
npm run dev            # dans un autre terminal

COOKIE=$(node scripts/mint-session.mjs proprietaire@exemple.test)
node scripts/smoke.mjs "$COOKIE" /tableau-de-bord /eleves /finance/paiements
```

Lecture des resultats :

- `ok` — page rendue normalement
- `refus` — acces refuse (3xx/4xx). **Comportement attendu** lorsque le role
  n'a pas le droit d'ouvrir la page
- `ECHEC` — erreur serveur (5xx) ou page d'erreur : a corriger

## Capture d'ecran

```bash
TOKEN=$(node scripts/mint-session.mjs proprietaire@exemple.test | sed 's/ge_session=//')
node scripts/shot.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe" \
  "$TOKEN" "http://localhost:3000/tableau-de-bord" dashboard.png
```

> `mint-session.mjs` lit `SESSION_SECRET` dans `.env` : les empreintes de jeton
> sont poivrees avec ce secret (voir `src/lib/auth/password.ts`).
