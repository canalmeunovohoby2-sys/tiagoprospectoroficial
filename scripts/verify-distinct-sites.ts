// Gera sites reais para 3 segmentos e confere que o HTML exportado usa
// composições de hero DISTINTAS (anti-template entre projetos).
import { buildSiteHtml } from "../src/lib/siteExportCore";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const SEGMENTS = [
  { name: "Pet Care Banho e Tosa", segment: "Pet Shop", city: "Guarulhos", state: "SP" },
  { name: "Restaurante do Zé", segment: "Restaurantes", city: "Suzano", state: "SP" },
  { name: "Aurora Advocacia", segment: "Advogados", city: "São Paulo", state: "SP" },
];

const results: Array<{ seg: string; hero: string; classes: string[]; sections: string }> = [];
for (const lead of SEGMENTS) {
  console.log(`=== gerando ${lead.segment}…`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240_000);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-site`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
    body: JSON.stringify({ lead }),
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.spec) { console.error("  ERRO", JSON.stringify(data).slice(0, 400)); continue; }
  const spec = data.spec as Record<string, unknown>;
  const hero = ((spec.design_system ?? {}) as Record<string, unknown>).hero_variant as string;
  const html = buildSiteHtml(spec, {});
  const heroClassMatch = html.match(/class="hero[^"]*"/);
  console.log(`  hero_variant=${hero} | qa=${data.qa_score} | heroClass=${heroClassMatch?.[0] ?? "?"}`);
  results.push({ seg: lead.segment, hero, classes: heroClassMatch?.[0] ?? "", sections: JSON.stringify((spec.sections as unknown[] ?? []).map((x) => (x as { type: string }).type)) });
}

const heros = new Set(results.map((r) => r.hero));
console.log("\nhero_variants distintos:", [...heros].join(", "));
const distinctHeroClasses = new Set(results.filter((r) => r.classes).map((r) => r.classes));
console.log("classes de hero no HTML distintas:", distinctHeroClasses.size);
const pass = heros.size >= 2 && distinctHeroClasses.size >= 2;
console.log(pass ? "\nPASS: composições distintas entre segmentos" : "\nREVISAR: ainda muito parecidos");
process.exit(pass ? 0 : 2);
