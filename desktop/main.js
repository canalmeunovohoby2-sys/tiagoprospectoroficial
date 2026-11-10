// TiagoProspector Desktop — wrapper Electron MÍNIMO.
// Fluxo: Electron inicia → spawn do Agent Runtime local (dist/server.js empacotado,
// PORT=8787) → aguarda GET /health → libera a interface atual (build Vite).
// Ao fechar, encerra SOMENTE o runtime que este aplicativo iniciou.
const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");

// Log de diagnóstico do desktop (prova de carregamento do renderer).
const LOG = path.join(os.tmpdir(), "tiagoprospector-desktop.log");
function dlog(msg) {
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch { /* noop */ }
}

const PORT = 8787;
const HOST = "127.0.0.1";
const DEV_URL = process.env.TIAGOPROSPECTOR_DEV_URL || ""; // ex.: http://localhost:8080

let win = null;
let runtime = null;

function resourcesRoot() {
  // Em pacote: resources/ ; em dev: pasta do projeto desktop/.
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
}

function runtimeEntry() {
  const root = path.join(resourcesRoot(), "agent-runtime");
  const dist = path.join(root, "dist", "server.js");
  return { cwd: root, entry: dist };
}

/** Carrega o .env.local do runtime empacotado (o dist/server.js NÃO lê dotenv sozinho). */
function runtimeEnvFile(cwd) {
  const out = {};
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = fs.readFileSync(path.join(cwd, name), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!m || line.trim().startsWith("#")) continue;
        out[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* arquivo ausente: segue */ }
  }
  return out;
}

function startRuntime() {
  const { cwd, entry } = runtimeEntry();
  dlog(`SPAWN ${entry} (cwd=${cwd})`);
  const out = fs.openSync(path.join(os.tmpdir(), "tiagoprospector-runtime.log"), "a");
  runtime = spawn(process.execPath, [entry], {
    cwd,
    env: { ...process.env, ...runtimeEnvFile(cwd), PORT: String(PORT), HOST, AGENT_RUNTIME_LOCAL: "1", ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  dlog(`SPAWN pid=${runtime.pid}`);
  runtime.on("error", (e) => dlog(`SPAWN-ERROR ${e && e.message}`));
  runtime.on("exit", (code) => {
    runtime = null;
    dlog(`RUNTIME-EXIT code=${code}`);
  });
}

function healthOnce() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: "/health", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve(res.statusCode === 200 && JSON.parse(body).ok === true); } catch { resolve(false); }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/** Polling LIMITADO (sem loop infinito): ~60 tentativas de 500ms (30s). */
async function waitForHealth(tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await healthOnce()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function splash(step) {
  if (!win || win.isDestroyed()) return;
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b0f;color:#f5f5f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="text-align:center"><h2 style="font-weight:600;letter-spacing:-.02em">TiagoProspector</h2><p style="opacity:.8">${step}</p></div></body></html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function boot() {
  win = new BrowserWindow({ width: 1280, height: 840, backgroundColor: "#0b0b0f", show: true });
  // Diagnóstico do renderer (prova de montagem do React + falhas de asset).
  win.webContents.on("did-fail-load", (_e, code, desc, url) => dlog(`DID-FAIL-LOAD ${code} ${desc} ${url}`));
  win.webContents.on("console-message", (_e, level, message) => dlog(`CONSOLE[${level}] ${String(message).slice(0, 300)}`));
  win.webContents.on("did-finish-load", async () => {
    try {
      const probe = await win.webContents.executeJavaScript("(() => ({ root: (document.querySelector('#root')?.childElementCount ?? -1), scripts: document.querySelectorAll('script[src]').length, title: document.title }))()");
      dlog(`LOADED ${JSON.stringify(probe)}`);
    } catch (e) { dlog(`PROBE-ERR ${e && e.message}`); }
  });
  splash("Iniciando o TiagoProspector…");

  // Se JÁ houver um runtime respondendo em 8787, reutiliza (evita processo duplicado
  // após um encerramento abrupto) em vez de subir um segundo.
  const already = await healthOnce();
  dlog(`HEALTH-INICIAL ${already}`);
  if (!already) startRuntime();
  splash("Preparando o agente…");
  const ok = already || (await waitForHealth());

  if (!ok) {
    splash("Não foi possível iniciar o Agent Runtime local (porta 8787). Feche e abra novamente.");
    return;
  }
  splash("Tudo pronto.");

  if (DEV_URL) await win.loadURL(DEV_URL);
  else await win.loadFile(path.join(resourcesRoot(), "frontend", "index.html"));
}

app.whenReady().then(boot);

// Encerramento LIMPO: só o runtime iniciado por nós (nunca processos externos).
function stopRuntime() {
  if (runtime && !runtime.killed) {
    try { runtime.kill(); } catch { /* noop */ }
    runtime = null;
  }
}
app.on("before-quit", stopRuntime);
app.on("will-quit", stopRuntime);
process.on("SIGINT", () => { stopRuntime(); app.quit(); });
process.on("SIGTERM", () => { stopRuntime(); app.quit(); });
app.on("window-all-closed", () => app.quit());
