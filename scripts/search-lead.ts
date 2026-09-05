// Busca real de leads (edge search-places) + avaliação de qualidade.
// Roda: npx tsx scripts/search-lead.ts
import { enrichLeadWithScores, sortLeadsByScore, buildScoreReasons } from "../src/lib/leadScoring";
import { calculateLeadROI } from "../src/lib/leadROI";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://efgwszjjtjebqdzziqfs.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0YsLRoaJR8p_Qk0ELK-Ghw_LbTc2q2g";

const q = { state: "SP", city: "Guarulhos", segment: "Pet shops", maxPages: 2, module: "landing_pages" };

console.log(`[busca] ${q.city}/${q.state} — ${q.segment}`);
const res = await fetch(`${SUPABASE_URL}/functions/v1/search-places`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
  body: JSON.stringify(q),
});
const data = await res.json().catch(() => ({}));
console.log(`[busca] HTTP ${res.status} | source=${data.source} | leads=${(data.leads ?? []).length} | search_status=${data.search_status ?? "?"}`);
if (!res.ok) {
  console.error("[busca] ERRO", JSON.stringify(data, null, 2));
  process.exit(1);
}
const warnings = (data.warnings ?? []).map((w: { code?: string; message: string }) => w.message).slice(0, 3);
if (warnings.length) console.log("[busca] warnings:", warnings.join(" | "));

const raw = (data.leads ?? []) as Array<Record<string, unknown>>;
if (raw.length === 0) { console.log("[busca] nenhum lead retornado"); process.exit(0); }

const enriched = raw.map((l) => enrichLeadWithScores(l as never));
const sorted = sortLeadsByScore(enriched as never);
// Ranking por final_score (qualidade real) para escolher o melhor lead.
const byFinal = [...enriched].sort((a, b) => ((b.final_score ?? 0) - (a.final_score ?? 0)));
console.log("\n=== RANKING POR FINAL_SCORE ===");
for (const l of byFinal.slice(0, 6)) {
  console.log(`  ${(l.final_score ?? 0).toString().padStart(3)} | ${String(l.score).padStart(3)} | ${String(l.name ?? "").slice(0, 42).padEnd(42)} | site:${l.has_website ? "sim" : "não"} | wa:${l.whatsapp ? "sim" : "não"} | ${l.city}`);
}
const top = byFinal[0] as unknown as Record<string, unknown>;
console.log("\n=== TOP LEAD ===");
console.log("nome:", top.name);
console.log("categoria:", top.category ?? top.segment ?? "?");
console.log("cidade:", top.city, "/", top.state);
console.log("phone:", top.phone ?? "—", "| whatsapp:", top.whatsapp ?? "—");
console.log("website:", top.website ?? "—", "| has_website:", top.has_website);
console.log("rating:", top.rating, "| reviews:", top.reviews_count);
console.log("score:", top.score, "| final_score:", top.final_score ?? 0);
console.log("money:", top.money_score ?? 0, "pain:", top.pain_score ?? 0, "intent:", top.intent_score ?? 0);
const reasons = ((top as { score_reasons?: string[] }).score_reasons?.length ? top.score_reasons : buildScoreReasons(top as never)).slice(0, 8) as string[];
console.log("reasons:", reasons.join(" • "));

const roi = calculateLeadROI(top as never);
console.log("\nROI:", { score: roi.score, tier: roi.tier });
console.log("temperatura:", (top.final_score ?? 0) >= 80 ? "HOT 🔥" : (top.final_score ?? 0) >= 50 ? "WARM" : "COLD");

// Gera site de teste p/ esse lead? (opcional — só valida pipeline de geração já feito). Aqui apenas avaliamos qualidade.
console.log("\nAvaliação de qualidade:", top.name?.slice(0, 60), "->", (top.final_score ?? 0) >= 80 ? "EXCELENTE (HOT)" : (top.final_score ?? 0) >= 50 ? "BOM (WARM)" : "RASO (COLD)");
