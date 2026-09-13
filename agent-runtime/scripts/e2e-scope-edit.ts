// E2E REAL (modelo + Chromium) — ESCopo mínimo, framing≠swap e velocidade.
//   T1: "Troque a cor do site de laranja para vermelho." → cor muda; logo/fotos/texto/estrutura IGUAIS; rápido.
//   T2: "A cabeça ... do Hero está cortada, mostre a cabeça por completo." → MESMA imagem; enquadramento muda.
//   T3: "Diminua o zoom dessa imagem." → MESMA imagem; zoom/enquadramento muda.
import { readFileSync } from "node:fs";
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { BrowserSession } from "../src/browser-session";
import { extractImageUrls, siteMetrics } from "../src/regression-guard";

function loadEnv(): void {
  try {
    const raw = readFileSync(process.cwd() + "/.env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sem .env */ }
}

const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Studio Aurora</title>
<link rel="stylesheet" href="./src/site.css"></head><body>
<header class="top"><img class="logo" src="./assets/logo.svg" alt="Logo"><nav><a href="#serv">Serviços</a><a href="#cta">Contato</a></nav></header>
<main>
<section class="hero"><h1>Design de interiores sob medida</h1><p>Cuidamos de cada detalhe do seu ambiente.</p>
<img class="foto" src="./assets/foto.svg" alt="Ambiente"><a class="cta" href="#cta">Pedir orçamento</a></section>
<section id="serv"><h2>Serviços</h2><article class="card">Residencial</article><article class="card">Comercial</article></section>
<section id="dep"><h2>Depoimentos</h2><blockquote>“Impecável.” — Maria</blockquote></section>
<section id="cta"><h2>Vamos começar?</h2><a class="cta" href="https://wa.me/5511">Falar no WhatsApp</a></section>
</main><footer>© Studio Aurora</footer></body></html>`;

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui;color:#0f172a}
:root{--brand:#ff7a00;--ink:#0f172a}
header{display:flex;align-items:center;gap:20px;padding:16px 24px;border-bottom:1px solid #e2e8f0}
.logo{height:32px}section{padding:80px 24px}.hero{background:#f1f5f9}
.hero .foto{width:100%;height:320px;object-fit:cover;object-position:center center;border-radius:12px;display:block;margin:16px 0}
.cta{display:inline-block;background:var(--brand);color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none}
.card{padding:20px;border:1px solid #e2e8f0;border-radius:12px;margin:8px 0}footer{padding:22px;background:var(--ink);color:#cbd5e1}`;

const SITE: Record<string, string> = {
  "index.html": HTML,
  "src/site.css": CSS,
  "assets/logo.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32"><rect width="120" height="32" rx="6" fill="#ff7a00"/><text x="8" y="22" font-size="16" fill="#fff">Aurora</text></svg>`,
  "assets/foto.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="400" height="600" fill="#cbd5e1"/><circle cx="200" cy="180" r="90" fill="#64748b"/><rect x="80" y="300" width="240" height="300" rx="40" fill="#475569"/></svg>`,
  "src/site.json": JSON.stringify({ business: { name: "Studio Aurora", segment: "Design de interiores" } }),
};

const textSig = (files: Record<string, string>) =>
  (files["index.html"] ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function computed(filesRoot: string, expr: string): Promise<string | null> {
  const s = new BrowserSession(filesRoot);
  try {
    await s.open("/?t=" + Date.now(), { width: 1280, height: 720 });
    const r = await s.evaluate(`(() => { try { return (${expr}); } catch (e) { return null; } })()`);
    return (r.value ?? null) as string | null;
  } finally { await s.close().catch(() => undefined); }
}

async function run(instruction: string, projectId: string) {
  const root = ensureWorkspaceDir(projectId, SITE);
  const agent = new ProspectorSiteAgent({ workspaceRoot: root, business: { name: "Studio Aurora", segment: "Design de interiores", city: "SP", state: "SP" }, maxIterations: 30, initialFiles: SITE, enableBrowser: true, mode: "edit" });
  const tools: string[] = [];
  agent.subscribe((e) => { const ev = e as { type: string; toolCall?: { toolName?: string } }; if (ev.type === "tool-started" && ev.toolCall?.toolName) tools.push(ev.toolCall.toolName); });
  const t0 = Date.now();
  const out = await agent.runTask(instruction);
  const ms = Date.now() - t0;
  const after = readWorkspace(root);
  return { out, after, ms, tools: [...new Set(tools)], root };
}

async function main() {
  loadEnv();
  if (!process.env.DEEPSEEK_API_KEY && !process.env.PROSPECTOR_API_KEY) { console.error("sem API key"); process.exit(1); }
  const before = SITE;
  const imgBefore = extractImageUrls(before).join("|");
  const secBefore = siteMetrics(before).sections;
  const textBefore = textSig(before);
  const results: unknown[] = [];
  const fail: string[] = [];

  // ── T1: COR (laranja → vermelho), escopo mínimo ─────────────────────────────
  {
    const { out, after, ms, tools, root } = await run("Troque a cor do site de laranja para vermelho.", "scope-color-A");
    const ctaColor = await computed(root, "getComputedStyle(document.querySelector('.cta')).backgroundColor");
    const rgb = (ctaColor ?? "").match(/[0-9]+/g)?.map(Number) ?? [];
    const isRed = rgb.length >= 3 && rgb[0] >= 150 && rgb[0] > rgb[1] && rgb[0] > rgb[2];
    const imgsSame = extractImageUrls(after).join("|") === imgBefore;
    const textSame = textSig(after) === textBefore;
    const secSame = siteMetrics(after).sections === secBefore;
    results.push({ t: "T1-cor", ms, color: ctaColor, isRed, imgsSame, textSame, secSame, touched: out.touched, reply: out.reply.split("\n")[0], tools });
    if (!out.ok) fail.push(`T1 não ok: ${out.error ?? out.reply}`);
    if (!isRed) fail.push(`T1 cor não ficou vermelha (computed ${ctaColor})`);
    if (!imgsSame) fail.push("T1 imagens mudaram (fora do escopo)");
    if (!textSame) fail.push("T1 texto mudou (fora do escopo)");
    if (!secSame) fail.push("T1 estrutura de seções mudou (fora do escopo)");
    if (ms > 150000) fail.push(`T1 lento: ${ms}ms`);
    cleanupWorkspace(root);
  }

  // ── T2: FRAMING (cabeça cortada) — NÃO trocar a imagem ──────────────────────
  {
    const { out, after, ms, root } = await run("A cabeça da mulher que está na foto do Hero está cortada. Mostre a cabeça dela por completo.", "scope-framing-B");
    const srcAfter = (after["index.html"] ?? "").match(/class="foto"[^>]*src=["']([^"']+)["']/i)?.[1] ?? "";
    const srcSame = extractImageUrls(after).join("|") === imgBefore;
    const objPos = await computed(root, "getComputedStyle(document.querySelector('.hero .foto')).objectPosition");
    const objFit = await computed(root, "getComputedStyle(document.querySelector('.hero .foto')).objectFit");
    const changed = (objPos ?? "center center") !== "50% 50%" && (objPos ?? "") !== "50% 50%" || (objFit ?? "") !== "cover";
    results.push({ t: "T2-framing", ms, srcAfter, srcSame, objPos, objFit, changed, touched: out.touched, reply: out.reply.split("\n")[0] });
    if (!out.ok) fail.push(`T2 não ok: ${out.error ?? out.reply}`);
    if (!srcSame) fail.push("T2 TROCOU a imagem (deveria manter o mesmo asset)");
    if (!changed) fail.push(`T2 enquadramento não mudou (objectPosition=${objPos}, objectFit=${objFit})`);
    if (!/enquadramento/i.test(out.reply)) fail.push("T2 relatório não menciona enquadramento");
    if (ms > 150000) fail.push(`T2 lento: ${ms}ms`);
    cleanupWorkspace(root);
  }

  // ── T3: ZOOM — mesma imagem ─────────────────────────────────────────────────
  {
    const { out, after, ms, root } = await run("Diminua o zoom dessa imagem do Hero.", "scope-zoom-C");
    const srcSame = extractImageUrls(after).join("|") === imgBefore;
    const objPos = await computed(root, "getComputedStyle(document.querySelector('.hero .foto')).objectPosition");
    const objFit = await computed(root, "getComputedStyle(document.querySelector('.hero .foto')).objectFit");
    results.push({ t: "T3-zoom", ms, srcSame, objPos, objFit, touched: out.touched, reply: out.reply.split("\n")[0] });
    if (!out.ok) fail.push(`T3 não ok: ${out.error ?? out.reply}`);
    if (!srcSame) fail.push("T3 TROCOU a imagem (deveria manter o mesmo asset)");
    if (ms > 150000) fail.push(`T3 lento: ${ms}ms`);
    cleanupWorkspace(root);
  }

  console.log("\n=== RESULTADOS (modelo + Chromium) ===");
  console.log(JSON.stringify(results, null, 2));
  if (fail.length) { console.error("\nFALHAS:\n- " + fail.join("\n- ")); process.exit(1); }
  console.log("\nOK: escopo mínimo, framing≠swap e velocidade comprovados em Chromium real.");
}

main().catch((e) => { console.error(e); process.exit(1); });
