// Teste 5.18 — compreensão de código no chat do editor:
// P1: "qual classe controla o título?" (sem alterar); P2: "aumente só o tamanho".
import { cleanupWorkspace, type FileMap } from "../src/workspace";

const FILES: FileMap = {
  "index.html": `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Oficina do João</title></head><body><h1 class="hero-title">Troca de óleo e revisão</h1><a class="btn-cta" href="#">Orçar</a></body></html>`,
  "src/site.css": `.hero-title{font-size:38px;color:#111827}.btn-cta{background:#ea580c;color:#fff;padding:10px 22px;border-radius:8px}`,
  "src/site.json": JSON.stringify({ business: { name: "Oficina do João", segment: "Automotivo", city: "Suzano", state: "SP" } }),
};

interface RunResponse {
  status: string; reply?: string; changed?: boolean; touched?: string[];
  files?: Record<string, string>; resumed_session?: boolean; activity?: Array<{ phase: string; detail: string }>;
}

async function postRun(instruction: string, files: Record<string, string>): Promise<RunResponse> {
  const res = await fetch("http://127.0.0.1:8787/run", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, projectId: "session-oficina", files, context: { name: "Oficina do João", segment: "Automotivo", city: "Suzano", state: "SP" } }),
  });
  return res.json() as Promise<RunResponse>;
}

async function main() {
  cleanupWorkspace("session-oficina");
  // P1 — pergunta, sem alteração
  console.log("=== P1: qual classe controla o título? ===");
  const p1 = await postRun("Qual arquivo e qual classe CSS controlam o estilo do título principal? NÃO altere nada, apenas responda com base no código.", { ...FILES });
  console.log("changed:", p1.changed, "| activity:", JSON.stringify((p1.activity ?? []).slice(0, 4)));
  console.log("reply:", (p1.reply ?? "").slice(0, 260));

  // P2 — aumenta só o título (usa o conhecimento da P1)
  const files2 = p1.files ?? FILES;
  console.log("\n=== P2: aumente só o tamanho do título ===");
  const p2 = await postRun("Aumente somente o tamanho da fonte do título principal para 48px (a classe .hero-title). Não altere mais nada.", files2);
  console.log("changed:", p2.changed, "| touched:", JSON.stringify(p2.touched ?? []));
  console.log("activity:", JSON.stringify((p2.activity ?? []).slice(0, 8)));
  console.log("reply:", (p2.reply ?? "").slice(0, 220));

  const cssAfter = String(p2.files?.["src/site.css"] ?? "");
  const has48 = /font-size:\s*48px/.test(cssAfter);
  const onlyTitle = /\.btn-cta/.test(cssAfter);
  cleanupWorkspace("session-oficina");

  const pass = p1.changed === false && has48 && onlyTitle;
  console.log("\n" + (pass ? "PASS: agente entendeu o código e alterou apenas o alvo" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
