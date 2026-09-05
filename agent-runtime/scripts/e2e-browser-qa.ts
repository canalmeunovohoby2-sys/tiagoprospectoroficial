// E2E 5.20 — o Cline usa browser para detectar problemas, corrige o código e
// revalida. Verifica DOM/console/overflow reais e correção autônoma.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

const FILES: FileMap = {
  "index.html": `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Barbearia do Zé</title>
<style>
*{box-sizing:border-box;margin:0}
body{font-family:sans-serif}
.hero{padding:60px 20px;width:1200px;background:#eee} /* largura fixa -> overflow no mobile */
h1{font-size:30px}
.cta{background:#111;color:#fff;padding:12px 20px;border-radius:6px}
</style>
</head>
<body>
<section class="hero"><h1>Barbearia do Zé</h1><p>Corte e barba.</p><a class="cta" href="#agendar">Agendar</a></section>
<section id="contato"><h2>Contato</h2><a href="https://wa.me/5511999999999">WhatsApp</a></section>
<img src="https://img.invalid/quebrada.jpg" alt="foto" />
<script>console.error("erro-js-barbearia");</script>
</body>
</html>`,
  "src/site.css": ".hero{background:#f1f5f9}",
};

async function main() {
  const pid = "browser-qa-barbearia";
  const root = ensureWorkspaceDir(pid, FILES);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Barbearia do Zé", segment: "Barbearia", city: "São Paulo", state: "SP", whatsapp: "5511999999999" },
    maxIterations: 40,
    initialFiles: FILES,
    enableBrowser: true,
  });
  const activity: string[] = [];
  agent.subscribe((e) => {
    const ev = e as { type: string; toolCall?: { toolName?: string } };
    if (ev.type === "tool-started" && ev.toolCall?.toolName) {
      activity.push(ev.toolCall.toolName);
    }
  });

  console.log("=== E2E browser QA: detectar → corrigir → revalidar ===");
  const out = await agent.runTask(`Valide este site no navegador e corrija os problemas reais que encontrar:
1. Abra o site (browser_open) e inspecione (browser_inspect, browser_console, browser_links).
2. Teste também o mobile (browser_set_viewport mobile + browser_inspect) para checar overflow horizontal.
3. Corrija o que encontrar (anchor #agendar inexistente, imagem quebrada, erro de console, overflow no mobile) editando o código.
4. Revalide com browser_reload até confirmar que não há overflow horizontal, erro de console, anchor quebrado ou imagem com erro sob seu controle.
Não invente dados; preserve a marca e o WhatsApp.`);

  const files = out.files;
  const html = String(files[Object.keys(files).find((n) => n.endsWith("index.html")) ?? ""] ?? "");
  console.log("ok:", out.ok, "| error:", out.error ?? "—");
  console.log("touched:", JSON.stringify(out.touched));
  console.log("activity (resumo):", JSON.stringify([...new Set(activity)].slice(0, 12)));
  console.log("reply:", (out.reply ?? "").slice(0, 400));

  const anchorFixed = !html.includes('href="#agendar"') || html.includes('id="agendar"');
  const imgFixed = !html.includes("img.invalid");
  const consoleFixed = !html.includes("erro-js-barbearia");
  const cssOverflowFixed = !/width:\s*1200px/.test(html);
  console.log("\nanchor #agendar resolvido:", anchorFixed);
  console.log("imagem inválida removida:", imgFixed);
  console.log("erro de console removido:", consoleFixed);
  console.log("largura fixa 1200 removida (overflow):", cssOverflowFixed);

  cleanupWorkspace(pid);
  const pass = out.ok && (anchorFixed || imgFixed || consoleFixed || cssOverflowFixed);
  console.log("\n" + (pass ? "PASS: agente detectou e corrigiu problemas reais via browser" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
