// E2E REAL do caso reportado: pedido NATURAL de movimento ("o site está muito
// parado, quero que as coisas apareçam conforme eu rolo") deve resultar em
// ALTERAÇÃO REAL no código e ser verificado no Chromium.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureWorkspaceDir, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { BrowserSession } from "../src/browser-session";

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sem .env */ }
}

const SITE: FileMap = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Studio Aurora</title><link rel="stylesheet" href="src/site.css"></head><body>
<header class="top"><strong>Studio Aurora</strong><nav><a href="#serv">Serviços</a><a href="#dep">Depoimentos</a><a href="#contato">Contato</a></nav></header>
<main>
<section class="hero" id="inicio"><h1>Studio Aurora</h1><p>Design de interiores sob medida.</p><a class="cta" href="#contato">Fale conosco</a></section>
<section class="servicos" id="serv"><h2>Serviços</h2><div class="cards"><article class="card">Projeto residencial</article><article class="card">Projeto comercial</article><article class="card">Consultoria</article></div></section>
<section class="depoimentos" id="dep"><h2>Depoimentos</h2><blockquote>“Trabalho impecável.” — Maria</blockquote><blockquote>“Superaram as expectativas.” — João</blockquote></section>
<section class="cta-final" id="contato"><h2>Vamos começar?</h2><a class="cta" href="https://wa.me/5511">Chamar no WhatsApp</a></section>
</main>
<footer class="rodape">© Studio Aurora</footer>
<script src="src/main.js"></script>
</body></html>`,
  "src/site.css": `:root{--brand:#0f766e;--ink:#0f172a}
*{box-sizing:border-box}body{margin:0;font-family:system-ui;color:var(--ink)}
.top{display:flex;gap:24px;padding:18px 24px}
.hero{padding:96px 24px;background:#f1f5f9}
.servicos,.depoimentos,.cta-final{padding:72px 24px}
.cards{display:flex;gap:16px;flex-wrap:wrap}
.card{flex:1;min-width:200px;padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}
.cta{display:inline-block;background:var(--brand);color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none}
.rodape{padding:24px;background:var(--ink);color:#cbd5e1}`,
  "src/main.js": `document.documentElement.dataset.ready="1";`,
  "src/site.json": JSON.stringify({ business: { name: "Studio Aurora", segment: "Design de interiores" } }),
};

const INSTRUCTION =
  "O site está muito parado. Conforme a gente for navegando pelo site, as coisas vão aparecendo com algum tipo de efeito de movimento.";

async function main() {
  loadEnv();
  if (!process.env.DEEPSEEK_API_KEY && !process.env.PROSPECTOR_API_KEY) {
    console.error("sem API key (DEEPSEEK_API_KEY)");
    process.exit(1);
  }
  const pid = "motion-edit";
  const root = ensureWorkspaceDir(pid, SITE);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Studio Aurora", segment: "Design de interiores", city: "SP", state: "SP" },
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

  console.log("=== INSTRUÇÃO NATURAL:", INSTRUCTION);
  const out = await agent.runTask(INSTRUCTION);
  const files = out.files ?? {};
  const allText = Object.values(files).join("\n");
  const revealCode = /intersectionobserver|scroll|\.reveal|is-visible|opacity\s*:\s*0|translate[Yy]?\(|@keyframes|fade|animation|transition/i.test(allText);
  const preserved =
    /Studio Aurora/.test(files["index.html"] ?? "") &&
    /(Serviços|servicos)/i.test(files["index.html"] ?? "") &&
    /(Contato|contato|cta-final)/i.test(files["index.html"] ?? "") &&
    /rodape|footer/i.test(files["index.html"] ?? "");

  console.log("ok:", out.ok, "| error:", out.error ?? "—", "| unverified:", out.unverified);
  console.log("completion:", JSON.stringify(out.completion));
  console.log("touched:", JSON.stringify(out.touched));
  console.log("tools:", JSON.stringify([...new Set(tools)]));
  console.log("reveal/motion no código:", revealCode, "| estrutura preservada (sem reconstruir):", preserved);
  console.log("--- src/site.css (trecho reveal) ---");
  console.log(String(files["src/site.css"] ?? "").match(/[^\n]*(reveal|opacity|translate|@keyframes|animation|transition|is-visible)[^\n]*/gi)?.slice(0, 12).join("\n") ?? "(nada)");
  console.log("--- src/main.js (trecho reveal) ---");
  console.log(String(files["src/main.js"] ?? "").match(/[^\n]*(IntersectionObserver|scroll|classList|observe|reveal|is-visible)[^\n]*/gi)?.slice(0, 12).join("\n") ?? "(nada)");

  // Verificação REAL no Chromium: elementos abaixo da dobra MUDAM de estado
  // (opacity/transform/visibility) ao entrarem na viewport — sem usar `top`.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const session = new BrowserSession(root);
  const snap = async (selector: string) => {
    const expr = `(() => Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((el) => { const cs = getComputedStyle(el); return { cls: String(el.className || el.tagName).slice(0, 48), opacity: cs.opacity, transform: cs.transform, filter: cs.filter, clipPath: cs.clipPath, visibility: cs.visibility }; }))()`;
    const r = await session.evaluate(expr);
    return (r.value ?? []) as Array<Record<string, string>>;
  };
  try {
    await session.open("/?t=" + Date.now(), { width: 1280, height: 720 });
    const sel = "main > section, .card, footer";
    const before = await snap(sel);
    for (let y = 0; y <= 2400; y += 400) {
      await session.evaluate(`window.scrollTo(0, ${y})`);
      await sleep(250);
    }
    await session.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await sleep(1000);
    const after = await snap(sel);
    const keys = ["opacity", "transform", "filter", "clipPath", "visibility"];
    const changed = before
      .map((b, i) => {
        const a = after[i] ?? {};
        const diffs = keys.filter((k) => String(b[k]) !== String(a[k]));
        return { cls: b.cls, diffs, before: { opacity: b.opacity, transform: b.transform, visibility: b.visibility }, after: { opacity: a.opacity, transform: a.transform, visibility: a.visibility } };
      })
      .filter((x) => x.diffs.length > 0);
    const insp = await session.inspectCurrent();
    console.log("\n[Chromium] elementos que MUDARAM de estado ao rolar:", JSON.stringify(changed));
    console.log("[Chromium] consoleErrors:", insp.consoleErrors.length, JSON.stringify(insp.consoleErrors.slice(0, 3)));
    console.log("[Chromium] overflowHorizontal:", insp.horizontalOverflow);
    console.log("[Chromium] reveal detectado objetivamente:", changed.length > 0);
  } catch (e) {
    console.log("chromium erro:", e instanceof Error ? e.message : e);
  } finally {
    await session.close().catch(() => undefined);
    cleanupWorkspace(pid);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
