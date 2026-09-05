// Smoke-test real da edge function generate-site contra a API da Supabase.
// Roda com: npx tsx scripts/smoke-generate-site.ts <segmento>
// Ex.: npx tsx scripts/smoke-generate-site.ts "Pet Shop"
// Requer .env com VITE_SUPABASE_URL e uma secret GEMINI_API_KEY configurada na edge.

import { getNicheDesign } from "../supabase/functions/_shared/niche-design.ts";
import { getDesignDirective } from "../supabase/functions/_shared/design-directive.ts";
import { getImageNeeds } from "../supabase/functions/_shared/image-assets.ts";
import { premiumScore, qualityIssues, premiumQA, PREMIUM_QA_MIN } from "../supabase/functions/_shared/site-quality.ts";

const SEGMENT = process.argv[2] || "Pet Shop";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const lead = {
  name: "Pet Shop Teste",
  company_name: "Pata Pet Banho & Tosa",
  segment: SEGMENT,
  category: SEGMENT,
  city: "Guarulhos",
  state: "SP",
  phone: "11900000000",
  whatsapp: "11900000000",
};

console.log(`[smoke] segmento=${SEGMENT}`);
console.log(`[smoke] niche=${getNicheDesign(SEGMENT).cluster}`);
console.log(`[smoke] directive=${getDesignDirective(SEGMENT).displayArchetype}`);
console.log(`[smoke] imageDriven=${getImageNeeds(SEGMENT).imageDriven}`);

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 180_000);
let res: Response;
try {
  res = await fetch(`${SUPABASE_URL}/functions/v1/generate-site`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ lead }),
    signal: ctrl.signal,
  });
} finally {
  clearTimeout(timer);
}

console.log(`[smoke] HTTP ${res.status}`);
const data = await res.json().catch(() => ({})) as Record<string, unknown>;
if (!res.ok) {
  console.error("[smoke] ERRO", JSON.stringify(data, null, 2));
  process.exit(1);
}

const spec = data.spec as Record<string, unknown> | undefined;
const ds = (spec?.design_system ?? {}) as Record<string, unknown>;
const motion = (ds.motion ?? {}) as Record<string, unknown>;
const issues = qualityIssues(spec ?? {});
const score = premiumScore(spec ?? {});
const qa = premiumQA(spec ?? {});

console.log(`[smoke] model=${data.model}`);
  console.log(`[smoke] premium_score=${score}`);
  console.log(`[smoke] qa_score=${data.qa_score ?? qa.score}`);
  console.log(`[smoke] quality_issues=${JSON.stringify(issues)}`);
  console.log(`[smoke] qa_anti_pdf=${JSON.stringify(qa.antiPdf)}`);
  console.log(`[smoke] qa_anti_template=${JSON.stringify(qa.antiTemplate)}`);
  console.log(`[smoke] motion=${JSON.stringify(motion)}`);
  console.log(`[smoke] design_system_keys=${JSON.stringify(Object.keys(ds))}`);
  console.log(`[smoke] header_variant=${ds.header_variant} footer=${ds.footer_style} gallery=${ds.gallery_variant} button=${ds.button_style}`);
  console.log(`[smoke] sections=${JSON.stringify((spec?.sections as unknown[] ?? []).map((s) => (s as Record<string, unknown>).type))}`);
console.log(`[smoke] hero_image=${JSON.stringify(((spec?.content as Record<string, unknown> ?? {}).hero as Record<string, unknown> ?? {}).image)}`);
console.log(`[smoke] gallery_items=${JSON.stringify((((spec?.content as Record<string, unknown> ?? {}).gallery as Record<string, unknown> ?? {}).items as unknown[] ?? []).length)}`);

if (issues.length > 0) {
  console.error("[smoke] FALHA: quality issues detectados");
  process.exit(2);
}
if (score < 55) {
  console.error(`[smoke] FALHA: premium score ${score} < 55`);
  process.exit(3);
}
if ((data.qa_score as number | undefined) === undefined && qa.score < PREMIUM_QA_MIN) {
  console.error(`[smoke] FALHA: qa score ${qa.score} < ${PREMIUM_QA_MIN}`);
  process.exit(4);
}
console.log("[smoke] OK");