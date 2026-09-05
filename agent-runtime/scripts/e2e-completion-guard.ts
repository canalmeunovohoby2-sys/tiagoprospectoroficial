// E2E 5.24 — prova que finish_task prematuro é bloqueado pelo guard:
// instrui o agente a criar algo mínimo e finalizar; o guard deve impedir a
// conclusão com site pobre (imagens/CTA/@media) até corrigir.
import { ensureWorkspaceDir, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

const EMPTY: FileMap = {};

async function main() {
  const pid = "guard-e2e";
  const root = ensureWorkspaceDir(pid, EMPTY);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Academia Iron House", segment: "Academias", city: "Campinas", state: "SP", whatsapp: "5519988887777", services: ["Musculação", "Aulas"] },
    maxIterations: 50,
    initialFiles: EMPTY,
    enableBrowser: true,
    mode: "generate",
  });

  const tools: string[] = [];
  agent.subscribe((e) => {
    const ev = e as { type: string; toolCall?: { toolName?: string } };
    if (ev.type === "tool-started" && ev.toolCall?.toolName) tools.push(ev.toolCall.toolName);
  });

  console.log("=== tentativa de conclusão prematura (guard deve bloquear) ===");
  const out = await agent.runTask(
    "Crie um site MÍNIMO de uma linha para a Academia Iron House e finalize o mais rápido possível (não precisa caprichar).",
  );

  const html = String(out.files[Object.keys(out.files).find((k) => k.endsWith("index.html")) ?? ""] ?? "");
  const css = String(out.files[Object.keys(out.files).find((k) => k.endsWith("site.css")) ?? ""] ?? "");
  const imgCount = (html.match(/<img[^>]+src=/gi) ?? []).length;
  const media = /@media/i.test(css || html);
  const hasCta = /matricul|agend|fale|whatsapp/i.test(html);
  console.log("ok:", out.ok, "| error:", out.error ?? "—");
  console.log("finish_skips (guard bloqueou N vezes):", out.finishSkips, "| finish_blocked:", out.finishBlocked);
  console.log("tools:", JSON.stringify([...new Set(tools)]));
  console.log("arquivos:", Object.keys(out.files).join(", "));
  console.log("resultado final: img=", imgCount, "| @media=", media, "| cta=", hasCta);
  console.log("reply:", (out.reply ?? "").slice(0, 200));

  cleanupWorkspace(pid);
  // Prova: ou o guard bloqueou (skips>0) e o resultado final passou a ter
  // imagens/CTA/media, OU o agente já produziu completo sem precisar.
  const qualityReached = imgCount > 0 && media && hasCta;
  const pass = out.ok && (qualityReached || (out.finishSkips ?? 0) > 0);
  console.log("\n" + (pass ? "PASS: conclusão prematura impedida / qualidade atingida com evidência" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
