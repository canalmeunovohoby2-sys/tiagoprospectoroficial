// E2E 5.24b — guard de evidência em EDIÇÃO: instrução de mudança deve gerar
// alteração real no arquivo. Se o agente tentar finalizar alegando sem ter
// mudado nada, o guard bloqueia (finish_skips>0) e força a edição real.
import { ensureWorkspaceDir, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

const SITE: FileMap = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Academia Iron</title></head><body>
<nav><a href="#inicio">Início</a><a href="#planos">Planos</a></nav>
<section class="hero" id="inicio"><h1>Academia Iron</h1><a class="cta" href="https://wa.me/5511">Matricule-se</a></section>
<footer>© Academia Iron</footer>
</body></html>`,
  "src/site.css": `.cta{background:#ccc;color:#999;padding:6px 10px}`, // botão fraco
  "src/site.json": JSON.stringify({ business: { name: "Academia Iron", segment: "Academias" } }),
};

async function main() {
  const pid = "guard-edit";
  const root = ensureWorkspaceDir(pid, SITE);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Academia Iron", segment: "Academias", city: "SP", state: "SP", whatsapp: "5511" },
    maxIterations: 40,
    initialFiles: SITE,
    enableBrowser: false, // edição simples não precisa de browser
    mode: "edit",
  });

  const tools: string[] = [];
  agent.subscribe((e) => {
    const ev = e as { type: string; toolCall?: { toolName?: string } };
    if (ev.type === "tool-started" && ev.toolCall?.toolName) tools.push(ev.toolCall.toolName);
  });

  console.log("=== edição: 'deixa o CTA de matrícula mais visível' ===");
  const out = await agent.runTask("Deixa o botão de matrícula (.cta) mais visível e com bom contraste no CSS. NÃO responda sem alterar de verdade.");

  const cssAfter = String(out.files["src/site.css"] ?? "");
  const ctaImproved = /\.cta[^{]*\{[^}]*background:\s*(#(?!ccc)|rgb\(2[0-9]|var\(--)/i.test(cssAfter) || !/background:#ccc/.test(cssAfter);
  console.log("ok:", out.ok, "| error:", out.error ?? "—");
  console.log("finish_skips:", out.finishSkips, "| finish_blocked:", out.finishBlocked);
  console.log("touched:", JSON.stringify(out.touched));
  console.log("tools:", JSON.stringify([...new Set(tools)]));
  console.log("css após:", cssAfter.replace(/\n/g, " ").slice(0, 220));
  console.log("CTA melhorado de verdade:", ctaImproved);

  cleanupWorkspace(pid);
  const pass = out.ok && ctaImproved && (out.touched?.length ?? 0) > 0;
  console.log("\n" + (pass ? "PASS: guard garantiu edição REAL (não aceitou 'feito' sem alterar)" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
