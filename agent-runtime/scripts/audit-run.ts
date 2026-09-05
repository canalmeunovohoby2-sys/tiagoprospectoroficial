// Auditoria 5.17 â€” testes controlados reais para distinguir coding agent de
// "IA superficial". Roda T1..T4 e imprime a sequÃªncia real de tools.
import { auditRun, summarizeTrace, type AuditTrace } from "./audit-harness";

const FILES = {
  "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ClÃ­nica Sorriso Prime</title>
<link rel="stylesheet" href="./src/site.css"/>
</head>
<body>
<header class="topbar"><a class="brand" href="#">Sorriso Prime</a></header>
<section class="hero" id="hero">
  <div class="hero-copy">
    <h1 class="hero-title">Odontologia com tecnologia e cuidado</h1>
    <p class="hero-sub">Implantes, estÃ©tica e clÃ­nica geral.</p>
    <a class="btn-hero" href="https://wa.me/5511999999999">Agendar</a>
  </div>
  <div class="hero-media"><div class="hero-photo">[foto]</div></div>
</section>
<script src="./src/main.js"></script>
</body>
</html>`,
  "src/site.css": `.topbar{padding:18px 0}.brand{font-weight:700;color:#0e7490}.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;padding:72px 0}.hero-title{font-size:44px;line-height:1.05;color:#164e63;margin-bottom:16px}.hero-sub{color:#475569;margin-bottom:24px}.btn-hero{background:#0e7490;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none}.hero-media{padding-top:8px}.hero-photo{background:#cffafe;border-radius:24px;height:280px}`,
  "src/main.js": `document.addEventListener("DOMContentLoaded", () => { console.log("sorriso-prime ready"); });`,
  "src/site.json": JSON.stringify({ business: { name: "ClÃ­nica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP", whatsapp: "5511999999999" } }),
};

const BIZ = { name: "ClÃ­nica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP", whatsapp: "5511999999999" };

const results: Array<{ label: string; t: AuditTrace }> = [];

// T1 â€” LEITURA (nÃ£o alterar): o agente deve listar/ler e DESCREVER o cÃ³digo real.
results.push({ label: "T1 leitura", t: await auditRun({
  projectId: "audit-sorriso", files: FILES, business: BIZ, label: "x",
  instruction: "Analise a estrutura deste projeto (site) e me diga como o hero estÃ¡ implementado: qual classe CSS controla o tÃ­tulo e qual arquivo contÃ©m a marcaÃ§Ã£o do hero. NÃ£o faÃ§a NENHUMA alteraÃ§Ã£o â€” apenas leia e responda com base no que encontrar nos arquivos.",
}) });

// T2 â€” EDIÃ‡ÃƒO com leitura obrigatÃ³ria (o comando forÃ§a read antes de editar).
results.push({ label: "T2 edicao com leitura", t: await auditRun({
  projectId: "audit-sorriso", files: FILES, business: BIZ, label: "x",
  instruction: "Mude o tÃ­tulo do hero (h1.hero-title) para 'ExperiÃªncia Premium em Odontologia'. ANTES de editar, leia o index.html e o site.css para localizar o trecho exato. Use edit_file (find/replace). Depois releia o arquivo para confirmar. NÃ£o invente outros dados.",
}) });

// T3 â€” MULTI-ARQUIVO coordenado: alterar HTML e CSS mantendo consistÃªncia.
results.push({ label: "T3 mult-arquivo", t: await auditRun({
  projectId: "audit-sorriso", files: FILES, business: BIZ, label: "x",
  instruction: "Deixe o hero mais sofisticado: no CSS, adicione um gradiente sutil de fundo na seÃ§Ã£o .hero e eleve o .hero-title para um tom mais premium; no HTML, adicione um badge .hero-badge com o texto 'Atendimento Premium'. Preserve nome e WhatsApp. Altere o que for necessÃ¡rio e confira se as classes continuam consistentes.",
}) });

// T4 â€” MEMÃ“RIA DE CONTEXTO entre mensagens: 1Âª identifica a classe, 2Âª edita sÃ³ ela.
results.push({ label: "T4a contexto (identifica classe)", t: await auditRun({
  projectId: "audit-sorriso2", files: FILES, business: BIZ,
  instruction: "Leia o cÃ³digo do hero e me diga qual classe CSS controla o tÃ­tulo do hero. NÃƒO altere nada.",
}) });
results.push({ label: "T4b contexto (aplica na classe da T4a)", t: await auditRun({
  projectId: "audit-sorriso2", files: FILES, business: BIZ,
  instruction: "Agora aumente SOMENTE o espaÃ§amento (margin-bottom) do tÃ­tulo do hero (a classe .hero-title). Altere apenas isso no site.css.",
}) });

for (const r of results) console.log(summarizeTrace(r.label, r.t));
console.log("\n===== DETALHE T2 (eventos) =====");
for (const e of results.find((r) => r.label === "T2 edicao com leitura")?.t.events ?? []) {
  if (e.type === "tool-started") console.log("  tool-started:", JSON.stringify(e).slice(0, 320));
}
console.log("\n===== DETALHE T3 (eventos) =====");
for (const e of results.find((r) => r.label === "T3 mult-arquivo")?.t.events ?? []) {
  if (e.type === "tool-started") console.log("  tool-started:", JSON.stringify(e).slice(0, 320));
}

