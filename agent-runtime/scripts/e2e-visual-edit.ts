// E2E REAL (modelo + Chromium) do ciclo fechado de edição visual:
//   PEDIDO → EDITAR → RENDERIZAR → VERIFICAR → RELATAR
// Prova: (1) o site REAL mudou de verdade (cor do botão no DOM/computed style);
//        (2) a resposta final do chat traz o RELATÓRIO (arquivos + verificação);
//        (3) o isolamento por projectId (só o workspace daquele projeto mudou).
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { BrowserSession } from "../src/browser-session";
import { readWorkspace, ensureWorkspaceDir } from "../src/workspace";

function loadEnv(): void {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sem .env */ }
}

const SITE: Record<string, string> = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pata Amiga</title>
<link rel="stylesheet" href="./src/site.css"></head><body>
<header class="top"><strong>Pata Amiga</strong><nav><a href="#serv">Serviços</a><a href="#wa">WhatsApp</a></nav></header>
<main>
<section class="hero"><h1>Banho e tosa com cuidado</h1><p>Seu pet bem cuidado.</p><a class="cta" href="#wa">Falar no WhatsApp</a></section>
<section id="serv"><h2>Serviços</h2><div class="cards"><article class="card">Banho</article><article class="card">Tosa</article></div></section>
<section id="wa"><h2>Fale no WhatsApp</h2><a class="cta" href="https://wa.me/5511">Chamar no WhatsApp</a></section>
</main><footer>© Pata Amiga</footer></body></html>`,
  "src/site.css": `*{box-sizing:border-box}body{margin:0;font-family:system-ui;color:#0f172a}
header{display:flex;gap:20px;padding:16px 24px;border-bottom:1px solid #e2e8f0}
section{padding:80px 24px}.hero{background:#f1f5f9}h1{font-size:46px;margin:0 0 10px}
.cards{display:flex;gap:16px;flex-wrap:wrap}.card{flex:1;min-width:200px;padding:22px;border:1px solid #e2e8f0;border-radius:12px}
.cta{display:inline-block;background:#0f766e;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none}
footer{padding:22px;background:#0f172a;color:#cbd5e1}`,
  "src/site.json": JSON.stringify({ business: { name: "Pata Amiga", segment: "Pet shop" } }),
};

const INSTRUCTION = "Troque o botão principal (CTA) para azul.";

async function main() {
  loadEnv();
  if (!process.env.DEEPSEEK_API_KEY && !process.env.PROSPECTOR_API_KEY) { console.error("sem API key"); process.exit(1); }
  const base = mkdtempSync(join(tmpdir(), "visual-edit-"));
  const rootA = ensureWorkspaceDir("proj-visual-A", SITE);
  const rootB = ensureWorkspaceDir("proj-visual-B", SITE); // projeto isolado (não deve mudar)
  void base;
  try {
    const agent = new ProspectorSiteAgent({
      workspaceRoot: rootA,
      business: { name: "Pata Amiga", segment: "Pet shop", city: "SP", state: "SP" },
      maxIterations: 40,
      initialFiles: SITE,
      enableBrowser: true,
      mode: "edit",
    });
    const tools: string[] = [];
    agent.subscribe((e) => {
      const ev = e as { type: string; toolCall?: { toolName?: string } };
      if (ev.type === "tool-started" && ev.toolCall?.toolName) tools.push(ev.toolCall.toolName);
    });

    console.log("=== INSTRUÇÃO:", INSTRUCTION);
    const out = await agent.runTask(INSTRUCTION);
    console.log("ok:", out.ok, "| unverified:", out.unverified, "| touched:", JSON.stringify(out.touched));
    console.log("tools:", JSON.stringify([...new Set(tools)]));
    console.log("--- REPLY (relatório ao usuário) ---\n" + out.reply);

    // Projeto B NÃO pode ter sido alterado (isolamento).
    const bFiles = readWorkspace(rootB);
    const bCss = bFiles["src/site.css"] ?? "";
    const isolationOk = bCss.includes("#0f766e");

    // Verificação REAL no Chromium: a cor computada do botão mudou de fato?
    const session = new BrowserSession(rootA);
    let color = "";
    let consoleErrors = 0;
    let overflow = false;
    try {
      const insp = await session.open("/?t=" + Date.now(), { width: 1280, height: 720 });
      consoleErrors = insp.consoleErrors.length;
      overflow = insp.horizontalOverflow;
      const r = await session.evaluate(`(() => { const el = document.querySelector('.cta'); return el ? getComputedStyle(el).backgroundColor : null; })()`);
      color = (r.value as string | null) ?? "";
    } finally {
      await session.close().catch(() => undefined);
    }
    const rgb = (color.match(/[0-9]+/g) ?? []).map(Number);
    const isBlue = rgb.length >= 3 && rgb[2] >= rgb[0] && rgb[2] >= rgb[1] && rgb[2] > 120;
    const changedFromTeal = color !== "rgb(15, 118, 110)";

    const fail: string[] = [];
    if (!out.ok) fail.push(`run não ok: ${out.error ?? out.reply}`);
    if (!out.touched.some((p) => /site\.css|index\.html/i.test(p))) fail.push("nenhum arquivo do site alterado");
    if (!/Fiz a alteração no projeto/i.test(out.reply)) fail.push("resposta sem relatório (Fiz a alteração...)");
    if (!/Arquivos alterados/i.test(out.reply)) fail.push("relatório sem lista de arquivos");
    if (!/Verificação:/i.test(out.reply)) fail.push("relatório sem verificação");
    if (!changedFromTeal || !isBlue) fail.push(`botão NÃO ficou azul no navegador (computed: ${color})`);
    if (consoleErrors > 0) fail.push(`console com ${consoleErrors} erro(s)`);
    if (overflow) fail.push("overflow horizontal");
    if (!isolationOk) fail.push("isolamento violado: projeto B foi alterado");

    console.log("\n=== VERIFICAÇÃO CHROMIUM ===");
    console.log(JSON.stringify({ backgroundColor: color, isBlue, changedFromTeal, consoleErrors, overflow, isolationOk }));
    if (fail.length) { console.error("\nFALHAS:\n- " + fail.join("\n- ")); process.exit(1); }
    console.log("\nOK: ciclo fechado comprovado — pedido → edição real → verificação no navegador → relatório.");
  } finally {
    for (const r of [rootA, rootB]) { try { rmSync(r, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* noop */ } }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
void mkdirSync; void writeFileSync; void dirname;
