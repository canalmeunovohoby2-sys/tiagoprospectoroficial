// Auditoria 5.17 — testes controlados reais para distinguir coding agent de
// "IA superficial". Roda T1..T4 e imprime a sequência real de tools.
import { auditRun, summarizeTrace, type AuditTrace } from "./audit-harness";

const FILES = {
  "index.html": `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Clínica Sorriso Prime</title>
<link rel="stylesheet" href="./src/site.css"/>
</head>
<body>
<header class="topbar"><a class="brand" href="#">Sorriso Prime</a></header>
<section class="hero" id="hero">
  <div class="hero-copy">
    <h1 class="hero-title">Odontologia com tecnologia e cuidado</h1>
    <p class="hero-sub">Implantes, estética e clínica geral.</p>
    <a class="btn-hero" href="https://wa.me/5511999999999">Agendar</a>
  </div>
  <div class="hero-media"><div class="hero-photo">[foto]</div></div>
</section>
<script src="./src/main.js"></script>
</body>
</html>`,
  "src/site.css": `.topbar{padding:18px 0}.brand{font-weight:700;color:#0e7490}.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;padding:72px 0}.hero-title{font-size:44px;line-height:1.05;color:#164e63;margin-bottom:16px}.hero-sub{color:#475569;margin-bottom:24px}.btn-hero{background:#0e7490;color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none}.hero-media{padding-top:8px}.hero-photo{background:#cffafe;border-radius:24px;height:280px}`,
  "src/main.js": `document.addEventListener("DOMContentLoaded", () => { console.log("sorriso-prime ready"); });`,
  "src/site.json": JSON.stringify({ business: { name: "Clínica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP", whatsapp: "5511999999999" } }),
};

const BIZ = { name: "Clínica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP", whatsapp: "5511999999999" };

const results: Array<{ label: string; t: AuditTrace }> = [];

// T1 — LEITURA (não alterar): o agente deve listar/ler e DESCREVER o código real.
results.push({ label: "T1 leitura", t: await auditRun({
  projectId: "audit-sorriso", files: FILES, business: BIZ,
  instruction: "Analise a estrutura deste projeto (site) e me diga como o hero está implementado: qual classe CSS controla o título e qual arquivo contém a marcação do hero. Não faça NENHUMA alteração — apenas leia e responda com base no que encontrar nos arquivos.",
}) });

// T2 — EDIÇÃO com leitura obrigatória (o comando força read antes de editar).
results.push({ label: "T2 edicao com leitura", t: await auditRun({
  projectId: "audit-sorriso", files: FILES, business: BIZ,
  instruction: "Mude o título do hero (h1.hero-title) para 'Experiência Premium em Odontologia'. ANTES de editar, leia o index.html e o site.css para localizar o trecho exato. Use edit_file (find/replace). Depois releia o arquivo para confirmar. Não invente outros dados.",
}) });

// T3 — MULTI-ARQUIVO coordenado: alterar HTML e CSS mantendo consistência.
results.push({ label: "T3 mult-arquivo", t: await auditRun({
  projectId: "audit-sorriso", files: FILES, business: BIZ,
  instruction: "Deixe o hero mais sofisticado: no CSS, adicione um gradiente sutil de fundo na seção .hero e eleve o .hero-title para um tom mais premium; no HTML, adicione um badge .hero-badge com o texto 'Atendimento Premium'. Preserve nome e WhatsApp. Altere o que for necessário e confira se as classes continuam consistentes.",
}) });

// T4 — MEMÓRIA DE CONTEXTO entre mensagens: 1ª identifica a classe, 2ª edita só ela.
results.push({ label: "T4a contexto (identifica classe)", t: await auditRun({
  projectId: "audit-sorriso2", files: FILES, business: BIZ,
  instruction: "Leia o código do hero e me diga qual classe CSS controla o título do hero. NÃO altere nada.",
}) });
results.push({ label: "T4b contexto (aplica na classe da T4a)", t: await auditRun({
  projectId: "audit-sorriso2", files: FILES, business: BIZ,
  instruction: "Agora aumente SOMENTE o espaçamento (margin-bottom) do título do hero (a classe .hero-title). Altere apenas isso no site.css.",
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
