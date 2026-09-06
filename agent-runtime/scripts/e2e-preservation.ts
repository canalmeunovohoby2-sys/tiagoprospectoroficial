// E2E 5.30 — EDITAR ≠ RECONSTRUIR: preservação do site em edições.
// Roda 8 cenários num site pronto e rico, verificando que o agente edita de
// forma incremental, preserva o restante e (quando aplicável) é impedido de
// finalizar com regressão pelo Regression Guard.
import { ensureWorkspaceDir, readWorkspace, cleanupWorkspace, type FileMap } from "../src/workspace";
import { ProspectorSiteAgent } from "../src/prospector-site-agent";
import { siteMetrics } from "../../supabase/functions/_shared/regression-guard";

const BUSINESS = { name: "Pet Shop Amigo Fiel", segment: "Pet Shop", city: "Belo Horizonte", state: "MG", whatsapp: "5531999999999", phone: "(31) 99999-9999", address: "Rua dos Pássaros, 45" };

function makeSite(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pet Shop Amigo Fiel</title><link rel="stylesheet" href="src/site.css"/></head>
<body>
<header>
  <nav class="menu"><a href="#inicio">Início</a><a href="#servicos">Serviços</a><a href="#contato">Contato</a></nav>
</header>
<main>
<section class="hero" id="inicio">
  <h1>Pet Shop Amigo Fiel</h1>
  <p class="hero-txt">Banho, tosa e cuidados para o seu pet com carinho de verdade.</p>
  <img class="hero-img" src="https://images.unsplash.com/photo-1518791841217-8f162f1e1131" alt="cachorro feliz no pet shop"/>
  <a class="cta" href="#contato">Agendar horário</a>
</section>
<section id="servicos">
  <h2>Serviços</h2>
  <div class="cards">
    <article class="card"><h3>Banho & tosa</h3><p>Higiene completa e tosa na medida.</p><img src="https://images.unsplash.com/photo-1548199973-03cce0bbc87b" alt="banho"/></article>
    <article class="card"><h3>Hidratação</h3><p>Pelagem macia e saudável.</p><img src="https://images.unsplash.com/photo-1583337130417-3346a1be7dee" alt="dog"/></article>
    <article class="card"><h3>Day care</h3><p>Diversão monitorada enquanto você trabalha.</p><img src="https://images.unsplash.com/photo-1450778869180-41d0601e046e" alt="dog2"/></article>
  </div>
</section>
<section id="contato">
  <h2>Contato</h2>
  <p>Rua dos Pássaros, 45 · (31) 99999-9999</p>
  <a class="cta" href="https://wa.me/5531999999999">Chamar no WhatsApp</a>
</section>
</main>
<footer class="rodape"><p>© Pet Shop Amigo Fiel · petshop@amigofiel.com</p></footer>
<script src="src/main.js"></script>
</body></html>`,
    "src/site.css": `.hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:48px 24px;background:#0f766e;color:#fff;align-items:center}
.cta{background:#f59e0b;color:#111;padding:12px 22px;display:inline-block;text-decoration:none;border-radius:10px;font-weight:700}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;padding:32px 24px}
.card{border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#fff}
.card img{width:100%;height:150px;object-fit:cover;border-radius:8px}
.menu a{color:#0f172a;text-decoration:none;margin-right:14px}
.rodape{background:#0f172a;color:#cbd5e1;padding:20px 24px}
@media(max-width:900px){.cards{grid-template-columns:1fr 1fr}.hero{grid-template-columns:1fr}}
@media(max-width:600px){.cards{grid-template-columns:1fr}.menu{display:flex;flex-direction:column}}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}`,
    "src/main.js": `document.querySelectorAll(".card").forEach((c)=>{c.addEventListener("mouseenter",()=>{c.style.boxShadow="0 8px 24px rgba(15,23,42,.12)"})});`,
    "src/site.json": JSON.stringify({ business: BUSINESS }),
  };
}

const IMG_SET = new Set(["photo-1518791841217-8f162f1e1131", "photo-1548199973-03cce0bbc87b", "photo-1583337130417-3346a1be7dee", "photo-1450778869180-41d0601e046e"]);
const SENTINELS = ["Pet Shop Amigo Fiel", "Chamar no WhatsApp", "Rua dos Pássaros", "Day care", "Hidratação", "Agendar horário"];

interface Scenario {
  title: string;
  instruction: string;
  check: (before: FileMap, after: FileMap, out: { ok: boolean; finishSkips?: number }) => { pass: boolean; detail: string };
}

const SCENARIOS: Scenario[] = [
  {
    title: "1) Alteração pequena no hero",
    instruction: "Troque o texto do parágrafo do hero (.hero-txt) para: 'Pet shop com banho premiado e tosa por assinatura.'",
    check: (b, a) => {
      const hb = b[Object.keys(b).find((k) => k.endsWith("index.html")) ?? ""] ?? "";
      const ha = a[Object.keys(a).find((k) => k.endsWith("index.html")) ?? ""] ?? "";
      const mb = siteMetrics(b); const ma = siteMetrics(a);
      const textOk = ha.includes("banho premiado e tosa por assinatura");
      const pass = textOk && ma.imgTags >= mb.imgTags && ma.navLinks >= 3 && ma.hasFooter && mb.sections === ma.sections;
      return { pass, detail: `texto aplicado=${textOk} imgs ${mb.imgTags}→${ma.imgTags} nav ${mb.navLinks}→${ma.navLinks} footer=${ma.hasFooter}` };
    },
  },
  {
    title: "2) Alteração de cores",
    instruction: "Mude a cor de fundo do CTA (.cta) para #7c3aed e o texto para branco.",
    check: (b, a) => {
      const cssA = a["src/site.css"] ?? Object.values(a).find((v) => v.includes(".cta")) ?? "";
      const cssB = b["src/site.css"] ?? "";
      const mb = siteMetrics(b); const ma = siteMetrics(a);
      const pass = cssA.includes("#7c3aed") && ma.imgTags >= mb.imgTags && ma.navLinks >= 3 && ma.hasFooter;
      return { pass, detail: `cor aplicada=${cssA.includes("#7c3aed")} imgs ${mb.imgTags}→${ma.imgTags} nav ${mb.navLinks}→${ma.navLinks}` };
    },
  },
  {
    title: "3) Adição de efeito/animação",
    instruction: "Adicione uma animação suave de 'pulso' nos botões .cta (box-shadow pulsante com @keyframes), sem alterar mais nada.",
    check: (b, a) => {
      const allA = Object.values(a).join("\n"); const allB = Object.values(b).join("\n");
      const mb = siteMetrics(b); const ma = siteMetrics(a);
      const pass = (allA.match(/@keyframes/gi) ?? []).length > (allB.match(/@keyframes/gi) ?? []).length && ma.imgTags >= mb.imgTags && ma.navLinks >= 3;
      return { pass, detail: `keyframes ${(allB.match(/@keyframes/gi) ?? []).length}→${(allA.match(/@keyframes/gi) ?? []).length} imgs=${ma.imgTags} nav=${ma.navLinks}` };
    },
  },
  {
    title: "4) Alteração de uma seção",
    instruction: "Na seção de serviços, renomeie o título para 'O que oferecemos' e o primeiro card para 'Banho completo premium'.",
    check: (b, a) => {
      const ha = Object.values(a).find((v) => v.includes("<!doctype")) ?? "";
      const pass = ha.includes("O que oferecemos") && ha.includes("Banho completo premium") && SENTINELS.filter((s) => s !== "Banho & tosa").every((s) => ha.includes(s));
      return { pass, detail: `título novo=${ha.includes("O que oferecemos")} demais sentinelas preservadas=${SENTINELS.filter((s) => s !== "Banho & tosa").every((s) => ha.includes(s))}` };
    },
  },
  {
    title: "5) Pesquisa + melhoria (escopo limitado)",
    instruction: "Com base em referências de pet shops premium, melhore APENAS o hero e o CTA, mantendo todo o restante do site exatamente como está.",
    check: (b, a) => {
      const ha = Object.values(a).find((v) => v.includes("<!doctype")) ?? "";
      const mb = siteMetrics(b); const ma = siteMetrics(a);
      const sent = ["Day care", "Hidratação", "Chamar no WhatsApp", "Rua dos Pássaros"].every((s) => ha.includes(s));
      const pass = sent && ma.imgTags >= mb.imgTags && ma.navLinks >= 3 && ma.hasFooter;
      return { pass, detail: `restante preservado=${sent} imgs=${ma.imgTags} nav=${ma.navLinks} footer=${ma.hasFooter}` };
    },
  },
  {
    title: "6) Múltiplos arquivos",
    instruction: "Adicione um botão de menu hambúrguer para mobile que abre/fecha a navegação (use HTML, CSS e JS). Mantenha tudo o resto.",
    check: (b, a) => {
      const touched = Object.keys(a).filter((k) => b[k] !== a[k]);
      const ha = Object.values(a).find((v) => v.includes("<!doctype")) ?? "";
      const pass = touched.length >= 2 && ha.includes("hamb") && ha.includes("menu") && ha.includes("Day care") && ha.includes("Hidratação");
      return { pass, detail: `arquivos=${touched.join(",")} hambúrguer=${ha.includes("hamb")}` };
    },
  },
  {
    title: "7) Pedido que NÃO deve alterar o resto",
    instruction: "Adicione um pequeno selo 'Entrega rápida' na seção de contato, sem tocar em mais nada.",
    check: (b, a) => {
      const ha = Object.values(a).find((v) => v.includes("<!doctype")) ?? "";
      const mb = siteMetrics(b); const ma = siteMetrics(a);
      const restOk = SENTINELS.every((s) => ha.includes(s)) && ma.imgTags >= mb.imgTags && ma.navLinks >= 3 && ma.hasFooter;
      const changedFiles = Object.keys(a).filter((k) => b[k] !== a[k]);
      const pass = ha.includes("Entrega rápida") && restOk && changedFiles.length <= 2;
      return { pass, detail: `selo=${ha.includes("Entrega rápida")} restante ok=${restOk} arquivos=${changedFiles.join(",")}` };
    },
  },
  {
    title: "8) Reescrita agressiva sem regressão",
    instruction: "Reescreva o index.html inteiro deixando o código mais moderno, PORÉM mantendo TODAS as seções, textos, imagens, navegação, CTAs e rodapé existentes — só melhore estrutura e estilo (não remova nada).",
    check: (b, a, out) => {
      const ha = Object.values(a).find((v) => v.includes("<!doctype")) ?? "";
      const mb = siteMetrics(b); const ma = siteMetrics(a);
      const restOk = SENTINELS.every((s) => ha.includes(s)) && ma.imgTags >= mb.imgTags && ma.navLinks >= 3 && ma.hasFooter && ma.mediaQueries >= 1 && ma.hasH1;
      const detail = `ok=${out.ok} guard detectou? finishSkips=${out.finishSkips ?? 0} restante preservado=${restOk} imgs ${mb.imgTags}→${ma.imgTags}`;
      return { pass: out.ok && restOk, detail };
    },
  },
];

async function runScenario(s: Scenario): Promise<{ pass: boolean; detail: string }> {
  const pid = `pres-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const root = ensureWorkspaceDir(pid, makeSite());
  const agent = new ProspectorSiteAgent({
    workspaceRoot: root,
    business: BUSINESS,
    maxIterations: 40,
    initialFiles: makeSite(),
    enableBrowser: false,
    mode: "edit",
  });
  const before = readWorkspace(root);
  const out = await agent.runTask(s.instruction);
  const after = readWorkspace(root);
  cleanupWorkspace(pid);
  const r = s.check(before, after, out);
  console.log(`\n[${s.title}] ok=${out.ok} | ${r.detail}`);
  return r;
}

async function main() {
  console.log("===== E2E PRESERVAÇÃO — EDITAR ≠ RECONSTRUIR (5.30) =====");
  let allPass = true;
  for (const s of SCENARIOS) {
    try {
      const r = await runScenario(s);
      allPass = allPass && r.pass;
      if (!r.pass) console.log("  ✗ REVISAR:", r.detail);
    } catch (e) {
      allPass = false;
      console.log("  ✗ ERRO:", e instanceof Error ? e.message : String(e));
    }
  }
  console.log("\n" + (allPass ? "PASS: o agente edita de forma incremental e preserva o site (Regression Guard ativo)" : "REVISAR"));
  process.exit(allPass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
