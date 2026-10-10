// Outil de test local : capture d'ecran d'une page authentifiee.
// Pilote Chrome via le protocole DevTools (WebSocket natif de Node, aucune
// dependance). Ne fait PAS partie de l'application.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [chromePath, token, url, outFile, fullPageRaw] = process.argv.slice(2);
const fullPage = fullPageRaw === "full";
const profile = mkdtempSync(path.join(tmpdir(), "ge-shot-"));
const port = 9222 + Math.floor(Math.random() * 500);

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function devtoolsUrl() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = await response.json();
      return info.webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome n'a pas expose son port de debogage.");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const handler = pending.get(message.id);
      if (handler) {
        pending.delete(message.id);
        message.error ? handler.reject(new Error(message.error.message)) : handler.resolve(message.result);
      }
    });
    socket.addEventListener("error", reject);
    socket.addEventListener("open", () =>
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            socket.send(JSON.stringify({ id, method, params, sessionId }));
          });
        },
        close: () => socket.close(),
      }),
    );
  });
}

try {
  const browser = await connect(await devtoolsUrl());
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });

  const page = {
    send: (method, params = {}) => browser.send(method, params, sessionId),
  };

  await page.send("Page.enable");
  await page.send("Network.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const target = new URL(url);
  await page.send("Network.setCookie", {
    name: "ge_session",
    value: token,
    domain: target.hostname,
    path: "/",
  });

  await page.send("Page.navigate", { url });
  // Laisse le temps au rendu serveur et a l'hydratation.
  await sleep(5000);

  const { data } = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: fullPage,
  });

  writeFileSync(outFile, Buffer.from(data, "base64"));
  console.log(`capture: ${outFile}`);

  browser.close();
} finally {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Profil temporaire parfois verrouille sous Windows : sans consequence.
  }
}
