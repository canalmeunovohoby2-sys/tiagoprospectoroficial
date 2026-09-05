// E2E 5.29 — substituição REAL de imagens.
// Reproduz o relato do usuário: foto anexada colocada no hero funciona, mas pedir
// para substituir as imagens dos CARDS pela MESMA foto (ou por outras) falhava com
// "feito" sem efeito. Corrigido por: referência a assets/ (em vez de inline do data
// URL gigante), reuso permitido de foto do usuário e honestidade do guard.
// Aqui o agente REAL recebe a foto em assets/ e deve:
//  a) usar a MESMA foto do usuário nos TRÊS cards (evidência: 3+ refs à foto);
//  b) trocar as fotos dos cards por outras DISTINTAS (banco) quando pedido.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { materializeAttachments } from "../src/attachments";
import { resolveWorkspaceRoot } from "../src/workspace";

const BUSINESS = { name: "Barbearia Nobre", segment: "Barbearia", city: "São Paulo", state: "SP", whatsapp: "5511999999999" };

// PNG 1x1 vermelho (foto do cliente p/ os cards) e 1x1 azul (já no hero).
const CLIENT_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const HERO_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function makeSite(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><title>Barbearia Nobre</title><link rel="stylesheet" href="src/site.css"/></head>
<body>
<header><nav><a href="#inicio">Início</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav></header>
<section class="hero" id="inicio">
  <img class="hero-foto" src="data:image/png;base64,${HERO_PNG}" alt="ambiente da barbearia"/>
  <h1>Barbearia Nobre</h1><p>Corte e barba impecáveis.</p><a class="cta" href="#contato">Agendar</a>
</section>
<section id="servicos">
  <h2>Nossos serviços</h2>
  <div class="cards">
    <article class="card"><img src="https://images.unsplash.com/photo-1a" alt="Corte clássico"/><h3>Corte clássico</h3><p>Navalha e tesoura.</p></article>
    <article class="card"><img src="https://images.unsplash.com/photo-2b" alt="Barba completa"/><h3>Barba completa</h3><p>Toalha quente e acabamento.</p></article>
    <article class="card"><img src="https://images.unsplash.com/photo-3c" alt="Combo rei"/><h3>Combo rei</h3><p>Corte + barba + hidratação.</p></article>
  </div>
</section>
<footer>© Barbearia Nobre</footer>
<script src="src/main.js"></script>
</body></html>`,
    "src/site.css": `.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card img{width:100%;height:180px;object-fit:cover}`,
    "src/main.js": `console.log("ok");`,
    "src/site.json": JSON.stringify({ business: BUSINESS }),
  };
}

async function runStep(title: string, instruction: string, attach?: { name: string; mediaType: string; dataUrl: string }) {
  const pid = `replace-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const root = ensureWorkspaceDir(pid, makeSite());
  let assetPath = "";
  if (attach) {
    const mat = materializeAttachments(resolveWorkspaceRoot(pid), [attach]);
    assetPath = mat.attachments[0]?.path ?? "";
  }
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: BUSINESS,
    maxIterations: 45,
    initialFiles: makeSite(),
    enableBrowser: true,
    mode: "edit",
  });
  console.log(`\n=== ${title} ===`);
  const before = readWorkspace(root);
  const out = await agent.runTask(instruction.replace("{{ASSET}}", assetPath || "assets/equipe-1.png"));
  const after = readWorkspace(root);
  const index = after[Object.keys(after).find((k) => k.endsWith("index.html")) ?? ""] ?? "";
  console.log("ok:", out.ok, "| error:", out.error ?? "—", "| touched:", JSON.stringify(out.touched ?? []));
  console.log("reply:", (out.reply ?? "").replace(/\s+/g, " ").slice(0, 260));
  cleanupWorkspace(pid);
  return { title, out, changed: JSON.stringify(before) !== JSON.stringify(after), index, ok: out.ok };
}

async function main() {
  const results: Array<{ title: string; ok: boolean; changed: boolean; pass: boolean; detail: string }> = [];

  // (a) MESMA foto do usuário nos três cards
  const photoDataUrl = `data:image/png;base64,${CLIENT_PNG}`;
  const stepA = await runStep(
    "Aplicar foto do usuário nos 3 cards",
    `A foto do cliente está em {{ASSET}}. Substitua as imagens dos TRÊS cards de serviço por essa MESMA foto do cliente — referencie o arquivo real ({{ASSET}}) em cada card. Mantenha o hero (que já tem sua foto) e todo o resto igual. NÃO altere outras imagens.`,
    { name: "equipe.png", mediaType: "image/png", dataUrl: photoDataUrl },
  );
  const assetRefs = (stepA.index.match(/assets\/equipe-1\.png/gi) ?? []).length;
  const inlineRefs = (stepA.index.match(new RegExp(CLIENT_PNG.replace(/\+/g, "\\+").replace(/\//g, "\\/"), "g")) ?? []).length;
  const usedPhoto = assetRefs + inlineRefs;
  const heroIntact = stepA.index.includes(HERO_PNG);
  const stepAPass = stepA.ok && stepA.changed && usedPhoto >= 3 && heroIntact;
  results.push({ title: stepA.title, ok: stepA.ok, changed: stepA.changed, pass: stepAPass, detail: `refs foto do usuário: ${assetRefs} (asset) + ${inlineRefs} (inline) | hero intacto: ${heroIntact}` });
  console.log("refs asset:", assetRefs, "| inline da foto:", inlineRefs, "| hero intacto:", heroIntact);

  // (b) troca das fotos dos cards por outras DISTINTAS do banco
  const prev = ["photo-1a", "photo-2b", "photo-3c"];
  const stepB = await runStep(
    "Trocar fotos dos cards por outras (banco)",
    `Troque as imagens dos três cards de serviço por OUTRAS fotos de barbearia (Unsplash), DIFERENTES entre si e diferentes das atuais. Mantenha o hero (foto do cliente) e o restante do site.`,
  );
  const afterUrls = [...stepB.index.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
  const newStock = afterUrls.filter((u) => u.startsWith("https://") && !prev.some((p) => u.includes(p)) && !u.startsWith("data:"));
  const distinctNew = new Set(newStock).size;
  const stepBPass = stepB.ok && stepB.changed && distinctNew >= 2;
  results.push({ title: stepB.title, ok: stepB.ok, changed: stepB.changed, pass: stepBPass, detail: `novas urls distintas de banco: ${distinctNew}` });
  console.log("novas urls distintas (banco):", distinctNew, "->", JSON.stringify([...new Set(newStock)].slice(0, 5)));

  console.log("\n===== RESUMO E2E SUBSTITUIÇÃO DE IMAGENS =====");
  for (const r of results) console.log(`- ${r.title}: ok=${r.ok} changed=${r.changed} pass=${r.pass} | ${r.detail}`);
  const pass = results.every((r) => r.pass);
  console.log("\n" + (pass ? "PASS: o agente substitui imagens de cards de verdade (foto do usuário e banco)" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
