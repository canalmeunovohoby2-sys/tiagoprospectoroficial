// Trace REAL da geração: loga cada tool chamada (nome + path/args) e o fluxo.
import { cleanupWorkspace, ensureWorkspaceDir, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

async function main() {
  const pid = "acad-trace";
  cleanupWorkspace(pid);
  const files: FileMap = {};
  const root = ensureWorkspaceDir(pid, files);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Academia Corpo Forte", segment: "Academias", city: "Mogi das Cruzes", state: "SP", whatsapp: "5511944443333", services: ["Musculação", "Aulas coletivas"] },
    maxIterations: 60,
    initialFiles: files,
    mode: "generate",
    enableBrowser: true,
  });

  const trace: Array<{ type: string; tool?: string; path?: string; input?: unknown }> = [];
  agent.subscribe((event) => {
    const e = event as { type: string; toolCall?: { toolName?: string; input?: unknown }; message?: unknown };
    if (e.type === "tool-started" && e.toolCall?.toolName) {
      const input = (e.toolCall.input ?? {}) as { path?: string; name?: string };
      trace.push({ type: "tool", tool: e.toolCall.toolName, path: input?.path ?? input?.name });
    }
  });

  const t0 = Date.now();
  const out = await agent.runTask("Crie o site desta academia de alto padrão: landing page completa com hero forte, imagens de academia/musculação, seções, CTA de matrícula (WhatsApp), navegação, formulário se fizer sentido e rodapé profissional. Não invente dados além do contexto.", { continueSession: false });
  const ms = Date.now() - t0;
  console.log("ok:", out.ok, "| ms:", ms, "| reply:", (out.reply ?? "").slice(0, 200));
  console.log("\n=== TRACE (tools em ordem) ===");
  const grouped: Record<string, number> = {};
  for (const t of trace) {
    if (t.tool) {
      grouped[t.tool] = (grouped[t.tool] ?? 0) + 1;
      console.log(`  ${t.tool}${t.path ? ` → ${t.path}` : ""}`);
    }
  }
  console.log("\n=== resumo por ferramenta ===", JSON.stringify(grouped));
  cleanupWorkspace(pid);
}
main().catch((e) => { console.error(e); process.exit(1); });
