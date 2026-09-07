// Reprodução local: gera um site real e roda a auditoria de interação (tela
// preta ao clicar). Uso: npx tsx scripts/repro-black.ts
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
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

async function main() {
  loadEnv();
  const { ProspectorSiteAgent } = await import("../src/prospector-site-agent.ts");
  const { BrowserSession } = await import("../src/browser-session.ts");
  const { auditSiteInteractions } = await import("../src/interaction-audit.ts");

  const root = mkdtempSync(join(tmpdir(), "repro-black-"));
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Fogão de Barro Restaurante", segment: "restaurante", city: "Campinas", state: "SP" },
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.PROSPECTOR_BASE_URL,
    modelId: process.env.PROSPECTOR_MODEL ?? "deepseek-chat",
    providerId: (process.env.PROSPECTOR_PROVIDER || "deepseek") as "deepseek",
    maxIterations: 40,
    initialFiles: {},
    mode: "generate",
    enableBrowser: false,
  });
  const t0 = Date.now();
  const outcome = await agent.runTask(
    "Crie do zero o site deste restaurante (empresa: Fogão de Barro Restaurante, segmento: restaurante, cidade: Campinas/SP).",
    { continueSession: false },
  );
  console.error(`geracao: ${Math.round((Date.now() - t0) / 1000)}s ok=${outcome.ok} touched=${(outcome.touched ?? []).length}`);
  console.log(JSON.stringify({ generation: { ok: outcome.ok, touched: outcome.touched, timing: outcome.timing } }));

  const session = new BrowserSession(root);
  try {
    const audit = await auditSiteInteractions(session);
    console.log(JSON.stringify({ audit }, null, 2));
  } finally {
    await session.close().catch(() => {});
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error("ERRO", e); process.exit(1); });
