import { getNicheDesign } from "../supabase/functions/_shared/niche-design.ts";
import { getDesignDirective } from "../supabase/functions/_shared/design-directive.ts";
import { getImageNeeds } from "../supabase/functions/_shared/image-assets.ts";
import { premiumScore, qualityIssues } from "../supabase/functions/_shared/site-quality.ts";

const SEGMENTS = ["Pet Shop", "Clínicas", "Advogados", "Restaurantes", "Oficinas"];
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

let failures = 0;
for (const SEGMENT of SEGMENTS) {
  const lead = {
    name: "Empresa Teste",
    company_name: `Negócio ${SEGMENT}`,
    segment: SEGMENT,
    category: SEGMENT,
    city: "São Paulo",
    state: "SP",
    phone: "11900000000",
    whatsapp: "11900000000",
  };

  console.log(`\n=== ${SEGMENT} ===`);
  console.log(`[smoke] niche=${getNicheDesign(SEGMENT).cluster}`);
  console.log(`[smoke] directive=${getDesignDirective(SEGMENT).displayArchetype}`);
  console.log(`[smoke] imageDriven=${getImageNeeds(SEGMENT).imageDriven}`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 240_000);
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
    failures++;
    continue;
  }

  const spec = data.spec as Record<string, unknown> | undefined;
  const ds = (spec?.design_system ?? {}) as Record<string, unknown>;
  const motion = (ds.motion ?? {}) as Record<string, unknown>;
  const issues = qualityIssues(spec ?? {});
  const score = premiumScore(spec ?? {});

  console.log(`[smoke] model=${data.model}`);
  console.log(`[smoke] premium_score=${score}`);
  console.log(`[smoke] quality_issues=${JSON.stringify(issues)}`);
  console.log(`[smoke] motion=${JSON.stringify(motion)}`);
  console.log(`[smoke] sections=${JSON.stringify((spec?.sections as unknown[] ?? []).map((s) => (s as Record<string, unknown>).type))}`);
  console.log(`[smoke] hero_image=${JSON.stringify(((spec?.content as Record<string, unknown> ?? {}).hero as Record<string, unknown> ?? {}).image)}`);
  console.log(`[smoke] gallery_items=${JSON.stringify((((spec?.content as Record<string, unknown> ?? {}).gallery as Record<string, unknown> ?? {}).items as unknown[] ?? []).length)}`);

  if (issues.length > 0) {
    console.error("[smoke] FALHA: quality issues detectados");
    failures++;
  }
  if (score < 55) {
    console.error(`[smoke] FALHA: premium score ${score} < 55`);
    failures++;
  }
}

console.log(`\n=== RESULTADO: ${failures === 0 ? "TODOS OK" : `${failures} falhas`} ===`);
process.exit(failures > 0 ? 1 : 0);