// E2E 5.28 — Depth/Work Protocol: o agente NÃO pode finalizar solicitações
// amplas com "mínimo esforço". Para cada prompt amplo real
// ("deixe o site premium", "melhore o mobile", "melhore esse site") valida:
//  - inspecionou o estado ANTES da primeira alteração (entendeu o projeto);
//  - executou MÚLTIPLAS ações reais (não uma alteração superficial);
//  - verificou o resultado DEPOIS da última alteração (browser/releitura);
//  - concluiu com evidência (nenhuma mudança fictícia).
// Usa o MESMO ProspectorSiteAgent, browser, Gemini Vision e Completion Guard.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { computeWorkEvidence } from "../src/work-evidence";

const BUSINESS = { name: "Bistrô Aurora", segment: "Restaurante", city: "Campinas", state: "SP", whatsapp: "5519999999999", phone: "(19) 99999-9999", address: "Rua das Flores, 123" };

// Site real, mas "datado": problemas claros em html/css/js que um upgrade
// premium/mobile/site exige transformar em MAIS DE UM arquivo (não é superficial).
const FILES: FileMap = {
  "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Bistrô Aurora</title>
  <link rel="stylesheet" href="src/site.css"/>
</head>
<body>
  <header class="topo">
    <div class="caixa">
      <span class="marca">Bistrô Aurora</span>
      <nav><a href="#inicio">Início</a><a href="#cardapio">Cardápio</a><a href="#contato">Contato</a></nav>
    </div>
  </header>
  <section class="hero" id="inicio">
    <div class="caixa">
      <h1>Bistrô Aurora</h1>
      <p>Comida feita com afeto, ingredientes frescos e um cardápio que muda com as estações.</p>
      <a class="cta" href="#cardapio">Ver cardápio</a>
    </div>
  </section>
  <section id="cardapio">
    <div class="caixa">
      <h2>Cardápio</h2>
      <div class="linha">
        <div class="prato"><h3>Menu executivo</h3><p>Entrada, prato principal e sobremesa.</p></div>
        <div class="prato"><h3>Degustação</h3><p>Cinco tempos harmonizados pelo chef.</p></div>
        <div class="prato"><h3>Brunch de fim de semana</h3><p>Das 9h às 13h, com opções vegetarianas.</p></div>
      </div>
    </div>
  </section>
  <section id="contato">
    <div class="caixa">
      <h2>Reservas</h2>
      <p>Faça sua reserva pelo WhatsApp.</p>
      <a class="cta" href="https://wa.me/5519999999999">Reservar mesa</a>
      <p class="endereco">Rua das Flores, 123 · Campinas/SP</p>
    </div>
  </section>
  <footer><div class="caixa"><p>© Bistrô Aurora</p></div></footer>
  <script src="src/main.js"></script>
</body>
</html>`,
  "src/site.css": `.caixa{width:1100px;margin:0 auto;padding:0 15px}
body{font-family:Arial;margin:0;color:#333}
.topo{background:#ddd;padding:12px 0}
.marca{font-weight:bold}
nav a{color:#333;margin-left:12px}
.hero{background:#ccc;text-align:center;padding:60px 0}
.cta{display:inline-block;background:#777;color:#fff;padding:10px 18px;text-decoration:none;margin-top:10px}
.linha{display:flex;gap:20px}
.prato{border:1px solid #ccc;padding:16px;flex:1;background:#f4f4f4}
footer{background:#ddd;padding:20px 0;text-align:center}`,
  "src/main.js": `console.log("Bistrô Aurora pronto");`,
  "src/site.json": JSON.stringify({ business: BUSINESS }),
};

interface RunAssert {
  prompt: string;
  ok: boolean;
  changed: boolean;
  inspectedBeforeEdit: boolean;
  verifiedAfterLastEdit: boolean;
  editActionCount: number;
  editedPaths: string[];
  error?: string;
}

async function runOnce(prompt: string, pid: string): Promise<RunAssert> {
  const root = ensureWorkspaceDir(pid, FILES);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: BUSINESS,
    maxIterations: 45,
    initialFiles: FILES,
    enableBrowser: true,
    mode: "edit",
  });
  console.log(`\n=== PROMPT: "${prompt}" ===`);
  const before = readWorkspace(root);
  const out = await agent.runTask(prompt);
  const after = readWorkspace(root);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  const work = computeWorkEvidence(out.events as unknown as Parameters<typeof computeWorkEvidence>[0]);
  const assert: RunAssert = {
    prompt,
    ok: out.ok,
    changed,
    inspectedBeforeEdit: work.inspectedBeforeEdit,
    verifiedAfterLastEdit: work.verifiedAfterLastEdit,
    editActionCount: work.editActionCount,
    editedPaths: work.editedPaths,
    error: out.error,
  };
  console.log("ok:", out.ok, "| error:", out.error ?? "—");
  console.log("changed real:", changed, "| finish_skips:", out.finishSkips, "| finish_blocked:", out.finishBlocked);
  console.log("inspecionou antes da 1ª alteração:", work.inspectedBeforeEdit);
  console.log("verificou após a última alteração:", work.verifiedAfterLastEdit);
  console.log("ações de alteração:", work.editActionCount, "| arquivos:", JSON.stringify(work.editedPaths));
  const toolNames = [...new Set(
    (out.events as unknown as Array<{ type?: string; toolName?: string; toolCall?: { toolName?: string } }>)
      .filter((e) => e.type === "tool-started")
      .map((e) => e.toolCall?.toolName ?? e.toolName ?? ""),
  )];
  console.log("tools:", JSON.stringify(toolNames.slice(0, 16)));
  cleanupWorkspace(pid);
  return assert;
}

async function main() {
  const results: RunAssert[] = [];
  results.push(await runOnce("Deixe o site premium — transforme em um trabalho de alto nível visual, como você faria para um cliente que pagou por isso.", "protocol-premium"));
  results.push(await runOnce("Melhore o mobile deste site: responsividade real, sem overflow horizontal, testando no navegador em desktop e mobile.", "protocol-mobile"));
  results.push(await runOnce("Melhore esse site de verdade: analise o estado atual, encontre os problemas e aplique as melhorias que fazem sentido para o negócio.", "protocol-site"));

  console.log("\n\n===== RESUMO E2E WORK PROTOCOL (5.28) =====");
  for (const r of results) {
    console.log(`- "${r.prompt.slice(0, 60)}": ok=${r.ok} changed=${r.changed} inspect=${r.inspectedBeforeEdit} verify=${r.verifiedAfterLastEdit} edits=${r.editActionCount} paths=${r.editedPaths.length}`);
  }
  const allOk = results.every((r) => r.ok && r.changed);
  const allInspected = results.every((r) => r.inspectedBeforeEdit);
  const allVerified = results.every((r) => r.verifiedAfterLastEdit);
  const noSuperficial = results.every((r) => r.editActionCount >= 2);
  console.log("\ntodas concluíram com evidência (ok + mudança real):", allOk);
  console.log("todas inspecionaram antes de alterar:", allInspected);
  console.log("todas verificaram depois da última alteração:", allVerified);
  console.log("nenhuma finalizou com alteração superficial (1 ação):", noSuperficial);

  const pass = allOk && allInspected && allVerified && noSuperficial;
  console.log("\n" + (pass ? "PASS: pedidos amplos exigem trabalho real (inspecionar → executar múltiplas ações → verificar) antes de finalizar" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
