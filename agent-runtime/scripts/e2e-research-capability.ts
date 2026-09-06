// E2E 5.32 — capacidade REAL de pesquisa web (prova de não-simulação).
// Ambiente local SEM chaves Tavily → valida o caminho de INDISPONIBILIDADE:
//  • GERAR SITE continua e produz o site sem quebrar;
//  • EDIÇÃO que menciona pesquisa continua segura (sem reconstruir);
//  • nenhum evento/trace simula pesquisa (researchTrace vazio, zero web_search).
// Com chaves configuradas, o trace reporta cada web_search REALMENTE executada
// (a prova de execução vem dos tool-events + researchTrace, nunca do texto do
// modelo).
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { researchEnabled } from "../src/research";

const BUSINESS = { name: "Barbearia Navalha", segment: "Barbearia", city: "São Paulo", state: "SP", whatsapp: "5511911111111", phone: "(11) 91111-1111", address: "Rua Augusta, 1200" };

function hasWebSearchEvent(events: unknown[]): boolean {
  return (events ?? []).some((e) => {
    const ev = e as { type?: string; toolName?: string; toolCall?: { toolName?: string } };
    return ev?.type === "tool-started" && (ev.toolCall?.toolName ?? ev.toolName) === "web_search";
  });
}

async function main() {
  console.log("researchEnabled nesta instância:", researchEnabled(), "(sem chave → caminho indisponível)");
  const results: Array<{ title: string; pass: boolean; detail: string }> = [];

  // 1) GERAR SITE sem pesquisa disponível → fallback seguro + site completo
  {
    const pid = `research-gen-${Date.now()}`;
    const root = ensureWorkspaceDir(pid, {});
    const agent = new ProspectorSiteAgent({ workspaceRoot: root, business: BUSINESS, maxIterations: 50, mode: "generate", enableBrowser: false });
    const out = await agent.runTask(`Crie o site completo da ${BUSINESS.name} (${BUSINESS.segment}) em ${BUSINESS.city}: index.html completo, src/site.css, src/site.json com os dados reais fornecidos, hero + seções + footer + responsividade. Não invente dados.`);
    const files = readWorkspace(root);
    cleanupWorkspace(pid);
    const hasIndex = Object.keys(files).some((k) => k.endsWith("index.html"));
    const searched = hasWebSearchEvent(out.events as unknown[]);
    const pass = out.ok && hasIndex && (out.researchTrace ?? []).length === 0 && !searched;
    results.push({ title: "Geração sem pesquisa (fallback)", pass, detail: `ok=${out.ok} index=${hasIndex} researchTrace=${JSON.stringify(out.researchTrace ?? [])} web_search executado=${searched}` });
    console.log("gen ok:", out.ok, "| index:", hasIndex, "| researchTrace:", JSON.stringify(out.researchTrace ?? []));
  }

  // 2) EDIÇÃO que menciona pesquisa → sem reconstrução, sem pesquisa simulada
  {
    const site: FileMap = {
      "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Barbearia Navalha</title><link rel="stylesheet" href="src/site.css"/></head><body><nav><a>Início</a><a>Serviços</a><a>Contato</a></nav><section class="hero"><h1>Barbearia Navalha</h1><p>Texto rico e real sobre a barbearia para preencher esta página com conteúdo suficiente e relevante.</p><a class="cta" href="#">Agendar</a><img src="https://images.unsplash.com/photo-1622286342621-4bd786c2447c" alt="corte"/><img src="https://images.unsplash.com/photo-1605497788044-5a32c7078486" alt="barba"/><img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1" alt="barbeiro"/></section><section id="servicos"><h2>Serviços</h2><p>Conteúdo real da seção de serviços mantido nesta edição.</p></section><footer>© Barbearia Navalha</footer><script src="src/main.js"></script></body></html>`,
      "src/site.css": ".cta{background:#b45309;color:#fff;padding:12px 20px;border-radius:8px}@media(max-width:600px){.hero{width:100%}}",
      "src/main.js": `console.log("ok");`,
      "src/site.json": JSON.stringify({ business: BUSINESS }),
    };
    const pid = `research-edit-${Date.now()}`;
    const root = ensureWorkspaceDir(pid, site);
    const agent = new ProspectorSiteAgent({ workspaceRoot: root, business: BUSINESS, maxIterations: 40, initialFiles: site, enableBrowser: false, mode: "edit" });
    const before = readWorkspace(root);
    const out = await agent.runTask("Se houvesse pesquisa web disponível você pesquisaria boas práticas de CTA — mas sem pesquisa, apenas torne o botão .cta verde (#16a34a) com um leve hover, SEM reconstruir o site e sem alterar o restante.");
    const after = readWorkspace(root);
    cleanupWorkspace(pid);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const searched = hasWebSearchEvent(out.events as unknown[]);
    const green = Object.values(after).join("\n").includes("#16a34a");
    const stillRich = after["index.html"]?.includes("Serviços") && (after["index.html"]?.match(/<img/g) ?? []).length >= 3;
    const pass = out.ok && changed && green && stillRich && (out.researchTrace ?? []).length === 0 && !searched;
    results.push({ title: "Edição mencionando pesquisa (fallback)", pass, detail: `ok=${out.ok} mudou=${changed} cor=${green} preservou seções/imgs=${stillRich} web_search=${searched}` });
    console.log("edit ok:", out.ok, "| changed:", changed, "| cor:", green, "| preservou:", stillRich, "| web_search:", searched);
  }

  console.log("\n\n===== RESUMO E2E PESQUISA (5.32) =====");
  for (const r of results) console.log(`- ${r.title}: ${r.pass ? "PASS" : "REVISAR"} | ${r.detail}`);
  const pass = results.every((r) => r.pass);
  console.log("\n" + (pass ? "PASS: fallback seguro sem pesquisa simulada; trace só registra execução real" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
