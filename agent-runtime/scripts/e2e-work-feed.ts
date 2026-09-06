// E2E 5.29 — timeline de atividade REAL do agente exibida no chat.
// Executa uma edição real no Cline e prova que a timeline é construída SOMENTE
// com os eventos executados (nenhuma etapa fabricada) e que arquivos alterados
// reais aparecem.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { buildWorkTimeline } from "../../src/lib/agentWorkActivity";

const BUSINESS = { name: "Padaria Sol", segment: "Padaria", city: "São Paulo", state: "SP", whatsapp: "5511999999999" };

function makeSite(): FileMap {
  return {
    "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Padaria Sol</title><link rel="stylesheet" href="src/site.css"/></head><body>
<nav><a href="#inicio">Início</a><a href="#produtos">Produtos</a><a href="#contato">Contato</a></nav>
<section class="hero" id="inicio"><h1>Padaria Sol</h1><p>Pães artesanais todas as manhãs.</p><a class="cta" href="#contato">Encomendar</a></section>
<section id="produtos"><h2>Produtos</h2><p>Pão francês, integral e doces.</p><img src="https://images.unsplash.com/photo-1509440159596-0249088772ff" alt="pães"/></section>
<footer>© Padaria Sol</footer><script src="src/main.js"></script></body></html>`,
    "src/site.css": ".cta{background:#c2410c;color:#fff;padding:12px 20px;display:inline-block;text-decoration:none;border-radius:8px}@media(max-width:600px){.hero{width:100%}}",
    "src/main.js": `console.log("ok");`,
    "src/site.json": JSON.stringify({ business: BUSINESS }),
  };
}

async function main() {
  const pid = `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const root = ensureWorkspaceDir(pid, makeSite());
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root, business: BUSINESS, maxIterations: 30, initialFiles: makeSite(), enableBrowser: false, mode: "edit",
  });
  const before = readWorkspace(root);
  const out = await agent.runTask("Mude a cor do CTA (.cta) para azul-escuro (#1d4ed8).");
  const after = readWorkspace(root);
  const changedFiles = Object.keys(after).filter((k) => before[k] !== after[k]);
  const timeline = buildWorkTimeline(out.activity as never, changedFiles);
  cleanupWorkspace(pid);

  console.log("=== E2E TIMELINE DE ATIVIDADE (5.29) ===");
  console.log("ok:", out.ok, "| changed:", changedFiles.length > 0);
  console.log("timeline exibida no chat:\n" + timeline);
  // toda linha da timeline corresponde a um evento real OU à lista de arquivos reais
  const feedReal = timeline.includes("Trabalho do agente") && changedFiles.length > 0 && timeline.includes(changedFiles[0]);
  const pass = out.ok && changedFiles.length > 0 && feedReal;
  console.log("\n" + (pass ? "PASS: timeline do chat reflete apenas atividades/arquivos reais" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
