// TESTE 5.19 — geração inicial real pelo Cline (/generate) + continuidade (/run).
// Lead com dados PARCIAIS (sem horários/avaliações/especialidades) para verificar
// que o agente não inventa; depois edita na mesma sessão.
import { cleanupWorkspace } from "../src/workspace";

interface GenResponse {
  status: string; reply?: string; error?: string; changed?: boolean; touched?: string[];
  files?: Record<string, string>; runtime?: string; mode?: string; activity?: Array<{ phase: string; detail: string }>;
}

async function generate(projectId: string): Promise<GenResponse> {
  const res = await fetch("http://127.0.0.1:8787/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      context: {
        name: "Pet Shop Amigo Fiel", segment: "Pet Shop", city: "Guarulhos", state: "SP",
        phone: "(11) 98888-7777", whatsapp: "5511988887777",
        services: ["Banho e Tosa", "Hidratação", "Táxi Pet"],
      },
      briefing: { notas: "Cliente pediu tom acolhedor e confiável." },
    }),
  });
  return res.json() as Promise<GenResponse>;
}

async function runEdit(projectId: string, instruction: string, files: Record<string, string>): Promise<GenResponse> {
  const res = await fetch("http://127.0.0.1:8787/run", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, projectId, files, context: { name: "Pet Shop Amigo Fiel", segment: "Pet Shop", city: "Guarulhos", state: "SP" } }),
  });
  return res.json() as Promise<GenResponse>;
}

async function main() {
  const pid = "gen-pet-amigo";
  cleanupWorkspace(pid);

  console.log("=== TESTE 1: geração inicial (Cline /generate) ===");
  const g = await generate(pid);
  console.log("status:", g.status, "| runtime:", g.runtime, "| mode:", g.mode);
  console.log("activity (amostra):", JSON.stringify((g.activity ?? []).slice(0, 14)));
  console.log("reply:", (g.reply ?? "").slice(0, 260));
  if (g.status !== "ok" || !g.files) { console.log("geração falhou:", g.error); process.exit(1); }

  const names = Object.keys(g.files);
  console.log("\narquivos criados:", names.length, names.join(", "));
  const html = g.files[names.find((n) => n.endsWith("index.html")) ?? ""] ?? "";
  const css = g.files[names.find((n) => n.endsWith("site.css")) ?? ""] ?? "";
  console.log("html bytes:", html.length, "| css bytes:", css.length);
  console.log("contém empresa:", html.includes("Amigo Fiel"));
  console.log("tem media query:", /@media/.test(css || html));
  console.log("tem footer completo (tagline/nav):", /footer/i.test(html));

  // TESTE 5: não inventar horários/avaliações (contexto não forneceu)
  // Regex precisos: horário HH:MM ou "Xh às Yh"; "seg a sex/dom"; avaliações explícitas.
  const inventedHours = /([01]?\d|2[0-3]):[0-5]\d|\b\d{1,2}\s*h\s*(?:as|h)\b|seg(?:unda)?\s*(?:a|à|ao|as)\s*(?:sex|sab|dom)|atendemos\s+(?:de|das)/i.test(html);
  const inventedReviews = /[45],\s*[05]\s*(?:estrelas?|stars?)|\bavalia[cç][oõ]es?\b|\b\d+\s*(?:clientes|pacientes)\s+felizes\b/i.test(html);
  console.log("não inventou horários:", !inventedHours, "| não inventou avaliações:", !inventedReviews);

  // TESTE 3: continuidade — edita na mesma sessão (hero → footer preservando hero)
  console.log("\n=== TESTE 3: continuidade (hero → footer) ===");
  const heroOf = (h: string) => {
    const m = h.match(/<section[^>]*class="[^"]*hero[^"]*"[^>]*>[\s\S]*?<\/section>/i);
    return m ? m[0].slice(0, 3000) : h.slice(0, 1500);
  };
  const e1 = await runEdit(pid, "Deixe o hero mais sofisticado, mantendo os dados.", g.files);
  const files2 = e1.files ?? g.files;
  console.log("edit hero changed:", e1.changed, "| resumed:", (e1 as { resumed_session?: boolean }).resumed_session);

  const e2 = await runEdit(pid, "NÃO altere o hero. Melhore apenas o footer.", files2);
  const htmlFinal = String(e2.files?.[names.find((n) => n.endsWith("index.html")) ?? ""] ?? "");
  const heroBeforeEdit = heroOf(String(files2[names.find((n) => n.endsWith("index.html")) ?? ""] ?? ""));
  const heroAfterFooterEdit = heroOf(htmlFinal);
  console.log("edit footer changed:", e2.changed, "| resumed:", (e2 as { resumed_session?: boolean }).resumed_session);
  console.log("hero intocado (footer edit):", heroBeforeEdit === heroAfterFooterEdit ? "SIM — bloco hero preservado" : "REVISAR — hero mudou");

  cleanupWorkspace(pid);
  const pass = g.status === "ok" && g.files && Object.keys(g.files).length >= 2 && !inventedHours && e1.changed === true;
  console.log("\n" + (pass ? "PASS: geração real + sem invenção factual" : "REVISAR"));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
