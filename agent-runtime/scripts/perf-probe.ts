// Diagnóstico real de performance do ProspectorSiteAgent (sem browser).
// Uso (na pasta agent-runtime): npx tsx scripts/perf-probe.ts edit|generate
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch { /* sem .env */ }
}

const SITE = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doce Lua Confeitaria</title><link rel="stylesheet" href="src/site.css"></head>
<body>
  <nav><a href="#inicio">Inicio</a><a href="#bolos">Bolos</a><a href="#contato">Contato</a></nav>
  <header class="hero" id="inicio"><h1>Doce Lua Confeitaria</h1><p>Bolos artesanais em Sao Paulo.</p><a class="btn-primary" href="https://wa.me/5511999999999">Pedir pelo WhatsApp</a></header>
  <section id="bolos"><h2>Nossos bolos</h2><div class="card"><h3>Bolo de chocolate</h3></div></section>
  <section id="contato"><h2>Contato</h2><p>Atendemos toda a zona sul.</p></section>
  <footer>© 2026 Doce Lua Confeitaria</footer>
  <script src="src/main.js"></script>
</body></html>`,
  "src/site.css": `.hero{background:#f7e7d4;padding:80px 20px;text-align:center}
.btn-primary{background:#d94f2b;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;display:inline-block}
@media(max-width:900px){.hero{padding:40px 16px}}`,
  "src/main.js": `document.addEventListener('click', function () {});`,
};

async function main() {
  const rawMode = process.argv[2] ?? "edit";
  const mode = rawMode === "generate" || rawMode === "full" ? "generate" : "edit";
  const followUpEdit = rawMode === "full";
  loadEnv();
  if (!process.env.DEEPSEEK_API_KEY) { console.error("sem DEEPSEEK_API_KEY"); process.exit(1); }
  const { ProspectorSiteAgent } = await import("../src/prospector-site-agent.ts");

  const root = mkdtempSync(join(tmpdir(), "perf-probe-"));
  const seeds = mode === "generate" ? {} : SITE;
  if (mode !== "generate") {
    for (const [p, c] of Object.entries(SITE)) {
      const full = join(root, p);
      mkdirSync(join(root, p.split(/[\\/]/).slice(0, -1).join("/")), { recursive: true });
      writeFileSync(full, c, "utf8");
    }
  }

  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Doce Lua Confeitaria", segment: "confeitaria", city: "Sao Paulo", state: "SP" },
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.PROSPECTOR_BASE_URL,
    modelId: process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
    providerId: (process.env.PROSPECTOR_PROVIDER || "deepseek") as "deepseek",
    maxIterations: mode === "generate" ? 48 : 20,
    initialFiles: seeds,
    mode,
    enableBrowser: false,
  });

  const results: unknown[] = [];
  if (mode === "edit") {
    results.push(await runProbe(agent, "edit",
      "Troque a cor do botao principal (.btn-primary) para azul (#2563eb). Faca apenas essa alteracao."));
  } else {
    results.push(await runProbe(agent, "generate",
      "Crie do zero o site desta confeitaria (empresa: Doce Lua Confeitaria, segmento: confeitaria, cidade: Sao Paulo/SP)."));
    if (followUpEdit) {
      results.push(await runProbe(agent, "edit-followup",
        "Troque a cor do botao principal para verde (#16a34a). Faca apenas essa alteracao.", true));
    }
  }
  console.log(JSON.stringify(results, null, 2));
  rmSync(root, { recursive: true, force: true });
}

async function runProbe(agent: { runTask(i: string, o?: { continueSession?: boolean }): Promise<{ events: unknown[]; reply?: string; touched?: string[]; timing?: unknown; finishSkips?: unknown; ok?: boolean; error?: unknown }> }, label: string, task: string, cont = false) {
  const t0 = Date.now();
  const live: Record<string, number> = {};
  const sub = (agent as unknown as { subscribe(fn: (e: { type?: string }) => void): () => void }).subscribe((e) => {
    live[e.type ?? ""] = (live[e.type ?? ""] ?? 0) + 1;
  });
  const timer = setInterval(() => {
    const total = Object.values(live).reduce((a, b) => a + b, 0);
    console.error(`[${label}] ${Math.round((Date.now() - t0) / 1000)}s · eventos=${total} · turnos=${live["turn-finished"] ?? 0}`);
  }, 15000);
  const outcome = await agent.runTask(task, { continueSession: cont });
  clearInterval(timer);
  sub();
  const wall = Date.now() - t0;
  const counts: Record<string, number> = {};
  for (const e of outcome.events ?? []) {
    const t = (e as { type?: string }).type ?? "";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return {
    label,
    wallMs: wall,
    ok: outcome.ok,
    touched: outcome.touched,
    finishSkips: outcome.finishSkips,
    timing: outcome.timing,
    eventCounts: counts,
    replyTail: (outcome.reply ?? "").slice(-220),
    error: outcome.error ?? null,
  };
}

main().catch((e) => { console.error("ERRO", e); process.exit(1); });
