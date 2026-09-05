// Teste 5.18 — sessão persistente por projeto (Cline continue()):
// 1) "deixa o hero mais sofisticado"; 2) "agora deixa o CTA mais forte";
// 3) "não mexa no hero; melhore o footer". Verifica contexto entre mensagens.
import { resolveWorkspaceRoot, cleanupWorkspace, type FileMap } from "../src/workspace";

const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Clínica Sorriso Prime</title>
<style>
:root{--p:#0e7490;--bg:#f0fdfa;--on:#0f172a}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,sans-serif;background:var(--bg);color:var(--on)}
.container{max-width:1100px;margin:0 auto;padding:0 24px}
.topbar{padding:16px 0}.topbar .brand{font-weight:700;color:var(--p)}
.hero{padding:80px 0;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.hero h1{font-size:42px;color:#164e63;margin-bottom:14px}
.hero p{color:#475569;margin-bottom:22px}
.btn{display:inline-block;background:var(--p);color:#fff;padding:12px 26px;border-radius:999px;text-decoration:none}
.footer{border-top:1px solid #e2e8f0;padding:30px 0;color:#64748b;text-align:center}
</style>
</head>
<body>
<header class="topbar container"><a class="brand" href="#">Sorriso Prime</a></header>
<section class="hero container">
  <div><h1 class="hero-title">Odontologia com tecnologia e cuidado</h1><p class="hero-sub">Implantes, estética e clínica geral em Suzano.</p><a class="btn" href="https://wa.me/5511999999999">Agendar avaliação</a></div>
</section>
<section class="footer container"><p>© Clínica Sorriso Prime · Suzano/SP · (11) 99999-0000</p></section>
<script src="./src/main.js"></script>
</body>
</html>`;

const FILES: FileMap = {
  "index.html": html,
  "src/main.js": "document.addEventListener('DOMContentLoaded',()=>{console.log('ok')});",
  "src/site.json": JSON.stringify({ business: { name: "Clínica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP" } }),
};

interface RunResponse {
  status: string;
  reply?: string;
  error?: string;
  changed?: boolean;
  touched?: string[];
  files?: Record<string, string>;
  resumed_session?: boolean;
  events?: string[];
  activity?: Array<{ phase: string; detail: string }>;
}

async function postRun(instruction: string, files: Record<string, string>): Promise<RunResponse> {
  const res = await fetch("http://127.0.0.1:8787/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instruction,
      projectId: "session-sorriso",
      files,
      context: { name: "Clínica Sorriso Prime", segment: "Odontologia", city: "Suzano", state: "SP", whatsapp: "5511999999999" },
    }),
  });
  return res.json() as Promise<RunResponse>;
}

async function main() {
  cleanupWorkspace("session-sorriso");
  let files = { ...FILES };

  // Mensagem 1: hero mais sofisticado
  console.log("=== msg 1: hero mais sofisticado ===");
  const r1 = await postRun("Deixe o hero mais sofisticado e premium, mantendo nome e WhatsApp. Altere index.html e/ou o CSS necessário.", files);
  console.log("resumed:", r1.resumed_session, "| changed:", r1.changed, "| touched:", JSON.stringify(r1.touched ?? []));
  console.log("activity:", JSON.stringify((r1.activity ?? []).slice(0, 6)));
  console.log("reply:", (r1.reply ?? "").slice(0, 180));
  files = r1.files ?? files;

  // Mensagem 2: CTA mais forte (mesma sessão)
  console.log("\n=== msg 2: CTA mais forte ===");
  const r2 = await postRun("Agora deixe o CTA (botão de agendar) mais forte e visível, mantendo o restante.", files);
  console.log("resumed:", r2.resumed_session, "| changed:", r2.changed, "| touched:", JSON.stringify(r2.touched ?? []));
  console.log("reply:", (r2.reply ?? "").slice(0, 180));
  files = r2.files ?? files;

  // Mensagem 3: não mexa no hero, melhore o footer
  console.log("\n=== msg 3: footer (não mexa no hero) ===");
  const r3 = await postRun("Não altere o hero que você construiu. Melhore apenas o FOOTER para um visual profissional.", files);
  console.log("resumed:", r3.resumed_session, "| changed:", r3.changed, "| touched:", JSON.stringify(r3.touched ?? []));
  console.log("reply:", (r3.reply ?? "").slice(0, 200));

  cleanupWorkspace("session-sorriso");
  const pass = r1.resumed_session === false && r2.resumed_session === true && r3.resumed_session === true && r2.changed === true && r3.changed === true;
  console.log("\n" + (pass ? "PASS: sessão persistente + contexto preservado" : `REVISAR: ${JSON.stringify({ r1: r1.resumed_session, r2: r2.resumed_session, r3: r3.resumed_session })}`));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
