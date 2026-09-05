// Testa o pipeline real de um lead escolhido (botão "Gerar Site"):
// briefing do lead -> generate-site (edge) -> QA -> e valida export HTML.
import { buildSiteHtml, buildSiteCss, buildSiteMainJs } from "../src/lib/siteExportCore";
import { qualityIssues, premiumScore, premiumQA } from "../supabase/functions/_shared/site-quality";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const lead = {
  name: "Pet Care - Banho e Tosa",
  company_name: "Pet Care Banho e Tosa",
  segment: "Pet Shop",
  category: "pet",
  city: "Guarulhos",
  state: "SP",
  phone: "+55 11 99340-4924",
  whatsapp: "5511993404924",
};

console.log("=== LEAD ESCOLHIDO ===");
console.log(JSON.stringify(lead, null, 2));

// 1) Gerar site (botão "Gerar Site")
console.log("\n[1/4] generate-site…");
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
console.log(`HTTP ${res.status} | model=${data.model} | premium=${data.premium_score} | qa=${data.qa_score}`);
if (!res.ok) { console.error(JSON.stringify(data).slice(0, 800)); process.exit(1); }
const spec = data.spec as Record<string, unknown>;

// 2) QA independente do spec retornado
console.log("\n[2/4] QA independente…");
const issues = qualityIssues(spec as never);
const pscore = premiumScore(spec as never);
const qa = premiumQA(spec as never);
console.log("quality_issues:", JSON.stringify(issues));
console.log("premium_score:", pscore, "| qa_score:", qa.score);
console.log("antiPdf:", JSON.stringify(qa.antiPdf), "| antiTemplate:", JSON.stringify(qa.antiTemplate));
const ok = issues.length === 0 && pscore >= 55 && qa.antiPdf.length === 0 && qa.antiTemplate.length === 0;

// 3) Export HTML (ZIP/baixar projeto)
console.log("\n[3/4] export HTML (ZIP)…");
const html = buildSiteHtml(spec as never, {});
const css = buildSiteCss();
const js = buildSiteMainJs();
console.log("html bytes:", html.length, "| css bytes:", css.length, "| js bytes:", js.length);
console.log("has doctype:", html.toLowerCase().includes("<!doctype html>"), "| has reveal:", html.includes("reveal"), "| has hero:", html.includes("hero"));

// 4) Resumo visual do que foi gerado
console.log("\n[4/4] resumo do site gerado…");
const ds = (spec.design_system ?? {}) as Record<string, unknown>;
const sections = (spec.sections as unknown[] ?? []).map((s) => (s as Record<string, unknown>).type);
const hero = (((spec.content ?? {}) as Record<string, unknown>).hero ?? {}) as Record<string, unknown>;
console.log("sections:", JSON.stringify(sections));
console.log("hero_variant:", ds.hero_variant, "| header:", ds.header_variant, "| footer:", ds.footer_style, "| gallery:", ds.gallery_variant);
console.log("hero image:", (hero.image as Record<string, unknown> | null)?.url ? "sim (contextual)" : "não");
console.log("\n" + (ok ? "PASS: pipeline do lead OK" : "REVISAR pipeline"));
process.exit(ok ? 0 : 2);
