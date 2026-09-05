// Teste de repetibilidade (FASE 5.21): mesma academia gerada 3x para medir
// consistÃªncia de qualidade e detectar paradas prematuras/variÃ¢ncia.
import { cleanupWorkspace } from "../src/workspace";

const CTX = {
  name: "Academia Corpo Forte", segment: "Academias", city: "Mogi das Cruzes", state: "SP",
  whatsapp: "5511944443333", phone: "(11) 4444-3333",
  services: ["MusculaÃ§Ã£o", "Aulas coletivas", "Personal trainer", "AvaliaÃ§Ã£o fÃ­sica"],
};
const N = 3;

async function generate(run: number) {
  const pid = `acad-repro-${run}`;
  cleanupWorkspace(pid);
  const t0 = Date.now();
  const res = await fetch("http://127.0.0.1:8787/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: pid, context: CTX }),
  });
  const d = await res.json();
  const ms = Date.now() - t0;
  const files = (d.files ?? {}) as Record<string, string>;
  const html = files[Object.keys(files).find((k) => k.endsWith("index.html")) ?? ""] ?? "";
  const css = files[Object.keys(files).find((k) => k.endsWith("site.css")) ?? ""] ?? "";
  const activity = (d.activity ?? []) as Array<{ phase: string; detail: string }>;
  const phases = activity.map((a) => a.phase);
  const toolsUsed = [...new Set((d.events ?? []).map((e: string) => e))];
  // ferramentas de arquivo usadas (parseia event? server sÃ³ manda tipo). Usamos activity fases como proxy + reply
  const hasImages = (html.match(/<img[^>]+src=/gi) ?? []).length + (css.match(/url\(/gi) ?? []).length;
  const imgTags = (html.match(/<img[^>]+src=/gi) ?? []).length;
  const hasHero = /hero/i.test(html);
  const hasForm = /<form/i.test(html) || /input/i.test(html);
  const hasCta = /agend|matricul|come[çc]e|experimente|fale/i.test(html);
  const hasMedia = /@media/i.test(css || html);
  const usesBrowser = JSON.stringify(activity).includes("reading") || JSON.stringify(activity).toLowerCase().includes("browser") || (d.reply ?? "").toLowerCase().includes("navegador");
  const reviewCount = phases.filter((p) => p === "reviewing").length;
  return {
    run, pid, ms, status: d.status, files: Object.keys(files), htmlBytes: html.length,
    hasImages, imgTags, hasHero, hasForm, hasCta, hasMedia, reviewCount,
    gate_ok: d.gate_ok, gate_issues: (d.gate_issues ?? []).length,
    finish_skips: d.finish_skips, finish_blocked: d.finish_blocked,
    reply: (d.reply ?? "").slice(0, 160),
  };
}

async function main() {
  const out: Array<Awaited<ReturnType<typeof generate>>> = [];
  for (let i = 1; i <= N; i++) {
    console.log(`\n=== geraÃ§Ã£o ${i} ===`);
    const r = await generate(i);
    console.log(JSON.stringify({ ...r, reply: undefined }, null, 1));
    out.push(r);
  }
  const imgVariation = new Set(out.map((o) => o.hasImages)).size;
  const formVariation = new Set(out.map((o) => o.hasForm)).size;
  const browserVariation = new Set(out.map((o) => o.reviewCount)).size;
  console.log("\n=== resumo ===");
  for (const o of out) console.log(`run${o.run}: status=${o.status} files=${o.files.length} imgs=${o.hasImages} form=${o.hasForm} media=${o.hasMedia} review=${o.reviewCount} gate_ok=${o.gate_ok} finish_skips=${o.finish_skips} ms=${o.ms}`);
  console.log("variaÃ§Ã£o imagens:", imgVariation, "| variaÃ§Ã£o form:", formVariation, "| variaÃ§Ã£o revisÃµes:", browserVariation);
  out.forEach((o) => cleanupWorkspace(o.pid));
}
main().catch((e) => { console.error(e); process.exit(1); });


