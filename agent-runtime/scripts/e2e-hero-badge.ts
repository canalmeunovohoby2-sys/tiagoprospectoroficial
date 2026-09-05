// E2E funcional do ProspectorSiteAgent com o Cline SDK:
// cria um site estático simples, roda a instrução "adicione um selo visual
// 'Atendimento Premium' no hero" e verifica alteração REAL nos arquivos.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Clínica Sorriso Prime</title>
<style>
:root{--p:#0e7490;--bg:#f0fdfa;--on:#0f172a}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,sans-serif;background:var(--bg);color:var(--on)}
.container{max-width:1100px;margin:0 auto;padding:0 24px}
.hero{padding:90px 0}
.hero h1{font-size:44px;line-height:1.1;margin-bottom:16px;color:var(--p)}
.hero p{font-size:18px;color:#334155;max-width:560px}
.btn{display:inline-block;margin-top:24px;background:var(--p);color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none}
</style>
</head>
<body>
<header class="nav container"><a href="#" class="brand">Sorriso Prime</a></header>
<section class="hero">
  <div class="container">
    <h1>Odontologia de alto padrão em Suzano</h1>
    <p>Implantes, estética e atendimento humanizado para toda a família.</p>
    <a class="btn" href="https://wa.me/5511999999999">Agendar avaliação</a>
  </div>
</section>
<section class="services container"><h2>Nossos cuidados</h2><p>Clínica geral, estética e implantodontia.</p></section>
<script src="./src/main.js"></script>
</body>
</html>`;

const mainJs = `document.addEventListener("DOMContentLoaded", () => {
  console.log("sorriso-prime ok");
});`;

async function main() {
  const projectId = "e2e-sorriso-prime";
  const root = ensureWorkspaceDir(projectId, {
    "index.html": html,
    "src/site.css": `/* estilos base (inline no index.html) */`,
    "src/main.js": mainJs,
    "src/site.json": JSON.stringify({ business: { name: "Clínica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP" } }),
  });

  console.log("workspace em", root);

  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: { name: "Clínica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP", whatsapp: "5511999999999" },
    maxIterations: 30,
    initialFiles: readWorkspace(root),
  });

  const events: string[] = [];
  agent.subscribe((e) => events.push(e.type));

  console.log("\n=== rodando agente (Cline SDK + DeepSeek)… ===");
  const t0 = Date.now();
  const out = await agent.runTask("Adicione um selo visual .hero-badge com o texto 'Atendimento Premium' no hero do site (na seção .hero do index.html) e o CSS correspondente (gradiente suave, cantos arredondados). Não invente outros dados da empresa.");
  const ms = Date.now() - t0;
  console.log(`tempo: ${(ms / 1000).toFixed(1)}s`);
  console.log("ok:", out.ok);
  console.log("error:", out.error ?? "—");
  console.log("reply:", out.reply.slice(0, 400));
  console.log("touched:", JSON.stringify(out.touched));
  console.log("events:", JSON.stringify([...new Set(events)].slice(0, 20)));

  const after = out.files;
  const htmlAfter = after["index.html"] ?? "";
  const hasBadge = htmlAfter.includes("hero-badge");
  const hasPremium = /Atendimento Premium/i.test(htmlAfter);

  console.log("\nhtml contém .hero-badge:", hasBadge);
  console.log("html contém 'Atendimento Premium':", hasPremium);

  cleanupWorkspace(projectId);

  const pass = out.ok && hasBadge && hasPremium && out.touched.length > 0;
  console.log("\n" + (pass ? "PASS: agente editou os arquivos reais do site" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
