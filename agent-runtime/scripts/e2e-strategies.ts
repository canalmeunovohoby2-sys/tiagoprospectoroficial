// E2E 5.27 — Comandos Rápidos (Quick Strategies) com o MESMO Cline Agent.
// Executa cada MISSÃO profissional (analisar→decidir→executar→testar→criticar→
// corrigir→verificar) contra código REAL e valida evidência:
//  - analyze_site (somente leitura) NÃO altera nenhum arquivo.
//  - comandos de alteração modificam código de verdade (guard exige evidência).
//  - nenhum comando gera alterações fictícias (touched real por diff).
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { QUICK_STRATEGIES, buildStrategyInstruction } from "../../src/lib/siteStrategies";

const BUSINESS = { name: "Barbearia do Zé", segment: "Barbearia", city: "São Paulo", state: "SP", whatsapp: "5511999999999" };

const SITE: FileMap = {
  "index.html": `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Barbearia do Zé</title><link rel="stylesheet" href="src/site.css"/></head>
<body>
<nav><a href="#inicio">Início</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav>
<section class="hero" id="inicio">
  <h1>Barbearia do Zé</h1>
  <p>Cortes e barba no centro.</p>
  <a class="cta" href="#contato">Agendar</a>
</section>
<section class="servicos" id="servicos">
  <h2>Serviços</h2>
  <p>Corte, barba e combo.</p>
</section>
<section class="contato" id="contato">
  <h2>Contato</h2>
  <a href="https://wa.me/5511999999999">WhatsApp</a>
</section>
<footer>© Barbearia do Zé</footer>
</body></html>`,
  "src/site.css": `body{font-family:Georgia,serif;background:#fff;color:#333}
.hero{background:#eee;padding:30px;text-align:center}
.cta{display:inline-block;background:#ccc;color:#333;padding:6px 10px;text-decoration:none}
nav a{color:#333;margin-right:8px}
@media(max-width:640px){.hero{width:1100px}}`,
  "src/site.json": JSON.stringify({ business: BUSINESS }),
};

interface CommandResult {
  id: string;
  label: string;
  analyzeOnly: boolean;
  ok: boolean;
  /** Arquivos com conteúdo real diferente entre antes/depois DESTA execução. */
  touched: string[];
  changed: boolean;
  finishSkips: number;
  blocked: boolean;
  error?: string;
}

function diffFiles(before: FileMap, after: FileMap): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => before[k] !== after[k]).sort();
}

async function main() {
  const pid = "strategies-527";
  const root = ensureWorkspaceDir(pid, SITE);
  const results: CommandResult[] = [];

  for (const s of QUICK_STRATEGIES) {
    const label = `${s.emoji} ${s.label}`;
    console.log(`\n=== ${label}${s.analyzeOnly ? " (somente análise)" : ""} ===`);
    const agent = new ProspectorSiteAgent({
      workspaceRoot: root,
      business: BUSINESS,
      maxIterations: s.analyzeOnly ? 30 : 45,
      initialFiles: SITE,
      enableBrowser: false,
      mode: "edit",
    });
    const instruction = buildStrategyInstruction(s.id, { name: BUSINESS.name, segment: BUSINESS.segment });
    const before = readWorkspace(root);
    const out = await agent.runTask(instruction);
    const after = out.files;
    // Evidência real: diff do conteúdo ANTES/DEPOIS desta execução (independente
    // do touched interno do agente, que compara com os arquivos iniciais da run).
    const touched = diffFiles(before, after);
    const res: CommandResult = {
      id: s.id,
      label,
      analyzeOnly: s.analyzeOnly,
      ok: out.ok,
      touched,
      changed: touched.length > 0,
      finishSkips: out.finishSkips ?? 0,
      blocked: !!out.finishBlocked,
      error: out.error,
    };
    results.push(res);
    console.log("ok:", out.ok, "| error:", out.error ?? "—");
    console.log("arquivos alterados (diff antes/depois):", JSON.stringify(touched));
    console.log("changed real:", res.changed, "| finish_skips:", out.finishSkips, "| finish_blocked:", out.finishBlocked);
    console.log("reply (início):", (out.reply ?? "").replace(/\s+/g, " ").slice(0, 300));
  }

  cleanupWorkspace(pid);

  const analysis = results.find((r) => r.analyzeOnly)!;
  const changes = results.filter((r) => !r.analyzeOnly);
  const analysisPass = analysis.ok && !analysis.changed;
  const changesPass = changes.every((r) => r.ok && r.changed);
  const allCommandsRan = results.length === QUICK_STRATEGIES.length;

  console.log("\n\n===== RESUMO E2E ESTRATÉGIAS (5.27) =====");
  for (const r of results) {
    console.log(`- ${r.label}: ok=${r.ok} changed=${r.changed} arquivos=${r.touched.length} skips=${r.finishSkips} blocked=${r.blocked}`);
  }
  console.log(`\nanálise NÃO alterou arquivos (nenhuma mudança fictícia): ${analysisPass}`);
  console.log(`todos os ${changes.length} comandos de alteração modificaram código real: ${changesPass}`);
  console.log(`suíte completa (${QUICK_STRATEGIES.length} comandos): ${allCommandsRan}`);

  const pass = analysisPass && changesPass && allCommandsRan;
  console.log("\n" + (pass ? "PASS: comandos rápidos executam missões reais no Cline Agent" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
