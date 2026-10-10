// Parcours de fumee : appelle les pages principales avec une session valide.
const BASE = "http://localhost:3000";
const cookie = process.argv[2];
const pages = process.argv.slice(3);

async function check(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const body = res.headers.get("content-type")?.includes("pdf") ? "" : await res.text();
  // Marqueurs d'erreur REELLE. On evite "__next_error__", present dans la
  // surcouche de developpement de Next meme sur une reponse saine.
  const hasError =
    res.status >= 500 ||
    /Application error: a server-side exception|Unhandled Runtime Error/i.test(body);
  const size = Number(res.headers.get("content-length") ?? body.length);
  return { path, status: res.status, bytes: size, hasError };
}

let failures = 0;
for (const path of pages) {
  try {
    const r = await check(path);
    // Une redirection 3xx vers /acces-refuse est le comportement ATTENDU
    // lorsqu'un role n'a pas le droit d'ouvrir la page : ce n'est pas un echec.
    const bad = r.status >= 500 || r.hasError;
    if (bad) failures += 1;
    const flag = bad ? "ECHEC" : r.status >= 400 ? "refus" : r.status >= 300 ? "refus" : "ok   ";
    console.log(`${flag} ${String(r.status).padEnd(3)} ${String(r.bytes).padStart(7)}o  ${r.path}`);
  } catch (error) {
    failures += 1;
    console.log(`ECHEC  ---          ${path}  (${error.message})`);
  }
}
console.log(failures === 0 ? "\nOK : aucune erreur serveur." : `\n${failures} page(s) en erreur.`);
process.exit(failures > 0 ? 1 : 0);
