// E2E 5.23 — ciclo visual completo: DeepSeek (executor) usa visual_review (Gemini)
// para detectar problema visual real, corrige o código e revalida.
import { ensureWorkspaceDir, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

// Página com problema visual PROPOSITAL: botão branco com texto branco, título branco c/ sombra sobre azul claro.
const FILES: FileMap = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Academia Power</title></head><body>
<section class="hero"><h1>Academia Power</h1><p>Musculação e aulas</p><a class="cta" href="https://wa.me/5511">Matricule-se</a></section>
</body></html>`,
  "src/site.css": `.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#cfe0ff;gap:16px;font-family:Arial;padding:24px;box-sizing:border-box}
h1{color:#ffffff;text-shadow:0 0 6px #000;font-size:64px;margin:0;text-align:center}
p{color:#ffffff;margin:0}
.cta{background:#ffffff;color:#ffffff;padding:24px 40px;border-radius:6px;text-decoration:none;font-size:22px}`,
  "src/site.json": JSON.stringify({ business: { name: "Academia Power", segment: "Academias", city: "SP", state: "SP" } }),
};

async function main() {
  const pid = "visual-cycle";
  const root = ensureWorkspaceDir(pid, FILES);
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Academia Power", segment: "Academias", city: "SP", state: "SP", whatsapp: "5511" },
    maxIterations: 45,
    initialFiles: FILES,
    enableBrowser: true,
    mode: "generate",
  });

  const tools: string[] = [];
  agent.subscribe((e) => {
    const ev = e as { type: string; toolCall?: { toolName?: string } };
    if (ev.type === "tool-started" && ev.toolCall?.toolName) tools.push(ev.toolCall.toolName);
  });

  console.log("=== ciclo: DeepSeek gera → visual_review (Gemini) → corrige ===");
  const out = await agent.runTask(`Crie/valide o site da Academia Power. Depois de criar, abra no navegador e chame visual_review para verificar a qualidade visual real. Se o Gemini apontar problemas (contraste, CTA, composição), corrija o CSS/HTML e faça visual_review novamente para confirmar. Preserve dados e responda em pt-BR.`);

  const html = String(out.files[Object.keys(out.files).find((k) => k.endsWith("index.html")) ?? ""] ?? "");
  const css = String(out.files[Object.keys(out.files).find((k) => k.endsWith("site.css")) ?? ""] ?? "");
  console.log("ok:", out.ok, "| error:", out.error ?? "—");
  console.log("tools usadas:", JSON.stringify([...new Set(tools)]));
  console.log("reply:", (out.reply ?? "").slice(0, 500));

  // Verifica se a correção aconteceu: texto claro não pode ficar sobre fundo claro sem contraste.
  const ctaColor = css.match(/\.cta[^{]*\{([^}]*)\}/)?.[1] ?? "";
  const ctaBg = ctaColor.match(/background:\s*(#[0-9a-fA-F]{3,6})/)?.[1] ?? "";
  const ctaFg = ctaColor.match(/color:\s*(#[0-9a-fA-F]{3,6})/)?.[1] ?? "";
  const ctaOk = !(ctaBg && ctaFg && ctaBg.toLowerCase() === ctaFg.toLowerCase());
  const h1Color = css.match(/h1[^{]*\{([^}]*)\}/)?.[1] ?? "";
  const h1Fg = h1Color.match(/color:\s*(#[0-9a-fA-F]{3,6})/)?.[1] ?? "";
  const h1Shadow = /text-shadow:\s*none|text-shadow:\s*0/.test(h1Color);
  console.log("\nCTA bg!=fg (corrigido):", ctaOk, "| h1 sem sombra pesada:", h1Shadow || !h1Fg);

  cleanupWorkspace(pid);
  const pass = out.ok && tools.includes("visual_review") && ctaOk;
  console.log("\n" + (pass ? "PASS: ciclo visual real (Gemini detectou → DeepSeek corrigiu)" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
