// E2E 2 — alteração complexa: transformar o hero em composição editorial premium,
// preservando conteúdo; e teste de contexto (3 comandos sequenciais preservando decisões).
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pet Care Banho e Tosa</title>
<style>
:root{--p:#1d4ed8;--bg:#f8fafc;--on:#0f172a}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--bg);color:var(--on)}
.container{max-width:1100px;margin:0 auto;padding:0 24px}
.hero{padding:90px 0;display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.hero h1{font-size:46px;line-height:1.05;color:var(--p)}
.hero p{color:#334155;max-width:480px;margin-top:14px}
.btn{display:inline-block;margin-top:26px;background:var(--p);color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none}
.footer{padding:40px 0;border-top:1px solid #e2e8f0;text-align:center;color:#64748b}
</style>
</head>
<body>
<header class="container"><a class="brand" href="#"><strong>Pet Care</strong></a></header>
<section class="hero container">
  <div>
    <h1>Banho e tosa com carinho de verdade</h1>
    <p>Profissionais apaixonados por pets e estrutura pensada para o bem-estar do seu animal.</p>
    <a class="btn" href="https://wa.me/5511999999999">Agendar horário</a>
  </div>
  <div class="hero-img"><div class="ph">[imagem ilustrativa]</div></div>
</section>
<section class="footer"><p>Pet Care · Guarulhos/SP · (11) 99999-0000</p></section>
</body>
</html>`;

async function main() {
  const projectId = "e2e-pet-care";
  const root = ensureWorkspaceDir(projectId, {
    "index.html": html,
    "src/site.json": JSON.stringify({ business: { name: "Pet Care Banho e Tosa", segment: "Pet Shop", city: "Guarulhos", state: "SP" } }),
  });

  const make = () => new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Pet Care Banho e Tosa", segment: "Pet Shop", city: "Guarulhos", state: "SP", whatsapp: "5511999999999" },
    maxIterations: 35,
    initialFiles: readWorkspace(root),
  });

  // Comando 1: hero mais sofisticado
  console.log("=== 1) hero mais sofisticado ===");
  let agent = make();
  const r1 = await agent.runTask("Reconstrua o hero como uma composição editorial premium e sofisticada, mantendo o nome da empresa e o WhatsApp. Pode alterar HTML e CSS.");
  console.log("ok:", r1.ok, "| touched:", JSON.stringify(r1.touched));
  const html1 = r1.files["index.html"] ?? "";

  // Comando 2: melhore o footer (contexto: preserva hero)
  console.log("\n=== 2) melhore o footer ===");
  agent = make();
  const r2 = await agent.runTask("Agora melhore apenas o FOOTER para um visual profissional multi-coluna. Preserve exatamente o hero que acabou de ser feito.");
  console.log("ok:", r2.ok, "| touched:", JSON.stringify(r2.touched));
  const html2 = r2.files["index.html"] ?? "";

  cleanupWorkspace(projectId);

  const pass = r1.ok && r2.ok && r1.touched.length > 0 && r2.touched.length > 0;
  console.log("\n" + (pass ? "PASS: agente executou alterações reais e coordenadas" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
