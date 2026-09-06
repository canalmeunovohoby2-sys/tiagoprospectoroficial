// E2E 5.35 — TROCA REAL DE IMAGENS no editor (sem "fingir").
// Site rico (hero A + seções B/C/D + nav/footer/animações/responsividade).
// 1º pedido: trocar SÓ o hero. 2º pedido: trocar SÓ a imagem da seção X.
// Valida DOM + preservação + screenshot renderizada diferente (evidência visual).
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { BrowserSession } from "../src/browser-session";

const BUSINESS = { name: "Academia Corpo Forte", segment: "Academia", city: "São Paulo", state: "SP", whatsapp: "5511999999999" };
const A = "https://images.unsplash.com/photo-hero-antigo?w=1600";
const B = "https://images.unsplash.com/photo-secao-b";
const C = "https://images.unsplash.com/photo-secao-c";
const D = "https://images.unsplash.com/photo-secao-d";

function makeSite(): FileMap {
  return {
    "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Academia Corpo Forte</title><link rel="stylesheet" href="src/site.css"/></head><body>
<nav><a href="#inicio">Início</a><a href="#treinos">Treinos</a><a href="#contato">Contato</a></nav>
<section class="hero" id="inicio"><h1>Academia Corpo Forte</h1><p>Treinos que transformam com estrutura completa e professores atentos.</p><img id="hero-img" class="hero-img" src="${A}" alt="academia hero"/></section>
<section id="treinos"><h2>Treinos</h2>
  <img src="${B}" alt="musculação"/><img src="${C}" alt="funcional"/><img src="${D}" alt="spinning"/>
</section>
<footer>© Academia Corpo Forte</footer><script src="src/main.js"></script></body></html>`,
    "src/site.css": `.hero{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center;padding:30px}.hero-img{width:100%;border-radius:14px}section img{width:300px;border-radius:12px;margin:6px}@media(max-width:700px){.hero{grid-template-columns:1fr}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`,
    "src/main.js": `document.querySelectorAll("img").forEach((i)=>{i.style.opacity=1});`,
    "src/site.json": JSON.stringify({ business: BUSINESS }),
  };
}

async function capturePng(root: string): Promise<Buffer | null> {
  const session = new BrowserSession(root);
  try {
    const base = await session.startServer();
    await session.open(base, { width: 1280, height: 860 });
    const p = await session.screenshot("swap", { fullPage: false });
    const { readFileSync } = await import("node:fs");
    return readFileSync(p);
  } catch {
    return null;
  } finally {
    await session.close().catch(() => {});
  }
}

function heroSrc(html: string): string | null {
  const m = /<img[^>]+id="hero-img"[^>]+src="([^"]+)"/.exec(html) ?? html.match(/class="hero-img"[^>]+src="([^"]+)"/);
  return m ? m[1] : null;
}

async function main() {
  const pid = `swap-${Date.now()}`;
  const root = ensureWorkspaceDir(pid, makeSite());
  const agent = new ProspectorSiteAgent({ workspaceRoot: root, business: BUSINESS, maxIterations: 40, initialFiles: makeSite(), enableBrowser: true, mode: "edit" });
  const html0 = readWorkspace(root)[Object.keys(readWorkspace(root)).find((k) => k.endsWith("index.html")) ?? ""] ?? "";
  const hero0 = heroSrc(html0);
  const shot0 = await capturePng(root);
  const results: Array<{ title: string; pass: boolean; detail: string }> = [];

  // 1ª troca: só o hero
  const out1 = await agent.runTask("Troque APENAS a imagem do hero por uma mais profissional e contextual para academia (URL diferente da atual). Não mexa em mais nada: mantenha as imagens B/C/D, navegação, footer, textos e animações.");
  const files1 = readWorkspace(root);
  const html1 = files1[Object.keys(files1).find((k) => k.endsWith("index.html")) ?? ""] ?? "";
  const css1 = files1[Object.keys(files1).find((k) => k.endsWith("site.css")) ?? ""] ?? "";
  const hero1 = heroSrc(html1);
  const ok1 = out1.ok && !!hero1 && hero1 !== hero0 && !hero1.includes("photo-hero-antigo") && html1.includes(B) && html1.includes(C) && html1.includes(D) && html1.includes("<nav") && html1.includes("<footer") && css1.includes("@keyframes") && css1.includes("@media");
  const shot1 = await capturePng(root);
  const visual1 = !!shot0 && !!shot1 && !shot0.equals(shot1);
  results.push({ title: "Troca do hero (1ª)", pass: ok1 && visual1, detail: `ok=${out1.ok} hero ${hero0?.slice(0, 40)} → ${hero1?.slice(0, 40)} | B/C/D/nav/footer/anim ok=${ok1} | screenshot mudou=${visual1}` });
  console.log(`hero: ${hero0} → ${hero1} | ok=${out1.ok} | visual=${visual1}`);

  // 2ª troca: só a imagem da seção (trocar de novo depois de já ter trocado)
  const out2 = await agent.runTask("Agora troque apenas a imagem da seção 'Treinos' que aponta para photo-secao-b (mantenha o restante exatamente igual, inclusive a imagem nova do hero que você acabou de colocar).");
  const files2 = readWorkspace(root);
  const html2 = files2[Object.keys(files2).find((k) => k.endsWith("index.html")) ?? ""] ?? "";
  const hero2 = heroSrc(html2);
  const ok2 = out2.ok && !html2.includes("photo-secao-b") && html2.includes(C) && html2.includes(D) && hero2 === hero1 && html2.includes("<nav") && html2.includes("<footer");
  const shot2 = await capturePng(root);
  const visual2 = !!shot1 && !!shot2 && !shot1.equals(shot2);
  results.push({ title: "Troca seção Treinos (2ª)", pass: ok2 && visual2, detail: `ok=${out2.ok} photo-secao-b removida=${!html2.includes("photo-secao-b")} hero preservado=${hero2 === hero1} | screenshot mudou=${visual2}` });
  console.log(`seção-b removida=${!html2.includes("photo-secao-b")} | hero preservado=${hero2 === hero1} | visual=${visual2}`);

  cleanupWorkspace(pid);

  console.log("\n\n===== RESUMO E2E TROCA REAL DE IMAGENS (5.35) =====");
  for (const r of results) console.log(`- ${r.title}: ${r.pass ? "PASS" : "REVISAR"} | ${r.detail}`);
  const pass = results.every((r) => r.pass);
  console.log("\n" + (pass ? "PASS: trocas de imagem reais, preservando o restante, com prova visual" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
