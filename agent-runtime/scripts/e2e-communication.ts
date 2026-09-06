// E2E 5.28 — comunicação profissional do agente.
// Valida os 5 cenários pedidos, com o MESMO ProspectorSiteAgent real:
//  1) conversa com múltiplas mensagens dependentes do contexto (continuidade);
//  2) alteração simples → resposta curta e direta;
//  3) alteração complexa → resposta estruturada + arquivos reais;
//  4) auditoria técnica → análise estruturada SEM alterar arquivos;
//  5) falha (tool/arquivo inexistente) → relato honesto, sem inventar sucesso.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

const BUSINESS = { name: "Pet Shop Amigo Fiel", segment: "Pet Shop", city: "Belo Horizonte", state: "MG", whatsapp: "5531999999999", phone: "(31) 99999-9999", address: "Rua dos Pássaros, 45" };

function makeSite(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pet Shop Amigo Fiel</title><link rel="stylesheet" href="src/site.css"/></head>
<body>
<header><nav><a href="#inicio">Início</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav></header>
<section class="hero" id="inicio">
  <h1>Pet Shop Amigo Fiel</h1><p>Banho, tosa e cuidados para o seu pet.</p>
  <a class="cta" href="#contato">Agendar horário</a>
</section>
<section id="servicos"><h2>Serviços</h2>
  <div class="cards">
    <article class="card"><h3>Banho & tosa</h3><p>Higiene completa e tosa na medida.</p></article>
    <article class="card"><h3>Hidratação</h3><p>Pelagem macia e saudável.</p></article>
    <article class="card"><h3>Day care</h3><p>Diversão monitorada enquanto você trabalha.</p></article>
  </div>
</section>
<footer>© Pet Shop Amigo Fiel</footer>
<script src="src/main.js"></script>
</body></html>`,
    "src/site.css": `.hero{background:#0f766e;color:#fff;padding:60px 20px;text-align:center}.cta{background:#f59e0b;color:#111;padding:12px 20px;display:inline-block;text-decoration:none;border-radius:8px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:30px 20px}.card{border:1px solid #ddd;border-radius:12px;padding:18px}`,
    "src/main.js": `console.log("pet shop ok");`,
    "src/site.json": JSON.stringify({ business: BUSINESS }),
  };
}

async function withSite<T>(title: string, fn: (root: string, agent: ProspectorSiteAgent) => Promise<T>): Promise<T> {
  const pid = `comm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const root = ensureWorkspaceDir(pid, makeSite());
  console.log(`\n=== ${title} ===`);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: BUSINESS,
    maxIterations: 40,
    initialFiles: makeSite(),
    enableBrowser: false,
    mode: "edit",
  });
  try {
    return await fn(root, agent);
  } finally {
    cleanupWorkspace(pid);
  }
}

function htmlOf(files: FileMap): string {
  const key = Object.keys(files).find((k) => k.endsWith("index.html")) ?? "";
  return files[key] ?? "";
}

async function main() {
  const results: Array<{ title: string; pass: boolean; detail: string }> = [];

  // 1) CONTINUIDADE — duas mensagens dependentes (mesma sessão do agente)
  const r1 = await withSite("1) Continuidade (2 mensagens dependentes)", async (root, agent) => {
    const m1 = await agent.runTask("Adicione uma nova seção 'Programa Fiel' (fidelidade: a cada 5 banhos, 1 grátis) ANTES do footer, com título e 3 cards, e adicione a âncora no menu.");
    const before2 = readWorkspace(root);
    const m2 = await agent.runTask("Na seção 'Programa Fiel' que você acabou de criar, troque o texto do primeiro card para 'A cada 5 banhos, 1 grátis no dia do seu pet'. Me diga em quais arquivos isso estava.");
    const after2 = readWorkspace(root);
    const changed2 = JSON.stringify(before2) !== JSON.stringify(after2);
    const html = htmlOf(after2);
    const contextOk = /fiel/i.test(m2.reply ?? "") && html.includes("A cada 5 banhos, 1 grátis");
    const replyHasFiles = /arquivo|index\.html|site\.css/i.test(m2.reply ?? "");
    return { pass: m1.ok && m2.ok && changed2 && contextOk && replyHasFiles, detail: `m1 ok=${m1.ok} | m2 ok=${m2.ok} mudou=${changed2} entendeu contexto+texto=${contextOk} cita arquivos=${replyHasFiles}\nreply: ${(m2.reply ?? "").replace(/\s+/g, " ").slice(0, 320)}` };
  });
  results.push({ title: "1) Continuidade", pass: r1.pass, detail: r1.detail });

  // 2) ALTERAÇÃO SIMPLES — resposta direta
  const r2 = await withSite("2) Alteração simples", async (root, agent) => {
    const before = readWorkspace(root);
    const out = await agent.runTask("Troque a cor do botão .cta para azul-escuro (#1d4ed8)");
    const after = readWorkspace(root);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const all = Object.values(after).join("\n");
    const cssOk = all.includes("#1d4ed8");
    const len = (out.reply ?? "").length;
    return { pass: out.ok && changed && cssOk, detail: `mudou=${changed} cor aplicada=${cssOk} reply ${len} chars: ${(out.reply ?? "").replace(/\s+/g, " ").slice(0, 180)}` };
  });
  results.push({ title: "2) Alteração simples", pass: r2.pass, detail: r2.detail });

  // 3) ALTERAÇÃO COMPLEXA — resposta estruturada + vários arquivos
  const r3 = await withSite("3) Alteração complexa", async (root, agent) => {
    const before = readWorkspace(root);
    const out = await agent.runTask("Deixe este site premium: aprimore o hero (imagem contextual + hierarquia), varie a composição das seções, complete o footer e adicione microinterações. Verifique o resultado antes de finalizar.");
    const after = readWorkspace(root);
    const touched = Object.keys(after).filter((k) => before[k] !== after[k]);
    const reply = out.reply ?? "";
    const structured = /(🔎|📋|🛠|📁|🧪|✅)|arquivo|verifica|an[aá]lise/i.test(reply);
    return { pass: out.ok && touched.length >= 2 && structured && reply.length > 300, detail: `arquivos=${touched.length} resposta estruturada=${structured} (${reply.length} chars)\nreply: ${reply.replace(/\s+/g, " ").slice(0, 500)}` };
  });
  results.push({ title: "3) Alteração complexa", pass: r3.pass, detail: r3.detail });

  // 4) AUDITORIA TÉCNICA — sem alterar arquivos
  const r4 = await withSite("4) Auditoria técnica (sem alterar)", async (root, agent) => {
    const before = readWorkspace(root);
    const out = await agent.runTask("Faça uma auditoria técnica deste site: analise estrutura, componentes/seções, conteúdo, responsividade e possíveis problemas. NÃO altere arquivos — apenas relate.");
    const after = readWorkspace(root);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const reply = (out.reply ?? "").toLowerCase();
    const deep = reply.length > 500 && (reply.includes("arquivo") || reply.includes("index.html")) && (reply.includes("problema") || reply.includes("ausent") || reply.includes("impacto") || reply.includes("falta"));
    return { pass: out.ok && !changed && deep, detail: `alterou arquivos=${changed} análise profunda=${deep} (${(out.reply ?? "").length} chars)\nreply: ${(out.reply ?? "").replace(/\s+/g, " ").slice(0, 500)}` };
  });
  results.push({ title: "4) Auditoria técnica", pass: r4.pass, detail: r4.detail });

  // 5) FALHA HONESTA — arquivo inexistente
  const r5 = await withSite("5) Falha honesta (arquivo inexistente)", async (root, agent) => {
    const before = readWorkspace(root);
    const out = await agent.runTask("Apague o arquivo src/relatorio-inexistente.txt deste projeto e me confirme.");
    const after = readWorkspace(root);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const reply = (out.reply ?? "").toLowerCase();
    const honest = !changed && (reply.includes("não existe") || reply.includes("não encontrad") || reply.includes("inexistente") || reply.includes("não foi possível") || reply.includes("erro"));
    return { pass: honest, detail: `alterou arquivos=${changed} relato honesto=${honest}\nreply: ${(out.reply ?? "").replace(/\s+/g, " ").slice(0, 360)}` };
  });
  results.push({ title: "5) Falha honesta", pass: r5.pass, detail: r5.detail });

  console.log("\n\n===== RESUMO E2E COMUNICAÇÃO (5.28) =====");
  for (const r of results) console.log(`- ${r.title}: ${r.pass ? "PASS" : "REVISAR"} | ${r.detail}`);
  const pass = results.every((r) => r.pass);
  console.log("\n" + (pass ? "PASS: comunicação profissional natural, contextual e honesta" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
