// E2E REAL por `tsx` (MESMO caminho de transpilação do runtime em produção, que
// injeta `__name` em callbacks). Prova:
//  1) a correção do `__name` (gravação roda sem ReferenceError);
//  2) PERSONALIZAÇÃO por projeto (dois sites estruturalmente diferentes → planos diferentes);
//  3) REGENERAÇÃO (editar o site e gerar de novo → novo MP4/novo plano);
//  4) MP4 H.264 1280×720 válido (container/codec/duração via FFmpeg).
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { generateSitePromoVideo } from "../src/site-video-promo";
import { createArtifactStore } from "../src/artifact-store";

const HEAD = (title: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<link rel="stylesheet" href="./src/site.css"></head><body>`;
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui;color:#0f172a}header{display:flex;gap:20px;padding:16px 24px;border-bottom:1px solid #e2e8f0}
section{padding:80px 24px}.hero{background:#f1f5f9}h1{font-size:46px;margin:0 0 10px}.cards{display:flex;gap:16px;flex-wrap:wrap}
.card,.item{flex:1;min-width:200px;padding:22px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
.cta{display:inline-block;background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none}
footer{padding:22px;background:#0f172a;color:#cbd5e1}`;

// Site A: hero + serviços + depoimentos + WhatsApp
const SITE_A: Record<string, string> = {
  "index.html": `${HEAD("Pata Amiga")}
<header><strong>Pata Amiga</strong><nav><a href="#serv">Serviços</a><a href="#dep">Depoimentos</a><a href="#wa">WhatsApp</a></nav></header>
<main>
<section class="hero"><h1>Banho e tosa com cuidado</h1><p>Seu pet bem cuidado.</p><a class="cta" href="#wa">Falar no WhatsApp</a></section>
<section id="serv"><h2>Serviços</h2><div class="cards"><article class="card">Banho</article><article class="card">Tosa</article><article class="card">Hidratação</article></div></section>
<section id="dep"><h2>Depoimentos</h2><blockquote>“Cuidado impecável.” — Ana</blockquote></section>
<section id="wa"><h2>Fale no WhatsApp</h2><a class="cta" href="https://wa.me/5511">Chamar no WhatsApp</a></section>
</main><footer>© Pata Amiga</footer></body></html>`,
  "src/site.css": CSS,
  "src/site.json": JSON.stringify({ business: { name: "Pata Amiga", segment: "Pet shop" } }),
};

// Site B: hero + portfólio + galeria + formulário + FAQ (estrutura bem diferente)
const SITE_B: Record<string, string> = {
  "index.html": `${HEAD("Studio Norte")}
<header><strong>Studio Norte</strong><nav><a href="#port">Portfólio</a><a href="#gal">Galeria</a><a href="#faq">FAQ</a></nav></header>
<main>
<section class="hero"><h1>Projetos de arquitetura</h1><p>Do conceito à obra.</p><a class="cta" href="#contato">Pedir orçamento</a></section>
<section id="port"><h2>Portfólio</h2><div class="cards"><article class="item">Residência Ipê</article><article class="item">Loja Centro</article></div></section>
<section id="gal"><h2>Galeria</h2><div class="cards"><img src="./favicon.svg" alt=""><img src="./favicon.svg" alt=""></div></section>
<section id="faq"><h2>Perguntas frequentes</h2><p>Como funciona o projeto?</p></section>
<section id="contato"><h2>Orçamento</h2><form><input placeholder="Nome"><input placeholder="E-mail"><button type="button">Enviar</button></form></section>
</main><footer>© Studio Norte</footer></body></html>`,
  "src/site.css": CSS,
  "assets/favicon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0e3a5b"/></svg>`,
  "src/site.json": JSON.stringify({ business: { name: "Studio Norte", segment: "Arquitetura" } }),
};

function makeSite(root: string, files: Record<string, string>) {
  for (const [p, c] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, c, "utf8");
  }
}

async function main() {
  const base = mkdtempSync(join(tmpdir(), "promo-e2e-"));
  const artifacts = join(base, "artifacts");
  const store = createArtifactStore({ root: artifacts });
  const results: unknown[] = [];
  try {
    // ---- Projeto A ----
    const a = join(base, "siteA"); makeSite(a, SITE_A);
    const ra = await generateSitePromoVideo({ workspaceRoot: a, projectId: "proj-A", store, target: 22, onPhase: (p) => process.stdout.write(`A:${p} `) });
    const aBytes = await store.getProjectFile("proj-A", "video/current.mp4");
    results.push({ site: "A", ok: ra.ok, reason: ra.reason, duration: ra.duration, w: ra.width, h: ra.height, codec: ra.codec, bytes: aBytes?.length ?? 0, plan: ra.plan?.map((t) => t.kind) });

    // ---- Projeto B (estrutura diferente) ----
    const b = join(base, "siteB"); makeSite(b, SITE_B);
    const rb = await generateSitePromoVideo({ workspaceRoot: b, projectId: "proj-B", store, target: 22, onPhase: (p) => process.stdout.write(`B:${p} `) });
    const bBytes = await store.getProjectFile("proj-B", "video/current.mp4");
    results.push({ site: "B", ok: rb.ok, reason: rb.reason, duration: rb.duration, w: rb.width, h: rb.height, codec: rb.codec, bytes: bBytes?.length ?? 0, plan: rb.plan?.map((t) => t.kind) });

    // ---- Regeneração: editar o site A e gerar de novo ----
    const edited = SITE_A["index.html"].replace("<footer>© Pata Amiga</footer>", `<section id="novo"><h2>Novidades</h2><p>Nova seção adicionada.</p></section><footer>© Pata Amiga</footer>`);
    writeFileSync(join(a, "index.html"), edited, "utf8");
    const ra2 = await generateSitePromoVideo({ workspaceRoot: a, projectId: "proj-A", store, target: 22, onPhase: (p) => process.stdout.write(`A2:${p} `) });
    results.push({ site: "A2", ok: ra2.ok, reason: ra2.reason, duration: ra2.duration, plan: ra2.plan?.map((t) => t.kind), hasNovidades: !!ra2.plan?.some((t) => /novidades/i.test(t.text)) });

    console.log("\n=== RESULTADOS ===");
    console.log(JSON.stringify(results, null, 2));

    // Asserções (sem framework): falha alto se algo estiver errado.
    const A = ra.plan?.map((t) => t.kind) ?? [];
    const B = rb.plan?.map((t) => t.kind) ?? [];
    const fail: string[] = [];
    if (!ra.ok) fail.push(`A falhou: ${ra.reason}`);
    if (!rb.ok) fail.push(`B falhou: ${rb.reason}`);
    if (!ra2.ok) fail.push(`A2 falhou: ${ra2.reason}`);
    if (!aBytes || aBytes.length < 2048) fail.push("MP4 do A ausente/pequeno");
    if (!bBytes || bBytes.length < 2048) fail.push("MP4 do B ausente/pequeno");
    if (ra.width !== 1280 || ra.height !== 720) fail.push("A não é 1280x720");
    if (!/h264|avc/i.test(ra.codec ?? "")) fail.push("A não é H.264");
    if (!A.includes("whatsapp") && !A.includes("cta")) fail.push("A não tem CTA/WhatsApp no plano");
    if (!B.includes("form")) fail.push("B não incluiu o formulário no plano");
    if (!B.includes("gallery") && !B.includes("portfolio")) fail.push("B não incluiu galeria/portfólio");
    if (JSON.stringify(A) === JSON.stringify(B)) fail.push("planos A e B idênticos (não personalizado)");
    if (!ra2.plan?.some((t) => /novidades/i.test(t.text))) fail.push("regeneração não refletiu a edição (Novidades)");
    if (fail.length) { console.error("\nFALHAS:\n- " + fail.join("\n- ")); process.exit(1); }
    console.log("\nOK: __name resolvido, personalização A/B comprovada, regeneração refletiu a edição.");
  } finally {
    rmSync(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
void readFileSync;
